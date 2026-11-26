import { describe, expect, it } from "vitest";
import { assessRemote, classifyRegion, descriptionRestriction, titleRestriction, type RemoteScope } from "../src/lib/region";

describe("classifyRegion", () => {
  const cases: [string, RemoteScope][] = [
    ["Worldwide", "anywhere"],
    ["Anywhere in the World", "anywhere"],
    ["Global", "anywhere"],
    ["100% remote, any timezone", "anywhere"],
    ["India", "india"],
    ["Remote - India", "india"],
    ["Bengaluru, Karnataka", "india"],
    ["IST hours", "india"],
    ["UTC+5:30", "india"],
    ["APAC", "asia"],
    ["Asia Only", "asia"],
    ["LATAM, Europe, USA, Canada, APAC", "asia"],
    ["Southeast Asia", "restricted"],
    ["SEA", "restricted"],
    ["Europe, Africa, W Asia", "restricted"],
    ["USA Only", "restricted"],
    ["US", "restricted"],
    ["U.S.", "restricted"],
    ["Americas, LATAM, Canada, USA timezones", "restricted"],
    ["Worldwide (US timezones)", "restricted"],
    ["Anywhere in the US", "restricted"],
    ["Europe Only", "restricted"],
    ["EMEA", "restricted"],
    ["Netherlands", "restricted"],
    ["🇬🇧 United Kingdom of Great Britain and Northern Ireland and 🇩🇪 Germany", "restricted"],
    ["Austin, TX", "restricted"],
    ["CET", "restricted"],
    ["Midwest", "restricted"],
    ["Remote", "unknown"],
    ["", "unknown"],
    ["Homeoffice", "unknown"],
    ["British Indian Ocean Territory", "unknown"],
  ];
  it.each(cases)("%s → %s", (input, expected) => {
    expect(classifyRegion(input)).toBe(expected);
  });
});

describe("titleRestriction", () => {
  const restricted = [
    "Senior Global Partner Specialist - USA",
    "Partner Sales Manager (Hindi Speaking) - Singapore",
    "Private Practice Enablement Specialist (PST)",
    "Content Reviewer - United States",
    "US Remote Patient Care Advocate",
    "SEA P2P Business Development Specialist",
    "Head of EEA Legal, Deputy General Counsel",
    "Partner Business Manager, Midwest",
    "Sales Director, EMEA",
    "Web Developer: WordPress & HubSpot (U.S. Based, Remote)",
  ];
  it.each(restricted)("restricted: %s", (t) => expect(titleRestriction(t)).not.toBeNull());
  const open = [
    "Region Head, Asia",
    "Senior Software Engineer, Full Stack",
    "Manager, Network Contracting",
    "Join us as a Backend Engineer",
    "Account Executive, India",
    "Engineering Manager (APAC)",
    "Software Engineer - Go",
    "Japanese Speaker",
  ];
  it.each(open)("open: %s", (t) => expect(titleRestriction(t)).toBeNull());
});

describe("descriptionRestriction", () => {
  const restricted = [
    "Applicants must be authorized to work in the United States.",
    "You must be based in the EU to be considered.",
    "This role is open to candidates in the US, Canada, and New Zealand.",
    "Work Location: This is a remote position, open to candidates who reside in Atlanta, Georgia; Chicago, Illinois",
    "This role can be filled in European, Middle East, African or any American region / time zone.",
    "US citizens only due to export controls.",
    "This role is based in the EMEA region.",
  ];
  it.each(restricted)("restricted: %s", (t) => expect(descriptionRestriction(t)).not.toBeNull());
  const open = [
    "We have offices in the US, UK and India.",
    "You must be based in the US or India.",
    "Work from anywhere in the world.",
    "Eligibility for company-sponsored health benefits is limited to team members based in the United States.",
    "If you are located in the European Economic Area, the United Kingdom, or another jurisdiction with applicable privacy laws, read our notice.",
    "Contact us to learn more about our US customers.",
  ];
  it.each(open)("open: %s", (t) => expect(descriptionRestriction(t)).toBeNull());
});

describe("assessRemote", () => {
  it("India in any location string wins", () => {
    expect(assessRemote({ locations: ["USA", "India"] })).toMatchObject({ scope: "india", eligible: true });
  });
  it("unknown is not eligible unless the source says so", () => {
    expect(assessRemote({ locations: ["Remote"] }).eligible).toBe(false);
    expect(assessRemote({ locations: ["Remote"], unknownMeans: "anywhere" }).eligible).toBe(true);
  });
  it("title and description can veto an 'anywhere' label", () => {
    expect(assessRemote({ locations: ["Worldwide"], title: "Engineer - USA" }).eligible).toBe(false);
    expect(assessRemote({ locations: ["Worldwide"], descriptionText: "Must reside in the United States." }).eligible).toBe(false);
  });
});
