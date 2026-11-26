import { describe, expect, it } from "vitest";
import { jobTypeForRole, looksLikePersonName, parseHnComment, splitPlaces, splitRoles, type HnItem, type HnPost } from "../src/sources/hn/parse";
import { hnPostToJobs, hnWhoIsHiringScraper, pickThreads, type AlgoliaSearchResponse } from "../src/sources/hn-whoishiring";
import { collect, expectValidJobs, fakeHttp, fixture, fixtureJson, testCtx } from "./helpers";

const post = (text: string, id = 1): HnPost => {
  const r = parseHnComment({ id, text, created_at: "2026-11-02T16:01:43.000Z" });
  if ("skip" in r) throw new Error(`skipped: ${r.skip}`);
  return r.post;
};

describe("hn · header parsing", () => {
  it("classic 'Company | Role | Location | REMOTE | type | salary | link'", () => {
    const p = post(
      'Simple Analytics | DevOps Engineer | REMOTE (worldwide, any timezone) | Full-time, 32h | €5,000&#x2F;month | <a href="https:&#x2F;&#x2F;www.simpleanalytics.com&#x2F;jobs&#x2F;devops" rel="nofollow">https:&#x2F;&#x2F;www.simpleanalytics.com&#x2F;jobs&#x2F;devops</a><p>We are hiring.',
    );
    expect(p).toMatchObject({
      company: "Simple Analytics",
      roles: ["DevOps Engineer"],
      remote: true,
      remoteScope: "anywhere",
      workMode: "remote",
      salaryRaw: "€5,000/month",
      bestLink: "https://www.simpleanalytics.com/jobs/devops",
      companyDomain: "simpleanalytics.com",
      postedAt: "2026-11-02T16:01:43.000Z",
    });
  });

  it("YC batch, multi-role split, office + remote region", () => {
    const p = post("Synteq (YC W24) | Growth Lead &amp; Systems Administrator | Austin, TX | REMOTE (US) | Full-time");
    expect(p).toMatchObject({ company: "Synteq", ycBatch: "W24", roles: ["Growth Lead", "Systems Administrator"], locations: ["Austin, TX"], remoteRegions: ["US"], remoteScope: "restricted" });
  });

  it("place first, company second", () => {
    expect(post("Cologne, Germany | UMH | Product Engineer | Full-time | ONSITE").company).toBe("UMH");
  });

  it("office location vs remote region in one segment", () => {
    const p = post("River | Staff Engineers (Elixir) | NYC or REMOTE (US, Europe, South America) | Full-Time");
    expect(p.locations).toEqual(["New York, NY"]);
    expect(p.remoteRegions).toEqual(["US, Europe, South America"]);
  });

  it("taglines, visa notes and type segments are not roles", () => {
    const p = post("PostHog | Full-Time | Technical CSMs, SRE, Product Manager | REMOTE (all remote) | PostHog makes your product self-driving.");
    expect(p.roles).toEqual(["Technical CSMs", "SRE", "Product Manager"]);
    expect(post("Curiosity | Forward Deployed Engineer | Toulouse, France | ONSITE | Visa support").roles).toEqual(["Forward Deployed Engineer"]);
  });

  it("no role in the header → roles from body bullets, else 'Multiple roles'", () => {
    const p = post(
      'Acme | Berlin | ONSITE<p>Open positions:<p>- Senior Backend Engineer: <a href="https:&#x2F;&#x2F;jobs.ashbyhq.com&#x2F;acme&#x2F;1">https:&#x2F;&#x2F;jobs.ashbyhq.com&#x2F;acme&#x2F;1</a><p>- Product Designer: <a href="https:&#x2F;&#x2F;jobs.ashbyhq.com&#x2F;acme&#x2F;2">https:&#x2F;&#x2F;jobs.ashbyhq.com&#x2F;acme&#x2F;2</a>',
    );
    expect(p.roles).toEqual(["Senior Backend Engineer", "Product Designer"]);
    expect(p.roleLinks).toEqual(["https://jobs.ashbyhq.com/acme/1", "https://jobs.ashbyhq.com/acme/2"]);
    expect(post("Shepherd (Series B) | ONSITE | San Francisco, CA").roles).toEqual(["Multiple roles"]);
  });

  it("skips closed posts, job seekers, header-less posts and personal names", () => {
    const skip = (text: string) => {
      const r = parseHnComment({ id: 9, text });
      return "skip" in r ? r.skip : null;
    };
    expect(skip("UPDATE (Nov 13): We&#x27;re no longer taking applications for these roles.<p>Acme | Engineer | Remote")).toBe("closed");
    expect(skip("Location: Example City\nRemote: Yes\nWilling to relocate: No")).toBe("job-seeker");
    expect(skip("DuckDuckGo - we are looking for candidates excited to join us")).toBe("no-header");
    expect(skip("Rahul Example | Software Engineer | India | linkedin")).toBe("job-seeker");
    expect(skip("SEEKING FREELANCER | Devops Engineer | REMOTE (UK or EU)")).toBe("no-company");
    expect(skip("")).toBe("deleted");
  });

  it("recruiter posts credit the employer after '@'", () => {
    expect(post("Erica Example | Talent Sourcer @ Footprint | New York, NY | ONSITE")).toMatchObject({ company: "Footprint", roles: ["Talent Sourcer"] });
  });

  it("helpers", () => {
    expect(splitRoles("Senior Software Engineer, Full Stack")).toEqual(["Senior Software Engineer, Full Stack"]);
    expect(splitRoles("Engineering, Product & Data")).toEqual(["Multiple roles: Engineering, Product & Data"]);
    expect(splitRoles("Software Engineer, Deployment Strategist")).toEqual(["Software Engineer", "Deployment Strategist"]);
    expect(splitPlaces("San Francisco, CA / New York, NY or Zurich, Switzerland")).toEqual(["San Francisco, CA", "New York, NY", "Zurich, Switzerland"]);
    expect(splitPlaces("SF / NYC")).toEqual(["San Francisco, CA", "New York, NY"]);
    expect(splitPlaces("Vancouver, BC, Canada")).toEqual(["Vancouver, BC, Canada"]);
    expect(jobTypeForRole("AI Engineer Intern", "Full-time")).toBe("internship");
    expect(jobTypeForRole("Backend Engineer", "Full time, Internships")).toBe("full_time");
    expect(looksLikePersonName("Hemant Singh")).toBe(true);
    expect(looksLikePersonName("Common Prefix")).toBe(false);
    expect(looksLikePersonName("Prior Labs")).toBe(false);
  });
});

describe("hn · real thread fixture (Nov 2026, 30 comments, usernames redacted)", () => {
  const thread = fixtureJson<HnItem>("hn-thread.json");
  const parsed = (thread.children ?? []).map(parseHnComment);

  it("parses most posts and skips the closed / seeker / header-less ones", () => {
    const skips = parsed.filter((r) => "skip" in r).map((r) => ("skip" in r ? r.skip : ""));
    expect(skips.sort()).toEqual(["closed", "job-seeker", "job-seeker", "no-header"]);
    expect(parsed.length - skips.length).toBe(26);
  });

  it("multi-role posts sharing one generic link get applyUrl null (no fingerprint collisions)", () => {
    const synteq = parsed.map((r) => ("post" in r ? r.post : null)).find((p) => p?.company === "Synteq")!;
    const jobs = hnPostToJobs(synteq, { id: thread.id, title: thread.title ?? "", createdAtMs: 0 }, () => null);
    expect(jobs.map((j) => j.sourceJobId)).toEqual([`${synteq.commentId}:growth-lead`, `${synteq.commentId}:systems-administrator`]);
    expect(jobs.every((j) => j.applyUrl === null && typeof j.extra?.careersUrl === "string")).toBe(true);
  });
});

describe("hn · scrape", () => {
  const search = fixture("hn-search.json");
  const thread = fixture("hn-thread.json");

  it("picks the latest 'Who is hiring?' thread (not 'Who wants to be hired?')", () => {
    const threads = pickThreads(fixtureJson<AlgoliaSearchResponse>("hn-search.json").hits ?? []);
    expect(threads[0]?.title).toBe("Ask HN: Who is hiring? (November 2026)");
    expect(threads.every((t) => /Who is hiring\?/.test(t.title))).toBe(true);
  });

  it("emits valid jobs with sweep target 'whoishiring'; resolves shortened links once (cached)", async () => {
    const http = fakeHttp([
      { match: "search_by_date", body: search },
      { match: "/api/v1/items/", body: thread },
      { match: "https://grnh.se/7j1kydde6us", body: "", finalUrl: "https://job-boards.greenhouse.io/coreweave/jobs/4612345006" },
      { match: (u, init) => init?.method === "HEAD" || init?.method === "GET", body: "" },
    ]);
    const out = await collect(hnWhoIsHiringScraper, testCtx(http, { HN_PREVIOUS_THREAD_DAYS: "0" }));
    expectValidJobs(out, hnWhoIsHiringScraper);
    expect(out.every((j) => j.target === "whoishiring")).toBe(true);
    expect(out.every((j) => j.sourceUrl.startsWith("https://news.ycombinator.com/item?id="))).toBe(true);
    const coreweave = out.find((j) => j.company === "CoreWeave");
    expect(coreweave?.applyUrl).toBe("https://job-boards.greenhouse.io/coreweave/jobs/4612345006");
    // ATS links are already final: no request is spent on them.
    expect(http.calls.some((c) => c.url.startsWith("https://jobs.ashbyhq.com"))).toBe(false);
    expect(out.length).toBeGreaterThan(30);
  });

  it("HN_RESOLVE_LINKS=0 makes no requests beyond Algolia", async () => {
    const http = fakeHttp([
      { match: "search_by_date", body: search },
      { match: "/api/v1/items/", body: thread },
    ]);
    await collect(hnWhoIsHiringScraper, testCtx(http, { HN_RESOLVE_LINKS: "0", HN_PREVIOUS_THREAD_DAYS: "0" }));
    expect(http.calls.map((c) => new URL(c.url).host)).toEqual(["hn.algolia.com", "hn.algolia.com"]);
  });

  it("early in the month also reads last month's thread, skipping companies that reposted", async () => {
    const hits = fixtureJson<AlgoliaSearchResponse>("hn-search.json").hits ?? [];
    const latest = { ...hits[0]!, created_at_i: Math.floor(Date.now() / 1000) - 86_400 };
    const http = fakeHttp([
      { match: "search_by_date", body: JSON.stringify({ hits: [latest, ...hits.slice(1)] }) },
      { match: "/api/v1/items/", body: thread },
    ]);
    const out = await collect(hnWhoIsHiringScraper, testCtx(http, { HN_RESOLVE_LINKS: "0" }));
    expect(http.calls.filter((c) => c.url.includes("/items/"))).toHaveLength(2);
    // Same fixture served for both threads → every company already posted in the new one.
    const ids = out.map((j) => j.sourceJobId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("hn · privacy", () => {
  it("keeps role mailboxes, removes personal addresses from the stored description", async () => {
    const { redactPersonalEmails } = await import("../src/sources/hn/parse");
    const html = 'Email <a href="mailto:jane.doe@acme.com">jane.doe@acme.com</a> or jobs@acme.com, or hn+acme@example.org';
    const out = redactPersonalEmails(html);
    expect(out).not.toContain("jane.doe");
    expect(out).toContain("jobs@acme.com");
    expect(out).not.toContain("hn+acme@example.org");
    expect(out).toContain("[email in original post]");
  });

  it("unwraps the regex-literal role joke without touching normal slashes", () => {
    expect(splitRoles("/^Full-?stack Engineer$/i")).toEqual(["Full-stack Engineer"]);
    expect(splitRoles("Backend/ui Engineer")).toEqual(["Backend/ui Engineer"]);
  });
});

describe("hn · which links get resolved", () => {
  it("resolves shorteners/careers/homepages only", async () => {
    const { worthResolving } = await import("../src/sources/hn-whoishiring");
    expect(worthResolving("https://grnh.se/abc")).toBe(true);
    expect(worthResolving("https://acme.com/careers")).toBe(true);
    expect(worthResolving("https://acme.com")).toBe(true);
    expect(worthResolving("https://jobs.ashbyhq.com/acme/1")).toBe(false);
    expect(worthResolving("https://forms.gle/abc")).toBe(false);
    expect(worthResolving("https://www.ycombinator.com/companies/acme/jobs/1")).toBe(false);
  });
  it("strips a parenthetical salary from role titles", () => {
    expect(splitRoles("Senior Software Engineer (150-180k)")).toEqual(["Senior Software Engineer"]);
    expect(splitRoles("Staff Engineer, $200k - $250k")).toEqual(["Staff Engineer"]);
  });
});
