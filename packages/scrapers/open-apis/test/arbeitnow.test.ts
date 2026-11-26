import { describe, expect, it } from "vitest";
import { arbeitnowJobType, arbeitnowLevel, arbeitnowScraper, mapArbeitnowJob, type ArbeitnowResponse } from "../src/sources/arbeitnow";
import { collect, expectValidJobs, fakeHttp, fixture, fixtureJson, testCtx } from "./helpers";

const rows = fixtureJson<ArbeitnowResponse>("arbeitnow.json").data ?? [];

describe("arbeitnow · mapping (live capture 2026-11-26)", () => {
  it("keeps English, generic-remote roles as remote/anywhere", () => {
    const row = rows.find((r) => r.company_name === "Clipboard");
    expect(row).toBeDefined();
    expect(mapArbeitnowJob(row!)).toMatchObject({
      source: "arbeitnow",
      sourceJobId: row!.slug,
      title: "Strategy & Ops Lead, Applied AI",
      locations: ["Remote (Anywhere)"],
      isRemote: true,
      tags: ["remote"],
      jobType: "full_time",
    });
  });

  it("drops on-site roles, German-language roles and country-bound remote roles", () => {
    for (const r of rows.filter((x) => !x.remote)) expect(mapArbeitnowJob(r)).toBeNull();
    for (const r of rows.filter((x) => x.location === "Homeoffice")) expect(mapArbeitnowJob(r)).toBeNull();
    for (const r of rows.filter((x) => x.location === "Netherlands")) expect(mapArbeitnowJob(r)).toBeNull();
  });

  it("maps multilingual job_types", () => {
    expect(arbeitnowJobType(["Internship (praktikum)"])).toBe("internship");
    expect(arbeitnowJobType(["Werkstudent"])).toBe("part_time");
    expect(arbeitnowJobType(["Befristeter arbeitsvertrag"])).toBe("temporary");
    expect(arbeitnowJobType(["Unbefristeter arbeitsvertrag", "berufserfahren"])).toBe("full_time");
    expect(arbeitnowJobType(["Permanent employment contract (open-ended contract)"])).toBe("full_time");
    expect(arbeitnowJobType(["Contract"])).toBe("contract");
    expect(arbeitnowLevel(["berufseinstieg"])).toBe("entry");
    expect(arbeitnowLevel(["Full Time", "Mid"])).toBe("mid");
    expect(arbeitnowLevel(["Senior executive"])).toBe("executive");
  });
});

describe("arbeitnow · scrape", () => {
  it("pages until links.next is null and emits only eligible jobs", async () => {
    const http = fakeHttp([{ match: "job-board-api?page=1", body: fixture("arbeitnow.json") }]);
    const out = await collect(arbeitnowScraper, testCtx(http));
    expect(out).toHaveLength(8);
    expectValidJobs(out, arbeitnowScraper);
    expect(http.calls).toHaveLength(1);
  });

  it("stops paging once a whole page predates ctx.since", async () => {
    const page = fixtureJson<ArbeitnowResponse>("arbeitnow.json");
    const paged = JSON.stringify({ ...page, links: { next: "https://www.arbeitnow.com/api/job-board-api?page=2" } });
    const http = fakeHttp([{ match: "job-board-api?page=", body: paged }]);
    await collect(arbeitnowScraper, testCtx(http, {}, { since: new Date("2030-01-01T00:00:00Z") }));
    expect(http.calls).toHaveLength(1);
  });
});
