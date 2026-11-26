import { describe, expect, it } from "vitest";
import { domainRelation, judgeBoard, tenantPlausible, parseOracleToken, parseWorkdayToken, publicBoardUrl, workdayIndiaFacet, type BoardCheck } from "../scripts/lib/checks";

function check(more: Partial<BoardCheck>): BoardCheck {
  return {
    ats: "greenhouse",
    token: "acme",
    status: "ok",
    openJobs: 12,
    name: null,
    website: null,
    sample: "",
    detail: "",
    endpoint: "",
    checkedAt: "2026-11-26T00:00:00.000Z",
    ...more,
  };
}

describe("judgeBoard — does a board belong to the candidate company?", () => {
  const circle = { name: "Circle", domain: "circle.com" };

  it("accepts a board whose website is the company's domain", () => {
    expect(judgeBoard(check({ ats: "ashby", website: "https://www.circle.com/", name: "Circle" }), circle).verdict).toBe("match");
  });
  it("accepts same-stem and brand careers domains", () => {
    expect(judgeBoard(check({ website: "https://cohere.ai", name: "Cohere" }), { name: "Cohere", domain: "cohere.com" }).verdict).toBe("match");
    expect(judgeBoard(check({ website: "https://cohere.ai" }), { name: "Cohere", domain: "cohere.com" }).verdict).toBe("unknown");
    expect(judgeBoard(check({ extra: { jobHosts: ["www.pinterestcareers.com"] } }), { name: "Pinterest", domain: "pinterest.com" }).verdict).toBe("match");
    expect(judgeBoard(check({ extra: { jobHosts: ["careersatdoordash.com"] } }), { name: "DoorDash", domain: "doordash.com" }).verdict).toBe("match");
  });
  it("rejects a same-named board that points at another company's domain", () => {
    const v = judgeBoard(check({ ats: "ashby", website: "https://circleci.com", name: "Circle" }), circle);
    expect(v.verdict).toBe("mismatch");
    expect(v.why).toContain("circleci.com");
    expect(judgeBoard(check({ name: "Bird", extra: { jobHosts: ["www.birdrides.com"] } }), { name: "Bird", domain: "bird.com" }).verdict).toBe("mismatch");
  });
  it("treats same name / other TLD as neutral, so the name decides", () => {
    expect(judgeBoard(check({ ats: "ashby", website: "https://circle.so", name: "Circle" }), circle).verdict).toBe("match");
    expect(judgeBoard(check({ ats: "ashby", website: "https://circle.so", name: "Circle Community" }), circle).verdict).toBe("mismatch");
  });
  it("classifies domain relations", () => {
    expect(domainRelation("www.pinterestcareers.com", "pinterest.com")).toBe("same");
    expect(domainRelation("lifeatspotify.com", "spotify.com")).toBe("same");
    expect(domainRelation("cohere.ai", "cohere.com")).toBe("neutral");
    expect(domainRelation("circleci.com", "circle.com")).toBe("different");
    expect(domainRelation("x.ai", "x.com")).toBe("neutral");
  });
  it("ignores ATS vendor hosts in job URLs", () => {
    expect(judgeBoard(check({ name: "Acme", extra: { jobHosts: ["job-boards.greenhouse.io"] } }), { name: "Acme", domain: "acme.com" }).verdict).toBe("match");
  });
  it("matches on name (incl. legal-entity aka) only when the board has postings", () => {
    expect(judgeBoard(check({ name: "Dreamplug Technologies" }), { name: "CRED", domain: "cred.club", aka: ["Dreamplug Technologies"] }).verdict).toBe("match");
    expect(judgeBoard(check({ ats: "workable", name: "Visa", openJobs: 0 }), { name: "Visa", domain: "visa.com" }).verdict).toBe("unknown");
  });
  it("doesn't let a text mention override a different board name", () => {
    expect(judgeBoard(check({ ats: "workable", name: "Klyomuse", sample: "We partner with Clio for legal ops", openJobs: 0 }), { name: "Clio", domain: "clio.com" }).verdict).toBe("mismatch");
    expect(judgeBoard(check({ name: "Rubrik Job Board" }), { name: "Rubrik", domain: "rubrik.com" }).verdict).toBe("match");
  });
  it("uses domain / name mentions in postings as evidence", () => {
    expect(judgeBoard(check({ sample: "Apply at careers.acme.com today" }), { name: "Acme", domain: "acme.com" }).verdict).toBe("match");
    expect(judgeBoard(check({ sample: "About Juspay: we build payments" }), { name: "Juspay", domain: "juspay.in" }).verdict).toBe("match");
  });
  it("reports another company's board as a mismatch, and no evidence as unknown", () => {
    expect(judgeBoard(check({ name: "Totally Different Inc" }), { name: "Acme", domain: "acme.com" }).verdict).toBe("mismatch");
    expect(judgeBoard(check({}), { name: "Acme", domain: "acme.com" }).verdict).toBe("unknown");
  });
});

describe("tenantPlausible — does an ATS tenant label belong to the company?", () => {
  const co = (slug: string, name: string, domain: string | null, aka: string[] = []) => ({ slug, name, domain, aka });
  it.each([
    ["airtel", co("bharti-airtel", "Bharti Airtel", "airtel.in"), true],
    ["bluetokaicoffee", co("blue-tokai", "Blue Tokai", "bluetokaicoffee.com"), true],
    ["browserstack", co("browserstack", "BrowserStack", "browserstack.com"), true],
    ["epifi", co("fi-money", "Fi Money", "fi.money", ["epiFi Technologies"]), true],
    ["synopsys", co("ansys", "Ansys", "ansys.com"), false],
    ["careers-analytics", co("patsnap", "PatSnap", "patsnap.com"), false],
    ["ey", co("eycom", "Eycom", null), false],
  ])("%s for %s", (tenant, c, ok) => {
    expect(tenantPlausible(tenant, c)).toBe(ok);
  });
});

describe("Workday / Oracle helpers", () => {
  it("parses Workday career-site tokens", () => {
    expect(parseWorkdayToken("https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite")).toEqual({
      origin: "https://nvidia.wd5.myworkdayjobs.com",
      tenant: "nvidia",
      site: "NVIDIAExternalCareerSite",
    });
    expect(parseWorkdayToken("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite")).toBeNull();
  });
  it("parses Oracle CandidateExperience tokens", () => {
    expect(parseOracleToken("https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001")).toEqual({
      origin: "https://jpmc.fa.oraclecloud.com",
      site: "CX_1001",
    });
    expect(parseOracleToken("https://jpmc.fa.oraclecloud.com/careers")).toBeNull();
  });
  it("finds the India facet in a Workday response (nested location groups)", () => {
    const facets = [
      { facetParameter: "jobFamilyGroup", values: [{ descriptor: "Engineering", id: "a", count: 1613 }] },
      {
        facetParameter: "locationMainGroup",
        values: [
          { facetParameter: "locationHierarchy2", descriptor: "Location Type", values: [] },
          {
            facetParameter: "locationHierarchy1",
            descriptor: "Locations",
            values: [
              { descriptor: "United States of America", id: "us", count: 1500 },
              { descriptor: "India", id: "2fcb99c455831013ea52b82135ba3266", count: 231 },
            ],
          },
        ],
      },
    ];
    expect(workdayIndiaFacet(facets)).toEqual({ parameter: "locationHierarchy1", id: "2fcb99c455831013ea52b82135ba3266", jobs: 231 });
    expect(workdayIndiaFacet([{ facetParameter: "locationCountry", values: [{ descriptor: "India", id: "in", count: 9 }] }])).toEqual({
      parameter: "locationCountry",
      id: "in",
      jobs: 9,
    });
    expect(workdayIndiaFacet([{ facetParameter: "locations", values: [{ descriptor: "India, Pune", id: "x", count: 3 }] }])).toBeNull();
  });
  it("builds human-facing board URLs", () => {
    expect(publicBoardUrl("greenhouse", "stripe")).toBe("https://job-boards.greenhouse.io/stripe");
    expect(publicBoardUrl("lever", "eu:mistral")).toBe("https://jobs.eu.lever.co/mistral");
    expect(publicBoardUrl("eightfold", "https://explore.jobs.netflix.net|netflix.com")).toBe("https://explore.jobs.netflix.net/careers");
    expect(publicBoardUrl("recruitee", "bunq")).toBe("https://bunq.recruitee.com/");
    expect(publicBoardUrl("teamtailor", "https://careers.acme.com/")).toBe("https://careers.acme.com/");
  });
});
