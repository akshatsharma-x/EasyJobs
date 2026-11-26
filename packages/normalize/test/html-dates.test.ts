import { describe, expect, it } from "vitest";
import { htmlToText, parseDate, parsePostedAt, sanitizeDescription, summarize, textToHtml } from "../src/index";

describe("sanitizeDescription", () => {
  it("decodes Greenhouse-style escaped HTML and drops empty paragraphs", () => {
    const gh =
      "&lt;div class=&quot;content-intro&quot;&gt;&lt;p&gt;&lt;strong&gt;About Stripe&lt;/strong&gt;&lt;/p&gt;&lt;/div&gt;&lt;h2&gt;What you’ll do&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Build APIs&lt;/li&gt;&lt;li&gt;&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;&amp;nbsp;&lt;/p&gt;";
    expect(sanitizeDescription(gh)).toBe("<p><strong>About Stripe</strong></p><h2>What you’ll do</h2><ul><li>Build APIs</li></ul>");
  });
  it("decodes double-escaped HTML", () => {
    expect(sanitizeDescription("&amp;lt;p&amp;gt;Hello&amp;lt;/p&amp;gt;")).toBe("<p>Hello</p>");
  });
  it("strips styles, scripts, iframes, images (tracking pixels), forms and event handlers", () => {
    const html = `<div style="color:red" onclick="x()"><script>alert(1)</script><style>p{}</style><p class="a">Hi <img src="https://t.co/p.gif" width="1" height="1"><iframe src="https://evil"></iframe></p><form><input value="x"></form><noscript>no</noscript></div>`;
    expect(sanitizeDescription(html)).toBe("<p>Hi</p>");
  });
  it("keeps the allowlist: lists, headings, emphasis, blockquote, code, pre, tables", () => {
    const html = `<h1>Title</h1><h5>Small</h5><p><b>b</b> <strong>s</strong> <i>i</i> <em>e</em> <code>x()</code></p><blockquote>q</blockquote><pre>a\n  b</pre><table><thead><tr><th>k</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table><ol><li>one</li></ol>`;
    expect(sanitizeDescription(html)).toBe(
      "<h2>Title</h2><h4>Small</h4><p><b>b</b> <strong>s</strong> <i>i</i> <em>e</em> <code>x()</code></p><blockquote>q</blockquote><pre>a\n  b</pre><table><thead><tr><th>k</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table><ol><li>one</li></ol>",
    );
  });
  it("adds rel/target to links, resolves relative hrefs and unwraps unsafe ones", () => {
    const html = `<p><a href="/apply?id=1">apply</a> <a href="javascript:alert(1)">bad</a> <a href="mailto:jobs@acme.com">mail</a> <a>bare</a></p>`;
    expect(sanitizeDescription(html, { baseUrl: "https://careers.acme.com/jobs/1" })).toBe(
      '<p><a href="https://careers.acme.com/apply?id=1" rel="nofollow noopener noreferrer" target="_blank">apply</a> bad <a href="mailto:jobs@acme.com" rel="nofollow noopener noreferrer" target="_blank">mail</a> bare</p>',
    );
    expect(sanitizeDescription(`<a href="/x">rel</a>`)).toBe("rel");
  });
  it("turns div soup into paragraphs and collapses <br> runs", () => {
    expect(sanitizeDescription("<div><div><p>A</p></div><div>B<br><br><br><br>C</div><p></p><p>&nbsp;</p><div><br></div></div>")).toBe(
      "<p>A</p><p>B<br><br>C</p>",
    );
  });
  it("converts plain text to paragraphs and bullet lists", () => {
    expect(sanitizeDescription("About the role\nWe build things.\n\nRequirements:\n- Java\n• AWS")).toBe(
      "<p>About the role<br>We build things.</p><p>Requirements:</p><ul><li>Java</li><li>AWS</li></ul>",
    );
    expect(textToHtml("1. First\n2) Second")).toBe("<ul><li>First</li><li>Second</li></ul>");
  });
  it("escapes stray angle brackets in text and returns null when nothing is left", () => {
    expect(sanitizeDescription("<p>CTC < 5 LPA & bonus</p>")).toBe("<p>CTC &lt; 5 LPA &amp; bonus</p>");
    expect(sanitizeDescription("<p> </p><script>x</script>")).toBeNull();
    expect(sanitizeDescription(null)).toBeNull();
    expect(sanitizeDescription({})).toBeNull();
  });
});

describe("htmlToText", () => {
  it("renders blocks, bullets and entities", () => {
    expect(htmlToText("<h2>Role</h2><p>We build <b>things</b> &amp; more.</p><ul><li>One</li><li>Two</li></ul><p>Line<br>break</p>")).toBe(
      "Role\n\nWe build things & more.\n\n• One\n• Two\n\nLine\nbreak",
    );
  });
  it("skips script/style content and comments, tolerates stray '<'", () => {
    expect(htmlToText("<p>a</p><script>var x = '<p>';</script><!-- hidden --><style>p{}</style><p>b < c</p>")).toBe("a\n\nb < c");
    expect(htmlToText("&lt;p&gt;escaped&lt;/p&gt;")).toBe("escaped");
    expect(htmlToText("")).toBe("");
  });
});

describe("summarize", () => {
  it("starts at the role section, keeps whole sentences and stays ≤ 280 chars", () => {
    const text =
      "About Acme:\nAcme is a leading global provider of widgets since 1990. We have 10,000 employees.\n\nAbout the Role:\nAs a Software Engineer Intern, you will build scalable services in Go and Kubernetes for our payments platform. You will work with senior engineers on real production systems, e.g. our ledger. The internship lasts 6 months and pays a stipend of Rs. 40,000/month. Strong DSA skills required.";
    const s = summarize(text) as string;
    expect(s.startsWith("As a Software Engineer Intern")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(280);
    expect(s.endsWith(".")).toBe(true);
    expect(s).toContain("e.g. our ledger");
  });
  it("drops headings and truncates a single long sentence at a word boundary", () => {
    expect(summarize("PREFERRED QUALIFICATIONS\nWho you are\n• Five years of Java experience")).toBe("Five years of Java experience.");
    const long = summarize(`${"word ".repeat(100)}end.`) as string;
    expect(long.length).toBeLessThanOrEqual(280);
    expect(long.endsWith("…")).toBe(true);
    expect(summarize("")).toBeNull();
  });
});

describe("parsePostedAt / parseDate", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const day = 86_400_000;
  const iso = (ms: number): string => new Date(ms).toISOString();
  const cases: [unknown, string][] = [
    ["2026-11-20T10:00:00Z", "2026-11-20T10:00:00.000Z"],
    ["2026-11-20T10:00:00+05:30", "2026-11-20T04:30:00.000Z"],
    ["2026-11-20", "2026-11-20T00:00:00.000Z"],
    ["2026-11-20 10:00:00", "2026-11-20T10:00:00.000Z"],
    [1763971200, "2025-11-24T08:00:00.000Z"],
    [1763971200000, "2025-11-24T08:00:00.000Z"],
    ["1763971200", "2025-11-24T08:00:00.000Z"],
    ["Posted Today", now.toISOString()],
    ["Today", now.toISOString()],
    ["Just now", now.toISOString()],
    ["Just posted", now.toISOString()],
    ["Yesterday", iso(now.getTime() - day)],
    ["2 days ago", iso(now.getTime() - 2 * day)],
    ["Posted 3 days ago", iso(now.getTime() - 3 * day)],
    ["5 hours ago", iso(now.getTime() - 5 * 3_600_000)],
    ["30 minutes ago", iso(now.getTime() - 30 * 60_000)],
    ["an hour ago", iso(now.getTime() - 3_600_000)],
    ["1 week ago", iso(now.getTime() - 7 * day)],
    ["2 weeks ago", iso(now.getTime() - 14 * day)],
    ["a month ago", iso(now.getTime() - 30 * day)],
    ["30+ Days Ago", iso(now.getTime() - 30 * day)],
    ["Posted 30+ Days Ago", iso(now.getTime() - 30 * day)],
    ["5d", iso(now.getTime() - 5 * day)],
    ["Posted on 12 Nov 2025", "2025-11-12T00:00:00.000Z"],
    ["12th November, 2025", "2025-11-12T00:00:00.000Z"],
    ["Nov 12, 2025", "2025-11-12T00:00:00.000Z"],
    ["12-Nov-2025", "2025-11-12T00:00:00.000Z"],
    ["12/11/2025", "2025-11-12T00:00:00.000Z"],
    ["11/25/2025", "2025-11-25T00:00:00.000Z"],
    ["2025/11/12", "2025-11-12T00:00:00.000Z"],
    ["Tue, 25 Nov 2025 10:00:00 GMT", "2025-11-25T10:00:00.000Z"],
  ];
  it.each(cases)("%j → %s", (input, expected) => expect(parsePostedAt(input, now)).toBe(expected));

  it("falls back to now for missing, garbage, ancient or future values", () => {
    for (const v of [null, undefined, "", "never", "soon", {}, 0, "1970-01-01", "2030-01-01", "31/02/2026"]) {
      expect(parsePostedAt(v, now)).toBe(now.toISOString());
    }
  });
  it("parseDate returns null instead of falling back (used for validThrough)", () => {
    expect(parseDate("31 Dec 2026", { now })).toBe("2026-12-31T00:00:00.000Z");
    expect(parseDate("whenever", { now })).toBeNull();
  });
});
