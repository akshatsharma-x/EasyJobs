import { describe, expect, it } from "vitest";
import { compactName, coreName, editDistance, isLikelyTypo, jaroWinkler, namesMatch, normalizeDomain, normalizeName, registrableDomain } from "../src/normalize";
import { domainStem, slugVariants } from "../scripts/lib/variants";

describe("normalizeName", () => {
  it.each([
    ["Amazon Development Centre (India) Pvt. Ltd.", "amazon development centre"],
    ["Tata Consultancy Services Limited", "tata consultancy services"],
    ["J.P. Morgan", "jp morgan"],
    ["JPMorgan Chase & Co.", "jpmorgan chase"],
    ["McDonald's", "mcdonalds"],
    ["The Walt Disney Company", "walt disney company"],
    ["SAP SE", "sap"],
    ["Société Générale", "societe generale"],
    ["  Razorpay Software Pvt Ltd  ", "razorpay software"],
    ["Deutsche Bank AG", "deutsche bank"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});

describe("coreName / compactName", () => {
  it("strips generic trailing words but keeps something distinctive", () => {
    expect(coreName("HCL Technologies")).toBe("hcl");
    expect(coreName("Palantir Technologies Inc.")).toBe("palantir");
    expect(coreName("Wipro Limited India")).toBe("wipro");
    expect(coreName("Google India Pvt Ltd")).toBe("google");
    expect(coreName("Technologies")).toBe("technologies");
  });
  it("compacts to ATS-token shape", () => {
    expect(compactName("Urban Company")).toBe("urbancompany");
    expect(compactName("J.P. Morgan")).toBe("jpmorgan");
    expect(compactName("Procter & Gamble")).toBe("procterandgamble");
  });
});

describe("domains", () => {
  it.each([
    ["https://www.Stripe.com/jobs?x=1", "stripe.com"],
    ["careers.google.com", "careers.google.com"],
    ["www2.deloitte.com/in/en/careers.html", "deloitte.com"],
    ["not a domain", null],
    ["", null],
  ])("normalizeDomain(%s)", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });
  it("registrableDomain handles two-label suffixes", () => {
    expect(registrableDomain("careers.google.com")).toBe("google.com");
    expect(registrableDomain("jobs.tcs.co.in")).toBe("tcs.co.in");
    expect(registrableDomain("hdfcbank.com")).toBe("hdfcbank.com");
  });
});

describe("namesMatch", () => {
  it.each([
    ["Palantir", "Palantir Technologies", true],
    ["PhonePe", "PhonePe Private Limited", true],
    ["ShareChat", "Share Chat", true],
    ["Stripe", "Stripe India Pvt Ltd", true],
    ["Stripe", "Stripe Payments India", false], // "payments" is not a qualifier word
    ["Razorpay", "Razorpy", true],
    ["Meta", "Metamorphosis", false],
    ["Stripe", "Strike", false],
    ["American Express", "American Airlines", false],
    ["Box", "Box Office Mojo", false],
  ])("%s ≈ %s → %s", (a, b, expected) => {
    expect(namesMatch(a, b)).toBe(expected);
  });
  it("editDistance / isLikelyTypo", () => {
    expect(editDistance("goldmansach", "goldmansachs", 2)).toBe(1);
    expect(editDistance("infsoys", "infosys", 2)).toBe(1); // transposition
    expect(editDistance("abcdef", "uvwxyz", 2)).toBe(3); // capped at max + 1
    expect(isLikelyTypo("razorpy", "razorpay")).toBe(true);
    expect(isLikelyTypo("strike", "stripe")).toBe(false); // substitution in a short name
    expect(isLikelyTypo("lift", "lyft")).toBe(false); // too short
    expect(isLikelyTypo("ltimindtre", "ltimindtree")).toBe(true);
  });
  it("jaroWinkler is symmetric and bounded", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 2);
    expect(jaroWinkler("abc", "abc")).toBe(1);
    expect(jaroWinkler("", "abc")).toBe(0);
    expect(jaroWinkler("dixon", "dicksonx")).toBeCloseTo(jaroWinkler("dicksonx", "dixon"), 10);
  });
});

describe("slugVariants (probe)", () => {
  it("covers name, hyphenated, domain stem and the hq/inc/india suffixes", () => {
    const v = slugVariants({ name: "Urban Company", domain: "urbancompany.com" });
    expect(v.base).toEqual(["urbancompany", "urban-company", "urban"]);
    expect(v.suffixed).toEqual(["urbancompanyhq", "urbancompanyinc", "urban-company-india", "urbancompanyindia"]);
  });
  it("uses the domain stem when it differs from the name", () => {
    const v = slugVariants({ name: "Zepto", domain: "zeptonow.com" });
    expect(v.base).toContain("zepto");
    expect(v.base).toContain("zeptonow");
  });
  it("drops get/try prefixes from domain stems", () => {
    expect(domainStem("getsimpl.com")).toBe("getsimpl");
    expect(slugVariants({ name: "Simpl", domain: "getsimpl.com" }).base).toEqual(["simpl", "getsimpl"]);
  });
  it("never emits invalid tokens", () => {
    const v = slugVariants({ name: "Dr. Reddy's", domain: null });
    for (const t of [...v.base, ...v.suffixed]) expect(t).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });
});
