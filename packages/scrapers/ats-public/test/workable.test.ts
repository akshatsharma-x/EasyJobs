import { describe, expect, it } from "vitest";
import { groupWorkableJobs, mapWorkableJob, workableAccountUrl, workableLocations, workableToken } from "../src/adapters/workable";
import { workableScraper } from "../src/index";
import { byId, collect, ctx, expectAllValid, fakeHttp, fixtureJson, json, manifest, notFound, target } from "./helpers";

const m = manifest.workable!;
const t = (slug: string) => target({ slug, ats: "workable", token: slug });

async function scrape(account: string) {
  const http = fakeHttp({ [workableAccountUrl(account)]: json(fixtureJson(`workable/${account}.json`)) });
  const jobs = await collect(workableScraper.scrape(ctx(http, [t(account)])));
  expectAllValid(jobs);
  return { jobs, http };
}

describe("workable adapter", () => {
  it("merges the widget's one-entry-per-location duplicates into one job", async () => {
    const { jobs } = await scrape("covergo");
    const raw = fixtureJson("workable/covergo.json").jobs;
    expect(raw.length).toBe(8); // 2 shortcodes × 4 locations each
    expect(jobs).toHaveLength(2);
    expect(byId(jobs, m.multiLocationIndia!).locations).toEqual([
      "Bengaluru, Karnataka, India",
      "Hyderabad, Telangana, India",
      "Pune, Maharashtra, India",
      "Chennai, Tamil Nadu, India",
    ]);
  });

  it("maps telecommuting jobs as remote and drops a bare country next to its cities", async () => {
    const { jobs } = await scrape("covergo");
    const job = byId(jobs, m.remote!);
    expect(job).toMatchObject({ workMode: "remote", isRemote: true, jobType: "full_time", department: "Technology" });
    expect(job.locations).toEqual([
      "Makati City, National Capital Region, Philippines",
      "Taguig City, National Capital Region, Philippines",
      "Pasig City, National Capital Region, Philippines",
    ]);
    expect(job).toMatchObject({
      sourceUrl: "https://apply.workable.com/j/A2303FD77E",
      postedAt: "2026-11-16T00:00:00.000Z",
    });
    expect(job.extra?.applyFormUrl).toBe("https://apply.workable.com/j/A2303FD77E/apply");
  });

  it("maps an on-site Indian job and the Associate level", async () => {
    const { jobs } = await scrape("exponent-energy");
    const job = byId(jobs, m.indiaOnsite!);
    expect(job).toMatchObject({ isRemote: false, experienceLevel: "entry", experienceRaw: "Associate", locations: ["Bengaluru, Karnataka, India"] });
    expect(job.workMode).toBeUndefined(); // the widget cannot tell on-site from hybrid
  });

  it("maps 'Internship' experience to an internship even when employment says Temporary", async () => {
    const { jobs } = await scrape("exponent-energy");
    expect(byId(jobs, m.internship!)).toMatchObject({ title: "Graphic Design Intern", jobType: "internship", experienceLevel: "intern", employmentTypeRaw: "Temporary" });
  });

  it("joins description, requirements and benefits", () => {
    const job = mapWorkableJob(
      [{ shortcode: "ABC", title: "Engineer", description: "<p>Build</p>", requirements: "<ul><li>TS</li></ul>", benefits: "<p></p>", url: "https://apply.workable.com/j/ABC" }],
      t("acme"),
      "acme",
    );
    expect(job?.descriptionHtml).toBe("<p>Build</p>\n<h3>Requirements</h3>\n<ul><li>TS</li></ul>");
  });

  it("falls back to 'Remote' when a remote job only has hidden locations", () => {
    expect(workableLocations([{ shortcode: "X", telecommuting: true, locations: [{ country: "France", hidden: true }] }])).toEqual(["Remote"]);
  });

  it("logs an unknown account (404) once and finishes", async () => {
    const http = fakeHttp({ [workableAccountUrl("nope")]: notFound() });
    const c = ctx(http, [t("nope")]);
    expect(await collect(workableScraper.scrape(c))).toEqual([]);
    expect(c.log.lines.filter((l) => /board not found/.test(l.msg))).toHaveLength(1);
  });

  it("groups by shortcode in board order and ignores entries without one", () => {
    const groups = groupWorkableJobs([{ shortcode: "B" }, { shortcode: "A" }, { shortcode: "B" }, { shortcode: "" }]);
    expect(groups.map((g) => [g[0]!.shortcode, g.length])).toEqual([
      ["B", 2],
      ["A", 1],
    ]);
  });

  it("parses tokens", () => {
    expect(workableToken("huggingface")).toBe("huggingface");
    expect(workableToken("https://apply.workable.com/huggingface/")).toBe("huggingface");
    expect(workableToken("https://apply.workable.com/covergo/j/A2303FD77E/")).toBe("covergo");
    expect(workableToken("https://apply.workable.com/api/v1/widget/accounts/lokal-app")).toBe("lokal-app");
    expect(workableToken("https://acme.workable.com")).toBe("acme");
    expect(() => workableToken("https://apply.workable.com/j/A2303FD77E")).toThrow();
  });
});
