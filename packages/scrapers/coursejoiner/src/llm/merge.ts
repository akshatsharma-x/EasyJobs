/** Glue between the heuristic parser and the optional LLM extractor. */
import type { WpPost } from "../wp/types";
import { isJunkLine } from "../parse/dom";
import type { ParsedPost, ParseOverrides, PostAnalysis } from "../parse/post";
import type { RoleSpec } from "../parse/roles";
import type { LlmExtraction, LlmInput } from "./extract";

/** Low-confidence results (or recoverable skips) are worth a second opinion. */
export function shouldUseLlm(parsed: ParsedPost, threshold = 0.6): boolean {
  if (parsed.status === "jobs") return parsed.confidence < threshold;
  return /^(?:no company|no role|no external apply link)$/.test(parsed.reason ?? "");
}

export function buildLlmInput(post: WpPost, analysis: PostAnalysis): LlmInput {
  const text = analysis.model.lines
    .filter((l) => !l.inFaq && !isJunkLine(l, analysis.selfHost))
    .map((l) => (l.headingLevel > 0 ? `\n## ${l.text}` : l.text))
    .join("\n");
  const links = analysis.cands.slice(0, 25).map((c, index) => ({
    index,
    url: c.url,
    anchor: c.link.text.slice(0, 120),
    context: `${c.link.before.slice(-80)} [link] ${c.link.after.slice(0, 60)}`.trim(),
  }));
  return { cacheKey: `${post.id}:${post.modifiedGmt}`, title: post.title, categories: post.categories.map((c) => c.slug), text, links };
}

export function llmOverrides(out: LlmExtraction, analysis: PostAnalysis): ParseOverrides | null {
  if (!out.is_job_posting || !out.company || out.roles.length === 0) return null;
  const roles: RoleSpec[] = [];
  for (const r of out.roles.slice(0, 10)) {
    if (!r.title?.trim()) continue;
    const cand = r.apply_link_index !== null ? analysis.cands[r.apply_link_index] : undefined;
    const fields: RoleSpec["fields"] = {};
    if (r.experience) fields.experience = r.experience;
    if (r.salary) fields.salary = r.salary;
    if (r.batches.length > 0) fields.batch = r.batches.join(", ");
    if (r.last_date) fields.lastDate = r.last_date;
    if (r.job_type !== "unknown") fields.jobType = r.job_type.replace("_", " ");
    roles.push({ title: r.title.trim(), applyUrl: cand?.url ?? null, locations: r.locations.length > 0 ? r.locations : undefined, fields, source: "anchors" });
  }
  if (roles.length === 0 || !roles.some((r) => r.applyUrl)) return null;
  return { company: out.company.trim(), roles, source: "llm" };
}
