import { describe, expect, it } from "vitest";
import { parseRssItems } from "../src/lib";
import { cleanZohoDescription, parseZohoItem, zoho, zohoCities, zohoLocation } from "../src/sites/zoho";
import { collect, fakeHttp, fixture, invalidJobs } from "./helpers";

describe("zoho", () => {
  it("parses the Zoho Recruit RSS feed into valid RawJobs", async () => {
    const http = fakeHttp([{ match: /\/jobs\/Careers\/rss$/, file: "zoho/rss.xml", contentType: "application/rss+xml" }]);
    const jobs = await collect(zoho, { http });
    expect(jobs).toHaveLength(5);
    expect(invalidJobs(jobs)).toEqual([]);
    expect(http.calls).toHaveLength(1);
    const dev = jobs.find((j) => j.title === "Software Developers")!;
    expect(dev).toMatchObject({
      source: "zoho",
      sourceKind: "career_site",
      sourceJobId: "193779000024446019",
      sourceUrl: "https://careers.zohocorp.com/jobs/Careers/193779000024446019/Software-Developers",
      applyUrl: "https://careers.zohocorp.com/jobs/Careers/193779000024446019/Software-Developers",
      company: "Zoho",
      department: "Technology",
      postedAt: "2022-06-24T06:30:00.000Z",
      locations: ["Chennai, India", "Salem, India", "Coimbatore, India", "Tirunelveli, India", "Madurai, India"],
    });
    expect(dev.descriptionHtml).toMatch(/^<ul><li>Design and develop/);
    expect(dev.descriptionHtml).not.toMatch(/Category:|Details<\/a>|style=/);
    expect(jobs.find((j) => j.title === "Content/Technical Writers")).toBeTruthy();
  });

  it("normalizes Zoho's location line and city sentence", () => {
    expect(zohoLocation("Tamil Nadu Tamil Nadu India")).toBe("Tamil Nadu, India");
    expect(zohoLocation("Chennai Tamil Nadu India")).toBe("Chennai Tamil Nadu India");
    expect(zohoCities("Please note that we have requirements for this role in Chennai, Salem, and Madurai.")).toEqual(["Chennai", "Salem", "Madurai"]);
    expect(zohoCities("No sentence here")).toEqual([]);
  });

  it("falls back to the location line when no cities are named", () => {
    const [item] = parseRssItems(
      `<rss><channel><item><title>QA Intern</title><link>https://careers.zohocorp.com/jobs/Careers/1/QA-Intern?source=RSS</link>
       <description><![CDATA[Category: Technology <br><br>Location: Tamil Nadu Tamil Nadu India <br><br><p>Test things.</p>]]></description>
       <guid isPermaLink='false'>1</guid><pubDate>Mon, 29 Sep 2025 10:00:13 IST</pubDate></item></channel></rss>`,
    );
    const parsed = parseZohoItem(item!)!;
    expect(parsed.locationLine).toBe("Tamil Nadu, India");
    expect(cleanZohoDescription("Category: X <br><br>Location: Y <br><br><p>Body</p><br><a href='x'>Details</a>")).toBe("<p>Body</p>");
  });

  it("reads the feed fixture shape", () => {
    const items = parseRssItems(fixture("zoho/rss.xml"));
    expect(items.map((i) => i.guid)).toHaveLength(5);
    expect(items[0]?.pubDate).toBe("Fri, 24 Jun 2022 12:00:00 IST");
  });
});
