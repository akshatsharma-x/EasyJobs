/**
 * A 200 with an unexpected body must FAIL the run. Treating it as an empty board would make the worker's sweep
 * close every stored job of that company.
 */
import { describe, expect, it } from "vitest";
import { ashbyBoardUrl } from "../src/adapters/ashby";
import { bambooListUrl, bambooOrigin } from "../src/adapters/bamboohr";
import { breezyOrigin, breezyPositionsUrl } from "../src/adapters/breezy";
import { greenhouseBoardUrl } from "../src/adapters/greenhouse";
import { leverPageUrl } from "../src/adapters/lever";
import { personioFeedUrl, personioOrigin } from "../src/adapters/personio";
import { recruiteeOffersUrl, recruiteeOrigin } from "../src/adapters/recruitee";
import { srListUrl } from "../src/adapters/smartrecruiters";
import { teamtailorFeedUrl, teamtailorOrigin } from "../src/adapters/teamtailor";
import { workableAccountUrl } from "../src/adapters/workable";
import { UnexpectedResponseError } from "../src/core/errors";
import { scrapers } from "../src/index";
import { collect, ctx, fakeHttp, json, target, xml, type FakeResponse } from "./helpers";

const JSON_ERR = json({ error: "maintenance" });
const HTML = xml("<html><body>maintenance</body></html>");
const cases: [string, string, FakeResponse][] = [
  ["greenhouse", greenhouseBoardUrl("acme"), JSON_ERR],
  ["lever", leverPageUrl({ site: "acme", region: "global" }, 0), JSON_ERR],
  ["ashby", ashbyBoardUrl("acme"), JSON_ERR],
  ["smartrecruiters", srListUrl("acme", 0), JSON_ERR],
  ["workable", workableAccountUrl("acme"), JSON_ERR],
  ["recruitee", recruiteeOffersUrl(recruiteeOrigin("acme")), JSON_ERR],
  ["bamboohr", bambooListUrl(bambooOrigin("acme")), json(null)],
  ["personio", personioFeedUrl(personioOrigin("acme"), "en"), HTML],
  ["breezy", breezyPositionsUrl(breezyOrigin("acme")), JSON_ERR],
  ["teamtailor", teamtailorFeedUrl(teamtailorOrigin("acme"), 0), HTML],
];

describe("malformed 200 responses", () => {
  it.each(cases)("%s: rejects instead of reporting an empty board", async (id, url, response) => {
    const scraper = scrapers.find((s) => s.id === id)!;
    const t = target({ slug: "acme", ats: scraper.handlesAts![0]!, token: "acme" });
    await expect(collect(scraper.scrape(ctx(fakeHttp({ [url]: response }), [t])))).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it("an HTML page where JSON was expected is reported with context", async () => {
    const scraper = scrapers.find((s) => s.id === "greenhouse")!;
    const http = fakeHttp({ [greenhouseBoardUrl("acme")]: { status: 200, body: "<html>login</html>", headers: { "content-type": "text/html" } } });
    await expect(collect(scraper.scrape(ctx(http, [target({ slug: "acme", ats: "greenhouse", token: "acme" })])))).rejects.toThrow(
      /expected JSON, got text\/html: "<html>login<\/html>"/,
    );
  });
});
