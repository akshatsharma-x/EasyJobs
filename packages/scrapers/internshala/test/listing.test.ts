import { describe, expect, it } from "vitest";
import { DETAIL_PATH_RE, parseListingPage } from "../src/parse/listing";
import type { ListingCard } from "../src/types";
import { fixture, listingHtml } from "./helpers";

const byId = (cards: ListingCard[], id: string): ListingCard => {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`card ${id} not in fixture`);
  return c;
};

describe("parseListingPage — /internships/ page 1", () => {
  const page = parseListingPage(fixture("listing-internships"));

  it("reads pagination, totals and kind", () => {
    expect(page).toMatchObject({ kind: "internship", page: 1, lastPage: 152, isLastPage: false, totalCount: 6080, skipped: 0 });
    expect(page.cards.length).toBeGreaterThanOrEqual(6);
  });

  it("parses a standard in-office internship card", () => {
    expect(byId(page.cards, "3334805")).toEqual({
      id: "3334805",
      kind: "internship",
      path: "/internship/detail/business-development-sales-internship-in-delhi-at-loadit-supply-services-pvt-ltd1794806827",
      url: "https://internshala.com/internship/detail/business-development-sales-internship-in-delhi-at-loadit-supply-services-pvt-ltd1794806827",
      title: "Business Development (Sales)",
      company: "Loadit Supply Services Pvt Ltd",
      logoUrl: null, // Internshala's placeholder logo
      locations: ["Delhi"],
      isWfh: false,
      isHybrid: false,
      hybridNote: null,
      salaryText: "₹ 10,000 - 12,000 /month",
      durationText: "3 Months",
      experienceText: null,
      postedText: "1 week ago",
      labels: [],
      ppoText: null,
      activelyHiring: true,
      earlyApplicant: false,
      skills: ["Key Account Management"],
      snippet: expect.stringMatching(/^1\.Roles & Responsibilities Assist the KAM team/),
      pinned: true,
    });
  });

  it("splits a single comma-joined location anchor", () => {
    expect(byId(page.cards, "3340498").locations).toEqual([
      "Dombivli", "Mumbai", "Virar", "Vashi", "Vasai", "Mira Bhayandar", "Nala Sopara", "Dahisar", "Vasai-Virar",
    ]);
  });

  it("reads the PPO label, the logo and pinned status", () => {
    const c = byId(page.cards, "3339985");
    expect(c.ppoText).toBe("Job offer upto ₹ 5LPA post internship");
    expect(c.logoUrl).toMatch(/^https:\/\/internshala-uploads\.internshala\.com\/logo%2F/);
    expect(c.pinned).toBe(true);
  });

  it("marks organic cards as not pinned and every detail URL as robots-allowed", () => {
    expect(page.cards.filter((c) => !c.pinned).length).toBeGreaterThan(0);
    for (const c of page.cards) {
      expect(c.path).toMatch(DETAIL_PATH_RE);
      expect(c.url).not.toContain("?");
    }
  });

  it("matches the snapshot", () => {
    expect(page.cards).toMatchSnapshot();
  });
});

describe("parseListingPage — work-from-home internships", () => {
  const page = parseListingPage(fixture("listing-internships-wfh"));

  it("detects WFH and the pay variants", () => {
    expect(page.totalCount).toBe(2019);
    expect(page.cards.every((c) => c.isWfh && c.locations[0] === "Work from home")).toBe(true);
    expect(byId(page.cards, "3340945")).toMatchObject({ salaryText: "Unpaid", durationText: "1 Month", labels: ["Part time"] });
    expect(byId(page.cards, "3340935").salaryText).toBe("₹ 1,500 - 15,000 lump sum");
    expect(byId(page.cards, "3331809")).toMatchObject({ salaryText: "₹ 300 /week", postedText: "2 weeks ago" });
    expect(byId(page.cards, "3341013").salaryText).toBe("Performance Based");
  });

  it("reads a PPO label without an amount", () => {
    expect(page.cards.some((c) => c.ppoText === "Job offer post internship")).toBe(true);
  });

  it("matches the snapshot", () => {
    expect(page.cards).toMatchSnapshot();
  });
});

describe("parseListingPage — /jobs/", () => {
  const page = parseListingPage(fixture("listing-jobs"));

  it("reads CTC with its /year period, experience and the fresher label", () => {
    expect(page).toMatchObject({ kind: "job", lastPage: 148, totalCount: 5909 });
    expect(byId(page.cards, "3341218")).toMatchObject({
      kind: "job",
      salaryText: "₹ 4,00,000 - 4,50,000 /year",
      experienceText: "1 year(s)",
      durationText: null,
      earlyApplicant: true,
    });
    expect(byId(page.cards, "3340461")).toMatchObject({ experienceText: "No experience required", labels: ["Fresher Job"] });
  });

  it("detects hybrid locations and keeps the in-office note", () => {
    expect(byId(page.cards, "3341143")).toMatchObject({
      locations: ["Mumbai"],
      isHybrid: true,
      hybridNote: "1 day(s) in-office in a week",
    });
  });

  it("matches the snapshot", () => {
    expect(page.cards).toMatchSnapshot();
  });
});

describe("parseListingPage — work-from-home jobs", () => {
  const page = parseListingPage(fixture("listing-jobs-wfh"));

  it("reads International + Fresher Job + Part time labels", () => {
    const c = page.cards.find((x) => x.labels.includes("International"));
    expect(c?.labels).toEqual(["International", "Fresher Job", "Part time"]);
    expect(c?.company).toMatch(/\(Castlebar, Ireland\)$/);
    expect(c?.isWfh).toBe(true);
  });
});

describe("parseListingPage — pagination edge cases", () => {
  it("page 2 has no pinned cards and reports its own page number", () => {
    const page = parseListingPage(fixture("listing-internships-page-2"));
    expect(page.page).toBe(2);
    expect(page.cards.some((c) => c.pinned)).toBe(false);
  });

  it("an out-of-range page (0 cards) is the last page", () => {
    const page = parseListingPage(listingHtml({ page: 999, lastPage: 152, cards: [] }));
    expect(page.cards).toEqual([]);
    expect(page.isLastPage).toBe(true);
  });

  it("the last page is detected from #isLastPage and the page number", () => {
    const page = parseListingPage(listingHtml({ page: 3, lastPage: 3, cards: ["1"] }));
    expect(page).toMatchObject({ page: 3, lastPage: 3, isLastPage: true });
  });

  it("skips malformed cards and de-duplicates ids", () => {
    const html = listingHtml({ page: 1, lastPage: 2, cards: ["11", "11", "12"] }).replace(">Acme 12<", "><");
    const page = parseListingPage(html);
    expect(page.cards.map((c) => c.id)).toEqual(["11"]);
    expect(page.skipped).toBe(1);
  });

  it("returns an empty result for unrelated HTML", () => {
    expect(parseListingPage("<html><body><p>Maintenance</p></body></html>")).toMatchObject({ cards: [], page: null, isLastPage: true });
  });
});
