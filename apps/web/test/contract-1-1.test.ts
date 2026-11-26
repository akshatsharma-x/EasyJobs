import { describe, expect, it } from "vitest";
import { googleFaviconDomain, logoSources } from "@/lib/logos";
import { allowsJobPostingSchema, allowsSyndication } from "@/lib/seo";

describe("logos (W1: normalize's Google-favicon URLs go through the proxy)", () => {
  it("replaces a Google favicon logoUrl with the same-origin proxy", () => {
    const url = "https://www.google.com/s2/favicons?domain=razorpay.com&sz=128";
    expect(googleFaviconDomain(url)).toBe("razorpay.com");
    expect(logoSources({ name: "Razorpay", domain: "razorpay.com", logoUrl: url })).toEqual(["/logo/razorpay.com"]);
    expect(logoSources({ name: "Razorpay", domain: null, logoUrl: url })).toEqual(["/logo/razorpay.com"]);
  });
  it("keeps real logo URLs first, with the proxy as fallback", () => {
    expect(logoSources({ name: "Acme", domain: "acme.com", logoUrl: "https://cdn.acme.com/logo.png" })).toEqual(["https://cdn.acme.com/logo.png", "/logo/acme.com"]);
    expect(googleFaviconDomain("https://www.google.com/maps")).toBeNull();
  });
});

describe("source terms (contract 1.1)", () => {
  const remotive = { terms: { noJobPostingSchema: true, noThirdPartySyndication: true } };
  it("no JobPosting JSON-LD / syndication for restricted feeds unless an official source exists", () => {
    expect(allowsJobPostingSchema({ isOfficial: false, sources: [remotive] })).toBe(false);
    expect(allowsSyndication({ isOfficial: false, sources: [remotive] })).toBe(false);
    expect(allowsJobPostingSchema({ isOfficial: true, sources: [{}, remotive] })).toBe(true);
    expect(allowsJobPostingSchema({ isOfficial: false, sources: [{}] })).toBe(true);
  });
});
