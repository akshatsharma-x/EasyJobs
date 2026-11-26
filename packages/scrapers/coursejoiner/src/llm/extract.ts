/**
 * Optional LLM extraction for low-confidence posts (only when ANTHROPIC_API_KEY is set and the site allows it).
 * Uses the latest small Claude model with a strict JSON schema; the model may only pick apply links by index from the
 * candidates we found (it can never invent a URL). Results are cached by post id + modified date.
 */
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { Logger } from "@easyjobs/contract/node";
import type { JsonStore } from "../util/store";

export const DEFAULT_LLM_MODEL = "claude-haiku-5-5";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_job_posting", "company", "roles"],
  properties: {
    is_job_posting: { type: "boolean", description: "true only for a real job/internship/apprenticeship opening with an application route" },
    company: { type: ["string", "null"], description: "Hiring company name as written (no 'Pvt Ltd' needed)" },
    roles: {
      type: "array",
      description: "One entry per distinct role/opening in the post",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "locations", "apply_link_index", "job_type", "experience", "salary", "batches", "last_date"],
        properties: {
          title: { type: "string", description: "Job title only, without company, year, location or 'apply now'" },
          locations: { type: "array", items: { type: "string" } },
          apply_link_index: { type: ["integer", "null"], description: "Index into the provided candidate links, or null" },
          job_type: { type: "string", enum: ["internship", "full_time", "part_time", "contract", "apprenticeship", "unknown"] },
          experience: { type: ["string", "null"], description: "Experience requirement as written, e.g. '0-2 years', 'Freshers'" },
          salary: { type: ["string", "null"], description: "Salary/stipend as written, e.g. '₹4-6 LPA', '₹15,000/month'" },
          batches: { type: "array", items: { type: "integer" }, description: "Eligible graduation years" },
          last_date: { type: ["string", "null"], description: "Application deadline as written" },
        },
      },
    },
  },
} as const;

export interface LlmRole {
  title: string;
  locations: string[];
  apply_link_index: number | null;
  job_type: "internship" | "full_time" | "part_time" | "contract" | "apprenticeship" | "unknown";
  experience: string | null;
  salary: string | null;
  batches: number[];
  last_date: string | null;
}

export interface LlmExtraction {
  is_job_posting: boolean;
  company: string | null;
  roles: LlmRole[];
}

export interface LlmCandidateLink {
  index: number;
  url: string;
  anchor: string;
  context: string;
}

export interface LlmInput {
  cacheKey: string;
  title: string;
  categories: string[];
  text: string;
  links: LlmCandidateLink[];
}

export interface LlmExtractor {
  extract(input: LlmInput): Promise<LlmExtraction | null>;
  /** Calls made in this process (cache hits excluded). */
  readonly calls: number;
}

const SYSTEM = [
  "You extract structured job-posting data from Indian job-blog articles (internships, fresher jobs, off-campus drives).",
  "Only report facts stated in the article. Never guess a company, salary or deadline.",
  "Pick apply links only from the numbered candidate list, preferring the company's own careers/ATS page over job boards; use null if none fits.",
  "Courses, scholarships, quizzes, results, admit cards, news and hackathons are not job postings.",
].join(" ");

export function createLlmExtractor(opts: { apiKey: string; model?: string; store: JsonStore<LlmExtraction>; log: Logger; maxCalls?: number }): LlmExtractor {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 60_000 });
  const model = opts.model ?? DEFAULT_LLM_MODEL;
  const maxCalls = opts.maxCalls ?? 30;
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async extract(input) {
      const cached = opts.store.get(input.cacheKey);
      if (cached) return cached;
      if (calls >= maxCalls) return null;
      calls++;
      const links = input.links.map((l) => `[${l.index}] ${l.url}\n    anchor: ${l.anchor}\n    context: ${l.context}`).join("\n");
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 8000,
          system: SYSTEM,
          output_config: { effort: "low", format: jsonSchemaOutputFormat(SCHEMA) },
          messages: [
            {
              role: "user",
              content: `Title: ${input.title}\nCategories: ${input.categories.join(", ")}\n\nCandidate apply links:\n${links || "(none)"}\n\nArticle text:\n${input.text}`,
            },
          ],
        });
        if (response.stop_reason === "refusal" || !response.parsed_output) {
          opts.log.debug("llm returned no structured output", { stop: response.stop_reason });
          return null;
        }
        const out = response.parsed_output as LlmExtraction;
        opts.store.set(input.cacheKey, out);
        return out;
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError) opts.log.warn("llm rate limited — falling back to heuristics");
        else if (e instanceof Anthropic.AuthenticationError) opts.log.warn("llm authentication failed — check ANTHROPIC_API_KEY");
        else if (e instanceof Anthropic.APIError) opts.log.warn("llm request failed", { status: e.status, error: e.message });
        else opts.log.warn("llm request failed", { error: e instanceof Error ? e.message : String(e) });
        return null;
      }
    },
  };
}
