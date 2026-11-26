import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobInput, RawJob } from "@easyjobs/contract";
import { applyFields, DEFAULT_LLM_MODEL, enrichWithLLM, ENRICH_TOOL, needsEnrichment, normalizeJob, resetLlmState, validateFields, type LlmClient } from "../src/index";

const now = new Date("2026-11-26T00:00:00Z");
const lowConfidenceRaw: RawJob = {
  source: "coursejoiner",
  sourceKind: "aggregator",
  sourceJobId: "1",
  sourceUrl: "https://coursejoiner.com/acme-hiring/",
  target: null,
  applyUrl: "https://careers.acme.com/jobs/analyst-role-2041",
  title: "Team Member",
  company: "Acme",
  locations: ["Pune"],
  descriptionHtml:
    "<p>Acme is hiring an associate for our analytics team. You will work on reporting, dashboards and client communication with the operations team every week.</p>",
  postedAt: "2026-11-25T00:00:00Z",
};

function job(): JobInput {
  return normalizeJob(lowConfidenceRaw, { now });
}

const GOOD_FIELDS = {
  experienceLevel: "fresher",
  experienceMin: 0,
  experienceMax: 1,
  batches: [2025, 2026],
  degrees: ["B.Com", "BBA"],
  skills: ["ms-excel", "Power BI", "SQL"],
  category: "data_ai",
};

function fakeClient(reply: Partial<Anthropic.Message> | Error): LlmClient & { calls: Anthropic.MessageCreateParamsNonStreaming[] } {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        if (reply instanceof Error) throw reply;
        return reply as Anthropic.Message;
      },
    },
  };
}

const toolReply = (input: unknown): Partial<Anthropic.Message> => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id: "toolu_1", name: "record_job_fields", input, caller: undefined } as unknown as Anthropic.ToolUseBlock],
});

let cacheDir = "";
beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "normalize-llm-"));
  resetLlmState();
});
afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("gating", () => {
  it("only low-confidence records with enough text need enrichment", () => {
    expect(needsEnrichment(job())).toBe(true);
    const confident = normalizeJob({ ...lowConfidenceRaw, title: "Senior Java Developer", descriptionHtml: `<p>${"Java Spring Boot microservices on AWS. ".repeat(6)}</p>` }, { now });
    expect(needsEnrichment(confident)).toBe(false);
    expect(needsEnrichment(normalizeJob({ ...lowConfidenceRaw, descriptionHtml: "<p>Short.</p>" }, { now }))).toBe(false);
  });

  it("is a no-op without ANTHROPIC_API_KEY (and never loads the SDK request path)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const j = job();
    expect(await enrichWithLLM(j, { cacheDir })).toBe(j);
  });

  it("skips high-confidence records unless forced", async () => {
    const client = fakeClient(toolReply(GOOD_FIELDS));
    const confident = normalizeJob({ ...lowConfidenceRaw, title: "Senior Java Developer", descriptionHtml: `<p>${"Java Spring Boot microservices on AWS. ".repeat(6)}</p>` }, { now });
    expect(await enrichWithLLM(confident, { client, cacheDir })).toBe(confident);
    expect(client.calls).toHaveLength(0);
    await enrichWithLLM(confident, { client, cacheDir, force: true });
    expect(client.calls).toHaveLength(1);
  });
});

describe("request shape (Claude Haiku 5.5, strict tool use)", () => {
  it("sends a forced, strict tool call with low effort and no sampling params", async () => {
    const client = fakeClient(toolReply(GOOD_FIELDS));
    await enrichWithLLM(job(), { client, cacheDir });
    const p = client.calls[0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(p.model).toBe("claude-haiku-5-5");
    expect(DEFAULT_LLM_MODEL).toBe("claude-haiku-5-5");
    expect(p.tool_choice).toEqual({ type: "tool", name: "record_job_fields" });
    expect(p.output_config).toEqual({ effort: "low" });
    expect(p.max_tokens).toBeGreaterThan(0);
    expect(p).not.toHaveProperty("temperature");
    expect(p).not.toHaveProperty("top_p");
    expect(p).not.toHaveProperty("top_k");
    const tool = (p.tools as Anthropic.Tool[])[0] as Anthropic.Tool;
    expect(tool).toBe(ENRICH_TOOL);
    expect(tool.strict).toBe(true);
    const schema = tool.input_schema as unknown as { additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
    expect(schema.additionalProperties).toBe(false);
    expect(new Set(schema.required)).toEqual(new Set(Object.keys(schema.properties)));
    expect(JSON.stringify(schema)).not.toMatch(/"(?:minimum|maximum|minLength|maxLength|minItems|maxItems)"/);
    const msg = p.messages[0] as Anthropic.MessageParam;
    expect(msg.role).toBe("user");
    expect(String(msg.content)).toContain("Title: Team Member");
    expect(String(msg.content)).toContain("<posting>");
  });
  it("honours NORMALIZE_LLM_MODEL", async () => {
    vi.stubEnv("NORMALIZE_LLM_MODEL", "claude-sonnet-5-5");
    const client = fakeClient(toolReply(GOOD_FIELDS));
    await enrichWithLLM(job(), { client, cacheDir });
    expect(client.calls[0]?.model).toBe("claude-sonnet-5-5");
  });
});

describe("merging and caching", () => {
  it("fills only low-confidence/empty fields and never touches identity fields", async () => {
    const before = job();
    const client = fakeClient(toolReply({ ...GOOD_FIELDS, title: "HACKED", company: "Evil", applyUrl: "https://evil.example" }));
    const after = await enrichWithLLM(before, { client, cacheDir });
    expect(after).toMatchObject({
      experienceLevel: "fresher",
      experienceMin: 0,
      experienceMax: 1,
      batches: [2025, 2026],
      degrees: ["B.Com", "BBA"],
      category: "data_ai",
      title: before.title,
      company: before.company,
      applyUrl: before.applyUrl,
      fingerprint: before.fingerprint,
    });
    expect(after.skills).toEqual(before.skills.length > 0 ? before.skills : ["Excel", "Power BI", "SQL"]);
    expect(after.extra.normalize).toMatchObject({ llm: { model: "claude-haiku-5-5", cached: false } });
  });

  it("caches by fingerprint on disk and reuses the answer", async () => {
    const client = fakeClient(toolReply(GOOD_FIELDS));
    const j = job();
    await enrichWithLLM(j, { client, cacheDir });
    const files = readdirSync(cacheDir);
    expect(files).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(cacheDir, files[0] as string), "utf8"))).toMatchObject({ model: "claude-haiku-5-5", fields: { category: "data_ai" } });
    const again = await enrichWithLLM(j, { client, cacheDir });
    expect(client.calls).toHaveLength(1);
    expect(again.extra.normalize).toMatchObject({ llm: { cached: true } });
    // A different model doesn't reuse another model's cache entry.
    await enrichWithLLM(j, { client, cacheDir, model: "claude-sonnet-5-5" });
    expect(client.calls).toHaveLength(2);
  });

  it("cacheOnly applies cached answers but never calls the API (spent budgets)", async () => {
    const client = fakeClient(toolReply(GOOD_FIELDS));
    const j = job();
    expect(await enrichWithLLM(j, { client, cacheDir, cacheOnly: true })).toBe(j);
    expect(client.calls).toHaveLength(0);
    await enrichWithLLM(j, { client, cacheDir });
    const fromCache = await enrichWithLLM(j, { client, cacheDir, cacheOnly: true });
    expect(client.calls).toHaveLength(1);
    expect(fromCache.extra.normalize).toMatchObject({ llm: { cached: true } });
    expect(fromCache.category).toBe("data_ai");
  });

  it("returns the job unchanged on refusal, truncation, invalid output or API errors", async () => {
    const j = job();
    for (const reply of [
      { stop_reason: "refusal", content: [] } as Partial<Anthropic.Message>,
      { stop_reason: "max_tokens", content: [] } as Partial<Anthropic.Message>,
      toolReply({ ...GOOD_FIELDS, experienceLevel: "wizard" }),
      { stop_reason: "end_turn", content: [{ type: "text", text: "no tool" } as Anthropic.TextBlock] } as Partial<Anthropic.Message>,
      new Error("network down"),
    ]) {
      const log = vi.fn();
      expect(await enrichWithLLM(j, { client: fakeClient(reply), cacheDir: null, log })).toBe(j);
      expect(log).toHaveBeenCalled();
    }
  });
});

describe("validateFields / applyFields", () => {
  it("validates enums, clamps years, swaps min/max and canonicalizes lists", () => {
    expect(validateFields({ ...GOOD_FIELDS, experienceMin: 5, experienceMax: 2, batches: [2026, "x", 1900], skills: ["reactjs", "React"] })).toEqual({
      experienceLevel: "fresher",
      experienceMin: 2,
      experienceMax: 5,
      batches: [2026],
      degrees: ["B.Com", "BBA"],
      skills: ["React"],
      category: "data_ai",
    });
    expect(validateFields({ ...GOOD_FIELDS, category: "astrology" })).toBeNull();
    expect(validateFields("nope")).toBeNull();
  });
  it("keeps existing years and high-confidence levels", () => {
    const j = {
      ...job(),
      experienceLevel: "mid",
      category: "software_engineering",
      experienceMin: 3,
      experienceMax: 5,
      extra: { normalize: { confidence: { level: "high", category: "high" } } },
    } as JobInput;
    const fields = validateFields(GOOD_FIELDS);
    if (!fields) throw new Error("fields");
    const out = applyFields(j, fields, { model: "m", cached: false });
    expect(out).toMatchObject({ experienceMin: 3, experienceMax: 5, experienceLevel: j.experienceLevel, category: j.category });
  });
});
