import { DEFAULT_SEARCH_QUERY, type SearchQuery } from "@easyjobs/contract";
import { describe, expect, it } from "vitest";
import { CITY_ALIASES, applySmartPatch, canonicalCity, parseSmartQuery, type SmartCompany } from "@/lib/smart-query";

const COMPANIES: SmartCompany[] = [
  { slug: "google", name: "Google" },
  { slug: "goldman-sachs", name: "Goldman Sachs" },
  { slug: "jpmorgan", name: "JPMorgan Chase" },
  { slug: "tcs", name: "TCS" },
  { slug: "hp", name: "HP" },
];

describe("parseSmartQuery — levels, modes, types, tags", () => {
  it("extracts an internship and a city alias, dropping the connector", () => {
    const r = parseSmartQuery("react developer intern in bangalore");
    expect(r.q).toBe("react developer");
    expect(r.patch).toEqual({ level: ["intern"], location: ["Bengaluru"] });
    expect(r.tokens).toEqual([
      { key: "level", value: "intern", label: "Internship", match: "intern" },
      { key: "location", value: "Bengaluru", label: "Bengaluru", match: "bangalore" },
    ]);
  });

  it.each([
    ["internship", "intern"],
    ["internships", "intern"],
    ["interns", "intern"],
    ["fresher", "fresher"],
    ["freshers", "fresher"],
    ["new grad", "fresher"],
    ["new graduates", "fresher"],
    ["graduate trainee", "fresher"],
    ["entry level", "entry"],
    ["entry-level", "entry"],
  ])("%s → level %s", (text, level) => {
    const r = parseSmartQuery(`${text} software engineer`);
    expect(r.patch.level).toEqual([level]);
    expect(r.q).toBe("software engineer");
  });

  it.each(["remote", "wfh", "work from home", "work-from-home", "WFH"])("%s → mode remote", (text) => {
    const r = parseSmartQuery(`${text} python`);
    expect(r.patch.mode).toEqual(["remote"]);
    expect(r.q).toBe("python");
  });

  it("detects hybrid, full-time and part-time", () => {
    expect(parseSmartQuery("hybrid designer").patch.mode).toEqual(["hybrid"]);
    expect(parseSmartQuery("full-time analyst").patch.type).toEqual(["full_time"]);
    expect(parseSmartQuery("full time analyst").patch.type).toEqual(["full_time"]);
    expect(parseSmartQuery("part time tutor").patch.type).toEqual(["part_time"]);
  });

  it.each(["off-campus drive", "off campus", "offcampus"])("%s → off-campus tag", (text) => {
    const r = parseSmartQuery(`${text} java`);
    expect(r.patch.tag).toEqual(["off-campus"]);
    expect(r.tokens[0]?.label).toBe("Off-campus drive");
    expect(r.q).toBe("java");
  });

  it.each(["walk-in", "walkin", "walk in"])("%s → walk-in tag", (text) => {
    expect(parseSmartQuery(`${text} customer support`).patch.tag).toEqual(["walk-in"]);
  });

  it("never matches inside other words", () => {
    for (const text of ["internal tools engineer", "punekar foods", "remotely managed", "hybridisation scientist", "freshersworld"]) {
      const r = parseSmartQuery(text);
      expect(r.tokens).toEqual([]);
      expect(r.q).toBe(text);
    }
  });

  it("dedupes repeated tokens", () => {
    const r = parseSmartQuery("intern internship bangalore bengaluru");
    expect(r.patch).toEqual({ level: ["intern"], location: ["Bengaluru"] });
    expect(r.tokens).toHaveLength(2);
    expect(r.q).toBe("");
  });

  it("is case-insensitive", () => {
    expect(parseSmartQuery("INTERN BANGALORE").patch).toEqual({ level: ["intern"], location: ["Bengaluru"] });
  });
});

describe("parseSmartQuery — locations", () => {
  it.each([
    ["gurgaon", "Gurugram"],
    ["ggn", "Gurugram"],
    ["bombay", "Mumbai"],
    ["madras", "Chennai"],
    ["calcutta", "Kolkata"],
    ["hyd", "Hyderabad"],
    ["secunderabad", "Hyderabad"],
    ["cochin", "Kochi"],
    ["trivandrum", "Thiruvananthapuram"],
    ["mysore", "Mysuru"],
    ["baroda", "Vadodara"],
    ["vizag", "Visakhapatnam"],
    ["new delhi", "Delhi"],
    ["delhi ncr", "Delhi"],
    ["blr", "Bengaluru"],
    ["banglore", "Bengaluru"],
    ["Pune", "Pune"],
    ["noida", "Noida"],
  ])("%s → %s", (alias, city) => {
    const r = parseSmartQuery(`data analyst at ${alias}`);
    expect(r.patch.location).toEqual([city]);
    expect(r.q).toBe("data analyst");
  });

  it("removes filler words and edge connectors", () => {
    expect(parseSmartQuery("fresher jobs in gurgaon").q).toBe("");
    expect(parseSmartQuery("jobs at hyd").patch.location).toEqual(["Hyderabad"]);
    expect(parseSmartQuery("hiring for react roles near pune").q).toBe("react");
  });

  it("keeps symbols inside words", () => {
    const r = parseSmartQuery("c++ developer in pune");
    expect(r.q).toBe("c++ developer");
    expect(parseSmartQuery("node.js and c# engineer remote").q).toBe("node.js and c# engineer");
  });

  it("collects several cities", () => {
    expect(parseSmartQuery("sde in bangalore or hyderabad").patch.location).toEqual(["Bengaluru", "Hyderabad"]);
  });
});

describe("parseSmartQuery — batches", () => {
  it.each([
    ["2026 batch", 2026],
    ["batch 2026", 2026],
    ["batch of 2027", 2027],
    ["2025 passout", 2025],
    ["2025 passouts", 2025],
    ["2026 pass out", 2026],
    ["class of 2024", 2024],
    ["2026-batch", 2026],
  ])("%s → %i", (text, year) => {
    const r = parseSmartQuery(`software engineer ${text}`);
    expect(r.patch.batch).toEqual([year]);
    expect(r.tokens[0]?.label).toBe(`${year} batch`);
    expect(r.q).toBe("software engineer");
  });

  it("ignores out-of-range years and bare years", () => {
    expect(parseSmartQuery("2040 batch").patch.batch).toBeUndefined();
    expect(parseSmartQuery("2010 batch").patch.batch).toBeUndefined();
    expect(parseSmartQuery("engineer 2026").patch.batch).toBeUndefined();
  });

  it("combines a fresher token with a batch", () => {
    const r = parseSmartQuery("graduate trainee 2026 batch");
    expect(r.patch).toEqual({ level: ["fresher"], batch: [2026] });
    expect(r.q).toBe("");
  });
});

describe("parseSmartQuery — companies", () => {
  it("detects company names and slugs from suggest()", () => {
    const r = parseSmartQuery("google sde intern", COMPANIES);
    expect(r.patch).toEqual({ company: ["google"], level: ["intern"] });
    expect(r.q).toBe("sde");
    expect(parseSmartQuery("Goldman Sachs summer analyst", COMPANIES).patch.company).toEqual(["goldman-sachs"]);
    expect(parseSmartQuery("jpmorgan analyst", COMPANIES).tokens[0]).toMatchObject({ key: "company", value: "jpmorgan", label: "JPMorgan Chase" });
    expect(parseSmartQuery("tcs ninja 2026 batch", COMPANIES).patch).toEqual({ company: ["tcs"], batch: [2026] });
  });

  it("skips very short company names and needs the list", () => {
    expect(parseSmartQuery("hp laptop engineer", COMPANIES).patch.company).toBeUndefined();
    expect(parseSmartQuery("google sde").patch.company).toBeUndefined();
  });
});

describe("canonicalCity / CITY_ALIASES", () => {
  it("maps aliases to canonical names", () => {
    expect(canonicalCity("bangalore")).toBe("Bengaluru");
    expect(canonicalCity("  Gurgaon ")).toBe("Gurugram");
    expect(canonicalCity("Bengaluru, IN")).toBe("Bengaluru");
    expect(canonicalCity("new  delhi")).toBe("Delhi");
    expect(canonicalCity("remote")).toBeNull();
    expect(canonicalCity("Atlantis")).toBeNull();
  });

  it("maps every canonical value to itself", () => {
    for (const city of new Set(Object.values(CITY_ALIASES))) expect(canonicalCity(city)).toBe(city);
  });
});

describe("applySmartPatch", () => {
  it("unions lists, sets q and resets the page", () => {
    const base: SearchQuery = { ...DEFAULT_SEARCH_QUERY, level: ["fresher"], location: ["Pune"], page: 4 };
    const next = applySmartPatch(base, parseSmartQuery("react intern in bangalore 2026 batch"));
    expect(next.q).toBe("react");
    expect(next.level).toEqual(["fresher", "intern"]);
    expect(next.location).toEqual(["Pune", "Bengaluru"]);
    expect(next.batch).toEqual([2026]);
    expect(next.page).toBe(1);
    expect(next.sort).toBe("relevance");
  });

  it("clears q when nothing is left and does not duplicate", () => {
    const base: SearchQuery = { ...DEFAULT_SEARCH_QUERY, q: "old", location: ["Bengaluru"] };
    const next = applySmartPatch(base, parseSmartQuery("jobs in bangalore"));
    expect(next.q).toBeUndefined();
    expect(next.location).toEqual(["Bengaluru"]);
  });
});
