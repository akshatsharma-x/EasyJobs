import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSharedLimiters } from "../src/lib/limiter";
import { workdayScraper } from "../src/workday/scraper";
import { jsonldScraper } from "../src/jsonld/scraper";
import { collect, ctxFor, html, json, mockHttp, target } from "./helpers";

beforeEach(() => resetSharedLimiters());

const wd = target({ slug: "acme", ats: "workday", token: "https://acme.wd5.myworkdayjobs.com/Careers" });
const postings = [{ title: "Engineer", externalPath: "/job/India-Pune/Engineer_JR1", locationsText: "India, Pune", postedOn: "Posted Today" }];

describe("worker hooks (apps/worker, proposed for the contract)", () => {
  it("anti-bot block → report('blocked', retryAt), no throw, stats reported", async () => {
    let n = 0;
    const http = mockHttp((url, call) => {
      if (call.method === "POST") return n++ === 0 ? json({ total: 40, jobPostings: postings, facets: [] }) : html("Enable JavaScript and cookies to continue", 429, { "cf-mitigated": "challenge" });
      return json({ jobPostingInfo: { title: "Engineer", jobDescription: "<p>x</p>" } });
    });
    const report = vi.fn();
    const ctx = Object.assign(ctxFor(http, [wd]), { report, markIncomplete: vi.fn() });
    const { jobs, error } = await collect(workdayScraper.scrape(ctx));
    expect(error).toBeNull();
    expect(jobs).toHaveLength(1);
    const blocked = report.mock.calls.find((c) => c[0] === "blocked");
    expect(blocked?.[1]?.reason).toMatch(/anti-bot challenge/);
    expect(Date.parse(blocked?.[1]?.retryAt)).toBeGreaterThan(Date.now());
    expect(report.mock.calls.some((c) => typeof c[0] === "object" && c[0].emitted === 1)).toBe(true);
  });

  it("incomplete crawl with jobs → markIncomplete, no throw; nothing emitted → still throws", async () => {
    const site = (failAll: boolean) =>
      mockHttp((url) => {
        if (url.pathname === "/robots.txt") return html("User-agent: *");
        if (url.pathname === "/sitemap.xml") return html("<urlset><url><loc>https://jobs.acme.test/job/a/1001</loc></url><url><loc>https://jobs.acme.test/job/b/1002</loc></url></urlset>");
        if (url.pathname === "/job/a/1001" && !failAll) return html('<script type="application/ld+json">{"@type":"JobPosting","title":"A"}</script>');
        if (url.pathname.startsWith("/job/")) return html("down", 500);
        return html("", 404);
      });
    const t = target({ slug: "acme", ats: "jsonld", token: "https://jobs.acme.test/" });
    const known = (id: string) => id === "jobs.acme.test:1002";
    const markIncomplete = vi.fn();
    const ok = await collect(jsonldScraper.scrape(Object.assign(ctxFor(site(false), [t], { isKnown: known }), { markIncomplete })));
    expect(ok.error).toBeNull();
    expect(ok.jobs.map((j) => j.title)).toEqual(["A"]);
    expect(markIncomplete).toHaveBeenCalledWith(expect.stringMatching(/known job page/));
    const none = await collect(jsonldScraper.scrape(Object.assign(ctxFor(site(true), [t], { isKnown: () => true }), { markIncomplete: vi.fn() })));
    expect(none.jobs).toEqual([]);
    expect(String(none.error)).toMatch(/incomplete/);
  });

  it("light records are flagged extra.light", async () => {
    const http = mockHttp((url, call) => (call.method === "POST" ? json({ total: 1, jobPostings: postings, facets: [] }) : undefined));
    const { jobs } = await collect(workdayScraper.scrape(ctxFor(http, [wd], { isKnown: () => true })));
    expect(jobs[0]?.extra?.light).toBe(true);
    expect(jobs[0]?.descriptionHtml).toBeNull();
  });
});
