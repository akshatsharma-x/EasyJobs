import { describe, expect, it } from "vitest";
import { mapRemoteOkJob, remoteokScraper, type RemoteOkJob } from "../src/sources/remoteok";
import { collect, expectValidJobs, fakeHttp, fixture, fixtureJson, testCtx } from "./helpers";

const rows = fixtureJson<RemoteOkJob[]>("remoteok.json");
const byPosition = (p: string) => {
  const j = rows.find((x) => x.position === p);
  if (!j) throw new Error(`fixture "${p}" missing`);
  return j;
};

describe("remoteok · mapping (live capture 2026-11-26)", () => {
  it("skips the legal-notice row", () => {
    expect(rows[0]?.legal).toMatch(/link back/i);
    expect(mapRemoteOkJob(rows[0]!)).toBeNull();
  });

  it("keeps Worldwide/Asia roles with a followed link back to Remote OK", () => {
    const job = mapRemoteOkJob(byPosition("Region Head, Asia"));
    expect(job).toMatchObject({
      source: "remoteok",
      company: "Dropbox",
      locations: ["Remote (Asia)"],
      isRemote: true,
      tags: ["remote"],
      target: null,
    });
    // WHATWG URL lower-cases the host ("remoteOK.com" → "remoteok.com").
    expect(job?.applyUrl).toMatch(/^https:\/\/remoteok\.com\/remote-jobs\//);
    expect(job?.extra?.terms).toMatchObject({ followLinkRequired: true });
  });

  it("drops roles whose title, region or description excludes India", () => {
    expect(mapRemoteOkJob(byPosition("Senior Global Partner Specialist - USA"))).toBeNull();
    expect(mapRemoteOkJob(byPosition("Partner Sales Manager (Hindi Speaking) - Singapore"))).toBeNull();
    expect(mapRemoteOkJob(byPosition("Private Practice Enablement Specialist (PST)"))).toBeNull();
    expect(mapRemoteOkJob(byPosition("SEA P2P Business Development Specialist"))).toBeNull();
    // "Worldwide" label, but "open to candidates who reside in Atlanta, Georgia; …"
    expect(mapRemoteOkJob(byPosition("Associate, Payment Integrity"))).toBeNull();
    // Blank location = no evidence either way → skipped.
    expect(mapRemoteOkJob(byPosition("Revenue Operations Analyst"))).toBeNull();
  });

  it("repairs mojibake in descriptions", () => {
    const job = mapRemoteOkJob(byPosition("Senior Product Architect"));
    expect(job?.descriptionHtml).not.toMatch(/Â|â€/);
  });
});

describe("remoteok · scrape", () => {
  it("one request, valid jobs only for India/anywhere", async () => {
    const http = fakeHttp([{ match: "remoteok.com/api", body: fixture("remoteok.json") }]);
    const out = await collect(remoteokScraper, testCtx(http));
    expect(out).toHaveLength(5);
    expectValidJobs(out, remoteokScraper);
    expect(remoteokScraper.attribution).toMatch(/Remote OK/);
  });
});
