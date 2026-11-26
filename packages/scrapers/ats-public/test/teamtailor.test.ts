import { RobotsDisallowedError } from "@easyjobs/contract/node";
import { describe, expect, it } from "vitest";
import { parseTeamtailorRss, teamtailorFeedUrl, teamtailorJobId, teamtailorOrigin } from "../src/adapters/teamtailor";
import { teamtailorScraper } from "../src/index";
import { byId, collect, ctx, expectAllValid, fakeHttp, fixtureText, manifest, notFound, target, xml } from "./helpers";

const m = manifest.teamtailor!;
const t = (slug: string, token = slug) => target({ slug, ats: "teamtailor", token });

async function scrape(company: string) {
  const http = fakeHttp({ [teamtailorFeedUrl(teamtailorOrigin(company), 0)]: xml(fixtureText(`teamtailor/${company}.rss`)) });
  const jobs = await collect(teamtailorScraper.scrape(ctx(http, [t(company)])));
  expectAllValid(jobs);
  return { jobs, http };
}

describe("teamtailor adapter", () => {
  it("maps RSS items: ids from links, RFC-822 dates, decoded HTML, remoteStatus", async () => {
    const { jobs, http } = await scrape("lunar");
    expect(http.calls[0]!.init.robots).toBe(true);
    const job = byId(jobs, m.hybrid!);
    expect(job).toMatchObject({
      source: "teamtailor",
      title: "FCP Risk & Requirements Officer",
      sourceUrl: "https://jobs.lunar.app/jobs/8794741-fcp-risk-requirements-officer",
      postedAt: "2026-11-25T12:26:00.000Z", // "Wed, 25 Nov 2026 13:26:00 +0100"
      locations: ["Copenhagen, Denmark"],
      department: "FCP",
      workMode: "hybrid",
      isRemote: false,
    });
    expect(job.descriptionHtml).toMatch(/^<p>Banking hasn't changed much in decades/);
    expect(byId(jobs, m.onsite!)).toMatchObject({ workMode: "onsite", locations: ["Stockholm, Sweden"] });
    expect(byId(jobs, m.none!).workMode).toBeUndefined();
  });

  it("keeps every location of a multi-location job", async () => {
    const { jobs } = await scrape("tibber");
    const job = byId(jobs, m.multiLocation!);
    expect(job).toMatchObject({ locations: ["Berlin", "Stockholm"], department: "House of Product & Engineering" });
    expect(job.extra?.role).toBe("Engineering Manager");
  });

  it("paginates with per_page + offset and stops on a short page", async () => {
    const item = (i: number) =>
      `<item><title>Role ${i}</title><description>&lt;p&gt;Job ${i}&lt;/p&gt;</description><pubDate>Mon, 23 Nov 2026 09:47:40 +0100</pubDate><link>https://acme.teamtailor.com/jobs/${1000 + i}-role</link><guid>g-${i}</guid><remoteStatus>fully</remoteStatus></item>`;
    const feed = (from: number, n: number) =>
      `<?xml version="1.0"?><rss version="2.0" xmlns:tt="https://teamtailor.com/locations"><channel><title>Acme</title>${Array.from({ length: n }, (_, k) => item(from + k)).join("")}</channel></rss>`;
    const http = fakeHttp({
      "https://acme.teamtailor.com/jobs.rss": (url) => {
        const offset = Number(url.searchParams.get("offset"));
        return xml(offset === 0 ? feed(0, 100) : feed(100, 3));
      },
    });
    const jobs = await collect(teamtailorScraper.scrape(ctx(http, [t("acme")])));
    expect(jobs).toHaveLength(103);
    expect(http.urls()).toEqual([teamtailorFeedUrl("https://acme.teamtailor.com", 0), teamtailorFeedUrl("https://acme.teamtailor.com", 100)]);
    expect(jobs[0]).toMatchObject({ workMode: "remote", isRemote: true, locations: ["Remote"], descriptionHtml: "<p>Job 0</p>" });
  });

  it("stops when the feed ignores the offset", async () => {
    const items = Array.from({ length: 100 }, (_, i) => `<item><title>R${i}</title><link>https://acme.teamtailor.com/jobs/${i + 1}-r</link><guid>${i}</guid></item>`).join("");
    const http = fakeHttp({ "https://acme.teamtailor.com/jobs.rss": xml(`<rss><channel><title>A</title>${items}</channel></rss>`) });
    expect(await collect(teamtailorScraper.scrape(ctx(http, [t("acme")])))).toHaveLength(100);
    expect(http.calls).toHaveLength(2);
  });

  it("finishes cleanly when robots.txt forbids the feed (like polestar.teamtailor.com)", async () => {
    const http = fakeHttp({
      "https://polestar.teamtailor.com/jobs.rss": () => {
        throw new RobotsDisallowedError("https://polestar.teamtailor.com/jobs.rss?per_page=100&offset=0");
      },
    });
    const c = ctx(http, [t("polestar")]);
    expect(await collect(teamtailorScraper.scrape(c))).toEqual([]);
    expect(c.log.lines.some((l) => l.level === "warn" && /robots\.txt disallows/.test(l.msg))).toBe(true);
  });

  it("logs dead career sites once", async () => {
    const http = fakeHttp({ [teamtailorFeedUrl("https://gone.teamtailor.com", 0)]: notFound() });
    const c = ctx(http, [t("gone")]);
    expect(await collect(teamtailorScraper.scrape(c))).toEqual([]);
    expect(c.log.lines.filter((l) => /board not found/.test(l.msg))).toHaveLength(1);
  });

  it("parses ids, origins and channels", () => {
    expect(teamtailorJobId("https://jobs.lunar.app/jobs/8794741-fcp-risk", "guid")).toBe("8794741");
    expect(teamtailorJobId("https://jobs.lunar.app/careers/xyz", "guid-1")).toBe("guid-1");
    expect(teamtailorOrigin("lunar")).toBe("https://lunar.teamtailor.com");
    expect(teamtailorOrigin("https://jobs.lunar.app/jobs")).toBe("https://jobs.lunar.app");
    expect(parseTeamtailorRss('<rss><channel><title>Empty</title></channel></rss>')).toEqual([]);
    expect(() => parseTeamtailorRss("<html></html>")).toThrow();
  });
});
