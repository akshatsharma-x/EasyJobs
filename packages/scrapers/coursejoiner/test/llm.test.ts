import { describe, expect, it } from "vitest";
import { createScrapeContext } from "@easyjobs/contract/node";
import { analyzePost, parsePost } from "../src/parse/post";
import { buildLlmInput, llmOverrides, shouldUseLlm } from "../src/llm/merge";
import type { LlmExtraction, LlmExtractor, LlmInput } from "../src/llm/extract";
import { createWpJobBlogScraper } from "../src/wp/scraper";
import { COURSEJOINER } from "../src/sites";
import { BLOG_HOSTS, fakeHttp, loadFixture, loadFixtures, parseContextFor, testLogger, wpRestRoute } from "./helpers";

const rbi = loadFixture("coursejoiner/39664"); // generic "Summer Intern" fallback → low confidence

function answer(input: LlmInput, index: number | null): LlmExtraction {
  return {
    is_job_posting: true,
    company: "Reserve Bank of India",
    roles: [{ title: "Summer Placement Intern", locations: ["Mumbai"], apply_link_index: index, job_type: "internship", experience: null, salary: "₹25,000 per month", batches: [], last_date: "15 December 2026" }],
  };
}

describe("optional LLM extraction", () => {
  it("is only consulted for low-confidence results or recoverable skips", () => {
    const ctx = parseContextFor("coursejoiner");
    expect(shouldUseLlm(parsePost(rbi.post, ctx))).toBe(true);
    expect(shouldUseLlm(parsePost(loadFixture("coursejoiner/40193").post, ctx))).toBe(false);
    expect(shouldUseLlm(parsePost(loadFixture("coursejoiner/40176").post, ctx))).toBe(false); // excluded category
  });

  it("turns structured output into overrides, taking apply URLs only from our candidates", () => {
    const ctx = parseContextFor("coursejoiner");
    const analysis = analyzePost(rbi.post, ctx);
    const input = buildLlmInput(rbi.post, analysis);
    expect(input.cacheKey).toBe(`39664:${rbi.post.modifiedGmt}`);
    const idx = input.links.findIndex((l) => l.url.includes("opportunities.rbi.org.in"));
    expect(idx).toBeGreaterThanOrEqual(0);

    const ov = llmOverrides(answer(input, idx), analysis);
    expect(ov).not.toBeNull();
    const res = parsePost(rbi.post, ctx, ov!);
    expect(res.jobs[0]).toMatchObject({ title: "Summer Placement Intern", locations: ["Mumbai"], applyUrl: input.links[idx]!.url, extra: expect.objectContaining({ llm: true }) });

    // Out-of-range index → no URL → no override (the model can't invent links).
    expect(llmOverrides(answer(input, 99), analysis)).toBeNull();
    expect(llmOverrides({ is_job_posting: false, company: null, roles: [] }, analysis)).toBeNull();
  });

  it("is wired into the scraper via an injectable extractor (no network, works without a key)", async () => {
    let calls = 0;
    const fake: LlmExtractor = {
      get calls() {
        return calls;
      },
      async extract(input) {
        calls++;
        return input.cacheKey.startsWith("39664:") ? answer(input, input.links.findIndex((l) => l.url.includes("rbi.org.in"))) : null;
      },
    };
    const http = fakeHttp(wpRestRoute(loadFixtures("coursejoiner").map((f) => f.fixture)));
    const scraper = createWpJobBlogScraper({ ...COURSEJOINER, minGapMs: 0 }, { cacheDir: null, now: () => new Date("2026-11-26T00:00:00Z"), llm: fake, extraBlogHosts: BLOG_HOSTS });
    const jobs = [];
    for await (const j of scraper.scrape(createScrapeContext({ http, log: testLogger(), env: {} }))) jobs.push(j);
    const job = jobs.find((j) => j.sourceJobId === "39664#1");
    expect(job?.title).toBe("Summer Placement Intern");
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(jobs.length); // only low-confidence posts
  });
});
