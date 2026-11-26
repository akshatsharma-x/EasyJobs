import { describe, expect, it } from "vitest";
import {
  buildRawJob, decodeEntities, defineCareerSite, detectJobType, detectWorkMode, ensureHtml, extractJsonLdJobPostings,
  htmlToText, isIndiaLocation, isOpenToIndia, isRemoteOpenToIndia, joinSections, levelFromCategory, paginate,
  naiveToIso, parseAbsoluteDate, politeOptionsFromEnv, parseExperienceYears, parseRelativeDate, postedAtFrom, readableIndiaLocation, textToHtml, titleCase,
  toIsoDate, type CompanyInfo,
} from "../src/lib";
import { collect, fakeHttp } from "./helpers";

const NOW = new Date("2026-11-26T12:00:00Z");

describe("html", () => {
  it("decodes entities", () => {
    expect(decodeEntities("R&amp;D &lt;b&gt; &#8377;5 &#x2013; x&nbsp;y &bogus;")).toBe("R&D <b> \u20b95 \u2013 x y &bogus;");
  });
  it("converts HTML to text with bullets and paragraphs", () => {
    const text = htmlToText("<p>Hello&nbsp;<b>world</b></p><ul><li>One</li><li>Two</li></ul><script>x()</script>");
    expect(text).toBe("Hello world\n\n• One\n• Two");
    expect(htmlToText("&lt;p&gt;Escaped &amp;amp; ok&lt;/p&gt;")).toBe("Escaped & ok");
    expect(htmlToText("   ")).toBeNull();
  });
  it("turns text into HTML and keeps HTML as is", () => {
    expect(textToHtml("Intro line\n\n- a\n- b")).toBe("<p>Intro line</p>\n<ul><li>a</li><li>b</li></ul>");
    expect(ensureHtml("<p>x</p>")).toBe("<p>x</p>");
    expect(joinSections([{ title: "A", body: "x" }, { title: "Empty", body: "  " }])).toBe("<h3>A</h3>\n<p>x</p>");
  });
  it("extracts JSON-LD JobPosting (graph + arrays)", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":"JobPosting","title":"SDE"}]}</script>
      <script type="application/ld+json">[{"@type":"JobPosting","title":"Intern"}]</script>`;
    expect(extractJsonLdJobPostings(html).map((j) => j.title).sort()).toEqual(["Intern", "SDE"]);
  });
});

describe("dates", () => {
  it("parses absolute formats to UTC", () => {
    expect(parseAbsoluteDate("November 25, 2026")?.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(parseAbsoluteDate("25-Nov-2026")?.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(parseAbsoluteDate("03/04/2026")?.toISOString()).toBe("2026-04-03T00:00:00.000Z");
    expect(parseAbsoluteDate("03/04/2026", { dayFirst: false })?.toISOString()).toBe("2026-03-04T00:00:00.000Z");
    expect(parseAbsoluteDate("2026-11-25")?.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(parseAbsoluteDate("Wed, Nov 25th 2026")?.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(parseAbsoluteDate("Maybe 12, 2026")).toBeNull();
    expect(parseAbsoluteDate("Fri, 24 Jun 2022 12:00:00 IST")?.toISOString()).toBe("2022-06-24T06:30:00.000Z");
    expect(parseAbsoluteDate("24 Jun 2022 12:00 +0530")?.toISOString()).toBe("2022-06-24T06:30:00.000Z");
    expect(parseAbsoluteDate("Wed, 25 Nov 2026")?.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(parseAbsoluteDate("Sat Nov 14 02:00:00 UTC 2026")?.toISOString()).toBe("2026-11-14T02:00:00.000Z");
    expect(parseAbsoluteDate("Sun Feb 28 18:30:00 IST 2027")?.toISOString()).toBe("2027-02-28T13:00:00.000Z");
    expect(toIsoDate("2026-11-25T07:44:02.334-08:00")).toBe("2026-11-25T15:44:02.334Z");
    expect(toIsoDate(1795600000)).toBe(new Date(1795600000 * 1000).toISOString());
    expect(toIsoDate("/Date(1795600000000)/")).toBe(new Date(1795600000000).toISOString());
  });
  it("parses relative phrases", () => {
    const iso = (s: string) => parseRelativeDate(s, NOW)?.toISOString();
    expect(iso("Posted Today")).toBe(NOW.toISOString());
    expect(iso("Yesterday")).toBe("2026-11-25T12:00:00.000Z");
    expect(iso("Posted 3 Days Ago")).toBe("2026-11-23T12:00:00.000Z");
    expect(iso("30+ Days Ago")).toBe("2026-10-27T12:00:00.000Z");
    expect(iso("about 6 hours")).toBe("2026-11-26T06:00:00.000Z");
    expect(iso("an hour ago")).toBe("2026-11-26T11:00:00.000Z");
    expect(iso("2 weeks ago")).toBe("2026-11-12T12:00:00.000Z");
    expect(iso("Senior Engineer")).toBeUndefined();
  });
  it("reads zone-less timestamps in IST", () => {
    expect(naiveToIso("2026-11-25T09:20:20.183246")).toBe("2026-11-25T03:50:20.183Z");
    expect(naiveToIso("2026-11-25T09:20:20Z")).toBe("2026-11-25T09:20:20.000Z");
    expect(naiveToIso("2026-11-25T09:20:20", "+00:00")).toBe("2026-11-25T09:20:20.000Z");
    expect(naiveToIso(null)).toBeNull();
  });
  it("clamps posting dates", () => {
    expect(postedAtFrom("2026-11-27", { now: NOW })).toBe(NOW.toISOString());
    expect(postedAtFrom("2027-06-01", { now: NOW })).toBeNull();
  });
});

describe("hints", () => {
  it("detects job type, title beating schedule", () => {
    expect(detectJobType({ title: "Data Scientist I 6M Intern", employmentType: "full-time" })).toBe("internship");
    expect(detectJobType({ title: "International Sales Lead", employmentType: "Full time" })).toBe("full_time");
    expect(detectJobType({ title: "Engineer", employmentType: "Contract" })).toBe("contract");
    expect(detectJobType({ title: "Graduate Apprentice" })).toBe("apprenticeship");
    expect(detectJobType({ title: "Engineer" })).toBeUndefined();
  });
  it("maps site categories to levels", () => {
    expect(levelFromCategory("Students / University / Graduates")).toBe("fresher");
    expect(levelFromCategory("Internship")).toBe("intern");
    expect(levelFromCategory("Entry Level")).toBe("entry");
    expect(levelFromCategory("Early Career")).toBe("entry");
    expect(levelFromCategory("Mid-Level")).toBe("mid");
    expect(levelFromCategory("Professional")).toBeUndefined();
    expect(levelFromCategory("Experienced")).toBeUndefined();
  });
  it("detects work modes", () => {
    expect(detectWorkMode("Up to 50% work from home")).toBe("hybrid");
    expect(detectWorkMode("100% work from home")).toBe("remote");
    expect(detectWorkMode("Microsoft on-site only")).toBe("onsite");
    expect(detectWorkMode("Bengaluru")).toBeUndefined();
  });
  it("filters India and open remote locations", () => {
    expect(isIndiaLocation("Bengaluru, Karnataka")).toBe(true);
    expect(isIndiaLocation("IN, KA, Bengaluru")).toBe(true);
    expect(isIndiaLocation("Indianapolis, IN")).toBe(false);
    expect(isIndiaLocation("Gurugram")).toBe(true);
    expect(isRemoteOpenToIndia("Remote")).toBe(true);
    expect(isRemoteOpenToIndia("Remote - APAC - Remote")).toBe(true);
    expect(isRemoteOpenToIndia("Remote - United States")).toBe(false);
    expect(isOpenToIndia(["San Francisco, CA", "Remote - India"])).toBe(true);
    expect(isOpenToIndia(["Manila - Philippines"])).toBe(false);
    expect(isOpenToIndia([], true)).toBe(true);
  });
  it("formats Indian locations and title-cases", () => {
    expect(readableIndiaLocation("Bengaluru", "KA", "IN")).toBe("Bengaluru, Karnataka, India");
    expect(readableIndiaLocation("New Delhi", "National Capital Territory", "IN")).toBe("New Delhi, Delhi, India");
    expect(readableIndiaLocation("London", "ENG", "GB")).toBe("London, ENG, GB");
    expect(titleCase("BANGALORE")).toBe("Bangalore");
  });
  it("parses years of experience", () => {
    expect(parseExperienceYears("2-5 years")).toMatchObject({ min: 2, max: 5 });
    expect(parseExperienceYears("Minimum 3 years of Java")).toMatchObject({ min: 3, max: null });
    expect(parseExperienceYears("0 to 2 yrs")).toMatchObject({ min: 0, max: 2 });
    expect(parseExperienceYears("no years mentioned")).toBeNull();
  });
});

describe("politeness options", () => {
  it("uses the site floor, lets env only raise it, and 0 disables throttling", () => {
    expect(politeOptionsFromEnv({}).minGapMs).toBe(1000);
    expect(politeOptionsFromEnv({}, { minGapMs: 10_000 }).minGapMs).toBe(10_000);
    expect(politeOptionsFromEnv({ BIGTECH_MIN_GAP_MS: "1000" }, { minGapMs: 10_000 }).minGapMs).toBe(10_000);
    expect(politeOptionsFromEnv({ BIGTECH_MIN_GAP_MS: "2500" }).minGapMs).toBe(2500);
    expect(politeOptionsFromEnv({ BIGTECH_MIN_GAP_MS: "0" }, { minGapMs: 10_000 }).minGapMs).toBe(0);
    expect(politeOptionsFromEnv({}).cacheDir).toBeNull();
    expect(politeOptionsFromEnv({ BIGTECH_DEV_CACHE: "1" }).cacheDir).toMatch(/\.cache[\\/]http$/);
  });
});

describe("paginate", () => {
  it("stops on short pages, totals and repeated pages", async () => {
    const pages = [[1, 2], [3, 4], [5]];
    const got: number[] = [];
    for await (const n of paginate({ pageSize: 2, fetchPage: async (i) => ({ items: pages[i] ?? [] }) })) got.push(n);
    expect(got).toEqual([1, 2, 3, 4, 5]);
    const repeat: number[] = [];
    let calls = 0;
    for await (const n of paginate({ pageSize: 2, idOf: String, fetchPage: async () => (calls++, { items: [1, 2] }) })) repeat.push(n);
    expect(repeat).toEqual([1, 2]);
    expect(calls).toBe(2);
    const total: number[] = [];
    let tcalls = 0;
    for await (const n of paginate({ pageSize: 2, fetchPage: async (i) => (tcalls++, { items: [i * 2 + 1, i * 2 + 2], total: 4 }) })) total.push(n);
    expect(total).toEqual([1, 2, 3, 4]);
    expect(tcalls).toBe(2);
  });
});

describe("defineCareerSite", () => {
  const company: CompanyInfo = { slug: "acme", name: "Acme", domain: "acme.com", careersUrl: "https://acme.com/careers" };
  type Item = { id: string; title: string; loc: string };
  const items: Item[] = [
    { id: "1", title: "SDE", loc: "Bengaluru" },
    { id: "2", title: "SDE", loc: "Paris" },
    { id: "1", title: "dup", loc: "Bengaluru" },
    { id: "3", title: "", loc: "Pune" },
    { id: "4", title: "Analyst", loc: "Pune" },
    { id: "5", title: "PM", loc: "Remote" },
  ];
  const make = (detailCalls: string[]) =>
    defineCareerSite<Item, { html: string }>({
      company,
      name: "Acme Careers",
      intervalMinutes: 60,
      endpointType: "json",
      async *list() {
        yield* items;
      },
      idOf: (i) => i.id,
      keep: (i) => isOpenToIndia([i.loc]),
      detail: async (i) => {
        detailCalls.push(i.id);
        return { html: `<p>About ${i.title}</p>` };
      },
      toRawJob: (i, d) =>
        buildRawJob(company, { sourceJobId: i.id, title: i.title, sourceUrl: `https://acme.com/jobs/${i.id}`, locations: [i.loc], descriptionHtml: d?.html ?? null }),
    });

  it("dedupes, filters, validates and fetches details only for unknown ids", async () => {
    const calls: string[] = [];
    const site = make(calls);
    const jobs = await collect(site, { http: fakeHttp([]), isKnown: (id) => id === "4" });
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["1", "4", "5"]);
    expect(calls).toEqual(["1", "3", "5"]);
    expect(jobs.find((j) => j.sourceJobId === "4")?.descriptionHtml).toBeNull();
    expect(jobs.find((j) => j.sourceJobId === "1")?.descriptionText).toBe("About SDE");
    expect(site.lastRun).toMatchObject({ listed: 5, emitted: 3, skipped: 1, invalid: 1 });
  });

  it("defers unknown jobs beyond the detail cap", async () => {
    const calls: string[] = [];
    const jobs = await collect(make(calls), { http: fakeHttp([]), env: { BIGTECH_MAX_DETAILS: "1" } });
    expect(calls).toEqual(["1"]);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["1"]);
  });

  it("remembers jobs dropped after a detail fetch, but only in incremental runs", async () => {
    const calls: string[] = [];
    const site = defineCareerSite<Item, { closed: boolean }>({
      company, name: "x", intervalMinutes: 60, endpointType: "json",
      async *list() {
        yield* [{ id: "a", title: "Open", loc: "Pune" }, { id: "b", title: "Closed", loc: "Pune" }];
      },
      idOf: (i) => i.id,
      detail: async (i) => (calls.push(i.id), { closed: i.id === "b" }),
      toRawJob: (i, d) => (d?.closed ? null : buildRawJob(company, { sourceJobId: i.id, title: i.title, sourceUrl: `https://acme.com/${i.id}` })),
    });
    const incremental = { http: fakeHttp([]), isKnown: () => false };
    expect((await collect(site, incremental)).map((j) => j.sourceJobId)).toEqual(["a"]);
    expect(site.dropped.has("b")).toBe(true);
    await collect(site, incremental);
    expect(calls).toEqual(["a", "b", "a"]); // "b" is not re-fetched in the second incremental run
    await collect(site, { http: fakeHttp([]) }); // CLI-style run (no isKnown) ignores the memo
    expect(calls).toEqual(["a", "b", "a", "a", "b"]);
    site.dropped.clear();
  });

  it("respects BIGTECH_DISABLE and wraps list errors with the company id", async () => {
    const site = make([]);
    expect(site.isEnabled?.({ BIGTECH_DISABLE: "foo,acme" })).toBe(false);
    expect(site.isEnabled?.({})).toBe(true);
    const failing = defineCareerSite<Item>({
      company, name: "x", intervalMinutes: 60, endpointType: "json",
      // eslint-disable-next-line require-yield
      async *list() {
        throw new Error("boom");
      },
      idOf: (i) => i.id,
      toRawJob: () => null,
    });
    await expect(collect(failing, { http: fakeHttp([]) })).rejects.toThrow("acme: boom");
  });
});
