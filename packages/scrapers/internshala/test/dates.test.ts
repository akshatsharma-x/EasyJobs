import { describe, expect, it } from "vitest";
import {
  parseDurationMonths,
  parseIstDateTime,
  parseRelativeAge,
  parseShortDate,
  resolvePostedAt,
  urlTimestampMs,
} from "../src/parse/dates";

const H = 3_600_000;
const D = 24 * H;
const now = new Date("2026-11-25T22:00:00.000Z");

describe("parseRelativeAge", () => {
  it.each([
    ["Just now", 0, H],
    ["Few hours ago", 0, 12 * H],
    ["Posted few hours ago", 0, 12 * H],
    ["Today", 0, D],
    ["Posted today", 0, D],
    ["Yesterday", D, 2 * D],
    ["1 day ago", D, 2 * D],
    ["2 days ago", 2 * D, 3 * D],
    ["7 days ago", 7 * D, 8 * D],
    ["1 week ago", 7 * D, 14 * D],
    ["2 weeks ago", 14 * D, 21 * D],
    ["3 hours ago", 3 * H, 4 * H],
    ["1 month ago", 30 * D, 60 * D],
    ["an hour ago", H, 2 * H],
    ["30+ days ago", 30 * D, Number.POSITIVE_INFINITY],
  ])("%s", (label, minMs, maxMs) => {
    expect(parseRelativeAge(label)).toEqual({ minMs, maxMs });
  });

  it.each([null, "", "Actively hiring", "16 Dec' 26"])("%j → null", (label) => {
    expect(parseRelativeAge(label)).toBeNull();
  });
});

describe("urlTimestampMs", () => {
  it("reads the trailing Unix seconds of a detail URL", () => {
    expect(urlTimestampMs("/internship/detail/business-development-sales-internship-in-delhi-at-loadit-supply-services-pvt-ltd1794806827", now)).toBe(
      1_794_806_827_000,
    );
    expect(urlTimestampMs("https://internshala.com/job/detail/iot-network-engineer-male-job-in-jamnagar-at-highway-delite1795610869", now)).toBe(
      1_795_610_869_000,
    );
  });

  it("takes the last 10 digits when the slug itself ends with digits", () => {
    expect(urlTimestampMs("/internship/detail/design-internship-at-studio-541794806827", now)).toBe(1_794_806_827_000);
  });

  it.each(["/internship/detail/something-at-acme123", "/internships/page-2/", "/internship/detail/x-at-y9999999999", "/internship/detail/x-at-y1000000000"])(
    "%s → null (missing or implausible)",
    (path) => {
      expect(urlTimestampMs(path, now)).toBeNull();
    },
  );
});

describe("resolvePostedAt", () => {
  const ts = now.getTime() - 8 * H; // "Few hours ago"

  it("prefers the URL timestamp when it agrees with the label", () => {
    expect(resolvePostedAt({ label: "Few hours ago", urlTsMs: ts, now })).toEqual({ iso: new Date(ts).toISOString(), basis: "url" });
    const weekOld = now.getTime() - 9.5 * D;
    expect(resolvePostedAt({ label: "1 week ago", urlTsMs: weekOld, now }).basis).toBe("url");
  });

  it("falls back to the label when the URL timestamp contradicts it", () => {
    const r = resolvePostedAt({ label: "Few hours ago", urlTsMs: now.getTime() - 40 * D, now });
    expect(r.basis).toBe("label");
    expect(r.iso).toBe(new Date(now.getTime() - 6 * H).toISOString());
  });

  it("uses the middle of the label range without a URL timestamp", () => {
    expect(resolvePostedAt({ label: "2 days ago", now }).iso).toBe(new Date(now.getTime() - 2.5 * D).toISOString());
    expect(resolvePostedAt({ label: "30+ days ago", now }).iso).toBe(new Date(now.getTime() - 30 * D).toISOString());
  });

  it("accepts a plausible URL timestamp when there is no label", () => {
    expect(resolvePostedAt({ urlTsMs: ts, now }).basis).toBe("url");
  });

  it("never returns a time in the future", () => {
    const r = resolvePostedAt({ label: "Just now", urlTsMs: now.getTime() + 20 * 60_000, now });
    expect(Date.parse(r.iso ?? "")).toBeLessThanOrEqual(now.getTime());
  });

  it("falls back to JSON-LD datePosted (00:00 IST)", () => {
    expect(resolvePostedAt({ datePosted: "2026-11-16", now })).toEqual({ iso: "2026-11-15T18:30:00.000Z", basis: "jsonld" });
  });

  it("returns null when nothing is known", () => {
    expect(resolvePostedAt({ now })).toEqual({ iso: null, basis: null });
  });
});

describe("IST dates", () => {
  it.each([
    ["2026-12-16 23:59:59", "2026-12-16T18:29:59.000Z"],
    ["2026-11-16", "2026-11-15T18:30:00.000Z"],
    ["2026-12-16T23:59:59+05:30", "2026-12-16T18:29:59.000Z"],
    ["2026-12-16T10:00:00Z", "2026-12-16T10:00:00.000Z"],
    ["2026-02-30", null],
    ["soon", null],
    [null, null],
  ])("parseIstDateTime(%j) → %j", (input, expected) => {
    expect(parseIstDateTime(input)).toBe(expected);
  });

  it.each([
    ["16 Dec' 26", "2026-12-16T18:29:59.000Z"],
    ["25 Dec' 26", "2026-12-25T18:29:59.000Z"],
    ["1 Jan'27", "2027-01-01T18:29:59.000Z"],
    ["16th Nov'26", "2026-11-16T18:29:59.000Z"],
    ["16 December 2026", "2026-12-16T18:29:59.000Z"],
    ["Immediately", null],
    ["31 Feb' 27", null],
  ])("parseShortDate(%j) → %j (end of day IST)", (input, expected) => {
    expect(parseShortDate(input)).toBe(expected);
  });

  it("parseShortDate can return the start of the day", () => {
    expect(parseShortDate("16 Dec' 26", { endOfDay: false })).toBe("2026-12-15T18:30:00.000Z");
  });
});

describe("parseDurationMonths", () => {
  it.each([
    ["3 Months", 3],
    ["1 Month", 1],
    ["6 months", 6],
    ["2 Weeks", 0.46],
    ["1 Week", 0.23],
    ["", null],
    ["Flexible", null],
  ])("%j → %j", (input, expected) => {
    expect(parseDurationMonths(input)).toBe(expected);
  });
});
