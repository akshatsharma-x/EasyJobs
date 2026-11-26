import { describe, expect, it } from "vitest";
import { CITY_COUNTS, detectWorkMode, isLocationOnly, lookupCity, normalizeLocations, parseLocation } from "../src/index";

const fmt = (input: string): string[] => parseLocation(input).locations.map((l) => `${l.city ?? "-"}|${l.state ?? "-"}|${l.country ?? "-"}`);

describe("normalizeLocations — canonical city/state/country", () => {
  const cases: [string, string[]][] = [
    ["Bangalore", ["Bengaluru|Karnataka|IN"]],
    ["Bengaluru, Karnataka, India", ["Bengaluru|Karnataka|IN"]],
    ["Banglore", ["Bengaluru|Karnataka|IN"]],
    ["Bangalore Urban", ["Bengaluru|Karnataka|IN"]],
    ["Whitefield, Bangalore", ["Bengaluru|Karnataka|IN"]],
    ["Gurgaon, Haryana", ["Gurugram|Haryana|IN"]],
    ["Gurugram", ["Gurugram|Haryana|IN"]],
    ["Mumbai", ["Mumbai|Maharashtra|IN"]],
    ["Bombay", ["Mumbai|Maharashtra|IN"]],
    ["Navi Mumbai", ["Mumbai|Maharashtra|IN"]],
    ["Hyderabad, Telangana", ["Hyderabad|Telangana|IN"]],
    ["Secunderabad", ["Hyderabad|Telangana|IN"]],
    ["HITEC City, Hyderabad", ["Hyderabad|Telangana|IN"]],
    ["Chennai", ["Chennai|Tamil Nadu|IN"]],
    ["Madras", ["Chennai|Tamil Nadu|IN"]],
    ["Kolkata", ["Kolkata|West Bengal|IN"]],
    ["Calcutta", ["Kolkata|West Bengal|IN"]],
    ["Noida", ["Noida|Uttar Pradesh|IN"]],
    ["Greater Noida", ["Noida|Uttar Pradesh|IN"]],
    ["Kochi", ["Kochi|Kerala|IN"]],
    ["Cochin", ["Kochi|Kerala|IN"]],
    ["Kochi (Cochin)", ["Kochi|Kerala|IN"]],
    ["Thiruvananthapuram", ["Thiruvananthapuram|Kerala|IN"]],
    ["Trivandrum", ["Thiruvananthapuram|Kerala|IN"]],
    ["Pune, Maharashtra, India", ["Pune|Maharashtra|IN"]],
    ["Hinjewadi, Pune", ["Pune|Maharashtra|IN"]],
    ["New Delhi", ["Delhi|Delhi|IN"]],
    ["Delhi NCR", ["Delhi|Delhi|IN"]],
    ["Mysore", ["Mysuru|Karnataka|IN"]],
    ["Baroda", ["Vadodara|Gujarat|IN"]],
    ["Vizag", ["Visakhapatnam|Andhra Pradesh|IN"]],
    ["Trichy", ["Tiruchirappalli|Tamil Nadu|IN"]],
    ["IN, KA, Bangalore", ["Bengaluru|Karnataka|IN"]],
    ["IND-Bangalore", ["Bengaluru|Karnataka|IN"]],
    ["India, Bengaluru", ["Bengaluru|Karnataka|IN"]],
    ["Hyderabad, Telangana 500032", ["Hyderabad|Telangana|IN"]],
    ["Hyderabad (Divyasree Orion)", ["Hyderabad|Telangana|IN"]],
    ["Chennai, TN", ["Chennai|Tamil Nadu|IN"]],
    ["Bengaluru, KA, IN", ["Bengaluru|Karnataka|IN"]],
    ["Narsapur, Telangana", ["Narsapur|Telangana|IN"]],
    ["San Francisco, CA", ["San Francisco|California|US"]],
    ["Bay Area", ["San Francisco|California|US"]],
    ["New York, NY, United States", ["New York|New York|US"]],
    ["NYC", ["New York|New York|US"]],
    ["Seattle, Washington", ["Seattle|Washington|US"]],
    ["Washington, DC", ["Washington|District of Columbia|US"]],
    ["Austin, TX", ["Austin|Texas|US"]],
    ["Indianapolis, IN", ["Indianapolis|Indiana|US"]],
    ["Cambridge, MA", ["Cambridge|Massachusetts|US"]],
    ["Cambridge", ["Cambridge|England|GB"]],
    ["London", ["London|England|GB"]],
    ["London, Ontario", ["London|Ontario|CA"]],
    ["Toronto, CA", ["Toronto|Ontario|CA"]],
    ["Dublin, Ireland", ["Dublin|-|IE"]],
    ["München", ["Munich|-|DE"]],
    ["Zürich", ["Zurich|-|CH"]],
    ["Singapore", ["Singapore|-|SG"]],
    ["Dubai, UAE", ["Dubai|-|AE"]],
    ["Hyderabad, Pakistan", ["Hyderabad|Sindh|PK"]],
    ["USA - CA - San Jose", ["San Jose|California|US"]],
    ["India", ["-|-|IN"]],
    ["Karnataka", ["-|Karnataka|IN"]],
    ["CA", ["-|California|US"]],
  ];
  it.each(cases)("%s → %j", (input, expected) => {
    expect(fmt(input)).toEqual(expected);
  });
});

describe("normalizeLocations — splitting and special values", () => {
  const cases: [string, string[]][] = [
    ["Bangalore/Hyderabad/Pune", ["Bengaluru|Karnataka|IN", "Hyderabad|Telangana|IN", "Pune|Maharashtra|IN"]],
    ["Bangalore, Hyderabad, Pune", ["Bengaluru|Karnataka|IN", "Hyderabad|Telangana|IN", "Pune|Maharashtra|IN"]],
    ["Mumbai, Delhi", ["Mumbai|Maharashtra|IN", "Delhi|Delhi|IN"]],
    ["Chennai & Coimbatore", ["Chennai|Tamil Nadu|IN", "Coimbatore|Tamil Nadu|IN"]],
    ["Pune or Mumbai", ["Pune|Maharashtra|IN", "Mumbai|Maharashtra|IN"]],
    ["Bengaluru | Hyderabad", ["Bengaluru|Karnataka|IN", "Hyderabad|Telangana|IN"]],
    ["Bengaluru, Karnataka, India; Hyderabad, Telangana, India", ["Bengaluru|Karnataka|IN", "Hyderabad|Telangana|IN"]],
    ["Hyderabad/Secunderabad, Pune, Bengaluru", ["Hyderabad|Telangana|IN", "Pune|Maharashtra|IN", "Bengaluru|Karnataka|IN"]],
    ["Bengaluru/Bangalore", ["Bengaluru|Karnataka|IN"]],
    ["Bangalore - Whitefield", ["Bengaluru|Karnataka|IN"]],
    ["Delhi/NCR", ["Delhi|Delhi|IN"]],
    ["Remote - US/Canada", ["-|-|US", "-|-|CA"]],
    ["Remote - India", ["-|-|IN"]],
    ["Remote (US)", ["-|-|US"]],
    ["Pan India", ["-|-|IN"]],
    ["Anywhere in India", ["-|-|IN"]],
    ["Across India", ["-|-|IN"]],
    ["Multiple Locations", ["-|-|-"]],
    ["Work From Home", ["-|-|-"]],
    ["Anywhere", ["-|-|-"]],
    ["EMEA", ["-|-|-"]],
    ["Office", []],
    ["N/A", []],
    ["", []],
  ];
  it.each(cases)("%s → %j", (input, expected) => {
    expect(fmt(input)).toEqual(expected);
  });

  it("flags multi-location markers", () => {
    expect(parseLocation("Mumbai, Bangalore & 3 more")).toMatchObject({ multiple: true });
    expect(parseLocation("2 Locations").multiple).toBe(true);
    expect(parseLocation("Pan India").multiple).toBe(true);
  });

  it("keeps the raw text and accepts a single string or garbage", () => {
    expect(normalizeLocations("Remote - India").locations[0]?.raw).toBe("Remote - India");
    expect(normalizeLocations(["Bangalore", 42, null, { x: 1 }]).locations).toHaveLength(1);
    expect(normalizeLocations(null).locations).toEqual([]);
  });

  it("dedupes across strings and drops redundant country-only entries", () => {
    const r = normalizeLocations(["Bengaluru", "Bangalore, India", "India"]);
    expect(r.locations.map((l) => l.city)).toEqual(["Bengaluru"]);
  });
});

describe("work mode from location strings", () => {
  const cases: [string[], string | null, boolean][] = [
    [["Remote - India"], "remote", true],
    [["Work from home"], "remote", true],
    [["WFH"], "remote", true],
    [["Anywhere"], "remote", true],
    [["Worldwide"], "remote", true],
    [["Hybrid - Pune"], "hybrid", false],
    [["Bengaluru (Hybrid)"], "hybrid", false],
    [["On-site - Chennai"], "onsite", false],
    [["Pune, Maharashtra, India (On-site)"], "onsite", false],
    [["Remote or Bangalore"], "remote", true],
    [["Remote", "Hybrid - Pune"], "remote", true],
    [["Bangalore"], null, false],
  ];
  it.each(cases)("%j → %s", (input, mode, remote) => {
    const r = normalizeLocations(input);
    expect(r.workMode).toBe(mode);
    expect(r.isRemote).toBe(remote);
  });
});

describe("detectWorkMode precedence", () => {
  it("hint > locations > title > tags > description", () => {
    expect(detectWorkMode({ hint: "hybrid", locations: ["Remote"] })).toMatchObject({ workMode: "hybrid", source: "hint" });
    expect(detectWorkMode({ isRemoteHint: true })).toMatchObject({ workMode: "remote", isRemote: true });
    expect(detectWorkMode({ locations: ["Remote"], title: "Engineer (Onsite)" })).toMatchObject({ workMode: "remote", source: "location" });
    expect(detectWorkMode({ title: "Data Analyst (Remote)" })).toMatchObject({ workMode: "remote", source: "title" });
    expect(detectWorkMode({ tags: ["remote"] })).toMatchObject({ workMode: "remote", source: "tags" });
    expect(detectWorkMode({ description: "This is a hybrid role with 3 days a week in office." })).toMatchObject({ workMode: "hybrid", source: "description" });
    expect(detectWorkMode({ description: "This is not a remote position." })).toMatchObject({ workMode: "onsite" });
    expect(detectWorkMode({ description: "Experience with remote sensing data." })).toMatchObject({ workMode: null, source: "none" });
  });
  it("does not read tech phrases as work modes", () => {
    expect(detectWorkMode({ title: "Remote Sensing Analyst" }).workMode).toBeNull();
    expect(detectWorkMode({ title: "Hybrid Cloud Engineer" }).workMode).toBeNull();
    expect(detectWorkMode({ title: "Onsite Support Engineer" }).workMode).toBeNull();
  });
});

describe("location reference data", () => {
  it("covers ≥150 Indian cities and ≥150 global tech hubs", () => {
    expect(CITY_COUNTS.india).toBeGreaterThanOrEqual(150);
    expect(CITY_COUNTS.global).toBeGreaterThanOrEqual(150);
  });
  it("lookupCity resolves aliases", () => {
    expect(lookupCity("gurgaon")).toEqual({ city: "Gurugram", state: "Haryana", country: "IN" });
    expect(lookupCity("Atlantis")).toBeNull();
  });
  it("isLocationOnly", () => {
    expect(isLocationOnly("Bangalore")).toBe(true);
    expect(isLocationOnly("Remote")).toBe(true);
    expect(isLocationOnly("New Delhi")).toBe(true);
    expect(isLocationOnly("Pune (Hybrid)")).toBe(true);
    expect(isLocationOnly("Backend")).toBe(false);
    expect(isLocationOnly("Senior")).toBe(false);
  });
});
