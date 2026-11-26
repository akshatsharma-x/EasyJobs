import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractLinks, fixMojibake, htmlToPlain, stripInline, textToHtml } from "../src/lib/html";
import { fetchJson, quoteBigIntegers, redact, SourceBlockedError } from "../src/lib/http";
import { englishShare } from "../src/lib/lang";
import { applyLinkScore, companyDomainOf, isAtsUrl, isCareersUrl } from "../src/lib/links";
import { RedirectResolver } from "../src/lib/redirect";
import { formatSalary, makeSalary, mapPeriod } from "../src/lib/salary";
import { jobTypeFrom, levelFrom, lowestLevel } from "../src/lib/taxonomy";
import { cleanList, envInt, envList, httpUrl, isDisabledByEnv, toIso } from "../src/lib/util";
import { fakeHttp, testCtx } from "./helpers";

describe("util", () => {
  it("toIso handles the formats our sources send", () => {
    expect(toIso("2026-11-25 20:54:54 GMT+0530")).toBe("2026-11-25T15:24:54.000Z");
    expect(toIso("2026-11-24T10:31:32")).toBe("2026-11-24T10:31:32.000Z");
    expect(toIso("2026-11-24T00:00:00.0000000")).toBe("2026-11-24T00:00:00.000Z");
    expect(toIso("Wed, 25 Nov 2026 21:40:10 +0000")).toBe("2026-11-25T21:40:10.000Z");
    expect(toIso(1795640655)).toBe("2026-11-25T21:04:15.000Z");
    expect(toIso("1795640655000")).toBe("2026-11-25T21:04:15.000Z");
    expect(toIso("2026-12-09T00:00:00+05:30")).toBe("2026-12-08T18:30:00.000Z");
    expect(toIso("nonsense")).toBeNull();
    expect(toIso(0)).toBeNull();
    expect(toIso("1970-01-01T00:00:00Z")).toBeNull();
  });
  it("env helpers", () => {
    expect(envInt({ X: "7" }, "X", 1, 1, 5)).toBe(5);
    expect(envInt({ X: "abc" }, "X", 3)).toBe(3);
    expect(envList({ L: " a, ,b " }, "L", [])).toEqual(["a", "b"]);
    expect(isDisabledByEnv({ OPEN_APIS_DISABLED: "RemoteOK, jobicy" }, "remoteok")).toBe(true);
    expect(isDisabledByEnv({}, "remoteok")).toBe(false);
  });
  it("httpUrl / cleanList", () => {
    expect(httpUrl("https://remoteOK.com/remote-jobs/x")).toBe("https://remoteok.com/remote-jobs/x");
    expect(httpUrl("javascript:alert(1)")).toBeNull();
    expect(httpUrl("jobs/x-1", "https://unstop.com/")).toBe("https://unstop.com/jobs/x-1");
    expect(cleanList([" A ", "a", "", null, "B"])).toEqual(["A", "B"]);
  });
});

describe("html", () => {
  it("repairs UTF-8-as-cp1252 mojibake without touching valid text", () => {
    expect(fixMojibake("Itâ€™s great")).toBe("It’s great");
    // Remote OK sends "Â" + U+00A0 for a UTF-8 non-breaking space.
    expect(fixMojibake("<p>\u00c2\u00a0</p>")).toBe("<p>\u00a0</p>");
    expect(fixMojibake("CafÃ© crÃ¨me")).toBe("Café crème");
    expect(fixMojibake("Café — déjà vu ✓")).toBe("Café — déjà vu ✓");
  });
  it("text helpers", () => {
    expect(htmlToPlain("<p>One &amp; two</p><ul><li>three</li></ul>")).toBe("One & two\nthree");
    expect(stripInline("Dev <strong>Ops</strong> &amp; SRE")).toBe("Dev Ops & SRE");
    expect(textToHtml("a < b\n\nc")).toBe("<p>a &lt; b</p><p>c</p>");
    expect(extractLinks('<a href="https:&#x2F;&#x2F;x.io&#x2F;jobs" rel="nofollow">x</a>')).toEqual([{ href: "https://x.io/jobs", text: "x" }]);
  });
  it("englishShare", () => {
    expect(englishShare("We are looking for an engineer to join our team and you will work with the best")).toBeGreaterThan(0.9);
    expect(englishShare("Wir suchen eine engagierte Person für unser Team und du bist bei uns mit dabei, die Arbeit ist nicht schwer")).toBeLessThan(0.3);
  });
});

describe("salary / taxonomy", () => {
  it("makeSalary validates and never invents", () => {
    expect(makeSalary({ min: 0, max: 0, currency: "USD", period: "year" })).toBeNull();
    expect(makeSalary({ min: 100, max: 200, currency: null, period: "year" })).toBeNull();
    expect(makeSalary({ min: 100, max: 200, currency: "usd", period: "weekly" })).toBeNull();
    expect(makeSalary({ min: 200, max: 100, currency: "fa-rupee", period: "monthly" })).toMatchObject({ min: 100, max: 200, currency: "INR", period: "month" });
    expect(mapPeriod("annual")).toBe("year");
    expect(formatSalary(540000, 864000, "INR", "year")).toBe("₹5,40,000 – ₹8,64,000 /year");
  });
  it("jobTypeFrom / levelFrom / lowestLevel", () => {
    expect(jobTypeFrom("Full-Time")).toBe("full_time");
    expect(jobTypeFrom("Contractor")).toBe("contract");
    expect(jobTypeFrom("Intern")).toBe("internship");
    expect(jobTypeFrom("part_time")).toBe("part_time");
    expect(jobTypeFrom("Volunteer")).toBeUndefined();
    expect(levelFrom("Entry-Level, Junior")).toBe("entry");
    expect(levelFrom("Midweight")).toBe("mid");
    expect(levelFrom("Senior Director")).toBe("executive");
    expect(levelFrom("Senior Manager")).toBe("lead");
    expect(levelFrom("Any")).toBeUndefined();
    expect(lowestLevel(["senior", "entry", undefined, "mid"])).toBe("entry");
  });
});

describe("links", () => {
  it("scores apply links: ATS > careers > shortener > form > board > homepage; excludes profiles/threads", () => {
    expect(applyLinkScore("https://job-boards.greenhouse.io/acme/jobs/1")).toBe(10);
    expect(applyLinkScore("https://acme.com/careers/backend")).toBe(8);
    expect(applyLinkScore("https://grnh.se/abc")).toBe(6);
    expect(applyLinkScore("https://forms.gle/abc")).toBe(5);
    expect(applyLinkScore("https://www.ycombinator.com/companies/acme/jobs")).toBe(4);
    expect(applyLinkScore("https://acme.com")).toBe(3);
    expect(applyLinkScore("https://news.ycombinator.com/item?id=1")).toBe(-1);
    expect(applyLinkScore("https://www.linkedin.com/in/someone")).toBe(-1);
    expect(applyLinkScore("https://github.com/acme")).toBe(-1);
    expect(isAtsUrl("https://acme.wd5.myworkdayjobs.com/x")).toBe(true);
    expect(isCareersUrl("https://careers.acme.com/")).toBe(true);
  });
  it("companyDomainOf", () => {
    expect(companyDomainOf("https://careers.acme.co.uk/jobs")).toBe("acme.co.uk");
    expect(companyDomainOf("https://www.simpleanalytics.com/jobs/devops")).toBe("simpleanalytics.com");
    expect(companyDomainOf("https://jobs.lever.co/acme/1")).toBeNull();
    expect(companyDomainOf("https://forms.gle/x")).toBeNull();
  });
});

describe("http helpers", () => {
  it("quoteBigIntegers keeps 64-bit ids exact, leaves small numbers alone", () => {
    const parsed = JSON.parse(quoteBigIntegers('{"jobs":[{"id":-4795470203364034427,"n":12345678901234567},{"id":42}]}', ["id"]));
    expect(parsed.jobs[0].id).toBe("-4795470203364034427");
    expect(parsed.jobs[1].id).toBe(42);
  });
  it("redact removes secrets (also URL-encoded)", () => {
    expect(redact("https://x/api/k3y-123?key=k3y-123", ["k3y-123"])).toBe("https://x/api/***?key=***");
    expect(redact("q=key%20with%20space", ["key with space"])).toBe("q=***");
    expect(redact("short abc", ["abc"])).toBe("short abc"); // < 4 chars: too short to be a key
  });
  it("Cloudflare challenge → SourceBlockedError; HTML instead of JSON → descriptive error", async () => {
    const blocked = fakeHttp([{ match: "a.test", status: 403, body: "<title>Just a moment...</title>" }]);
    await expect(fetchJson(testCtx(blocked), "src", "https://a.test/api")).rejects.toBeInstanceOf(SourceBlockedError);
    const html = fakeHttp([{ match: "b.test", body: "<!doctype html><p>hi</p>" }]);
    await expect(fetchJson(testCtx(html), "src", "https://b.test/api")).rejects.toThrow(/expected JSON/);
  });
});

describe("RedirectResolver", () => {
  it("resolves once, caches to disk (including failures), falls back to the input URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p12-redirects-"));
    const file = join(dir, "redirects.json");
    const http = fakeHttp([
      { match: "https://bit.ly/abc", body: "", finalUrl: "https://jobs.lever.co/acme/123" },
      { match: "https://down.example", status: 500, body: "" },
    ]);
    const r1 = new RedirectResolver({ cacheFile: file });
    expect(await r1.resolve("https://bit.ly/abc", http)).toBe("https://jobs.lever.co/acme/123");
    expect(await r1.resolve("https://bit.ly/abc", http)).toBe("https://jobs.lever.co/acme/123");
    expect(await r1.resolve("https://down.example/careers", http)).toBe("https://down.example/careers");
    r1.flush();
    const callsAfterFirst = http.calls.length;
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved.entries["https://bit.ly/abc"].final).toBe("https://jobs.lever.co/acme/123");
    const r2 = new RedirectResolver({ cacheFile: file });
    expect(await r2.resolve("https://bit.ly/abc", http)).toBe("https://jobs.lever.co/acme/123");
    expect(await r2.resolve("https://down.example/careers", http)).toBe("https://down.example/careers");
    expect(http.calls.length).toBe(callsAfterFirst);
  });
  it("respects the per-run budget", async () => {
    const http = fakeHttp([{ match: "https://", body: "", finalUrl: "https://final.example/" }]);
    const r = new RedirectResolver({ cacheFile: null, maxPerRun: 1 });
    expect(await r.resolve("https://a.example/1", http)).toBe("https://final.example/");
    expect(await r.resolve("https://a.example/2", http)).toBe("https://a.example/2");
  });
});

describe("RedirectResolver · login walls", () => {
  it("a redirect to a sign-in page is not an apply URL", async () => {
    const { isLoginWall } = await import("../src/lib/redirect");
    expect(isLoginWall("https://accounts.google.com/v3/signin/identifier?continue=x")).toBe(true);
    expect(isLoginWall("https://acme.myworkdayjobs.com/en-US/login")).toBe(true);
    expect(isLoginWall("https://jobs.lever.co/acme/123")).toBe(false);
    const http = fakeHttp([{ match: "https://forms.gle/x", body: "", finalUrl: "https://accounts.google.com/v3/signin/identifier?continue=y" }]);
    const r = new RedirectResolver({ cacheFile: null });
    expect(await r.resolve("https://forms.gle/x", http)).toBe("https://forms.gle/x");
  });
});
