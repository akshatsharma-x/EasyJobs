/**
 * @easyjobs/scraper-open-apis — open job APIs & feeds (prompts.md P12).
 * One Scraper per source; see README.md for terms, rate limits and env vars.
 */
import type { Scraper } from "@easyjobs/contract/node";
import { adzunaScraper } from "./sources/adzuna";
import { arbeitnowScraper } from "./sources/arbeitnow";
import { himalayasScraper } from "./sources/himalayas";
import { hnWhoIsHiringScraper } from "./sources/hn-whoishiring";
import { jobicyScraper } from "./sources/jobicy";
import { joobleScraper } from "./sources/jooble";
import { remoteokScraper } from "./sources/remoteok";
import { remotiveScraper } from "./sources/remotive";
import { themuseScraper } from "./sources/themuse";
import { unstopScraper } from "./sources/unstop";
import { weworkremotelyScraper } from "./sources/weworkremotely";

export const scrapers: Scraper[] = [
  unstopScraper,
  adzunaScraper,
  joobleScraper,
  themuseScraper,
  remotiveScraper,
  remoteokScraper,
  arbeitnowScraper,
  himalayasScraper,
  jobicyScraper,
  weworkremotelyScraper,
  hnWhoIsHiringScraper,
];
export default scrapers;

export {
  adzunaScraper,
  arbeitnowScraper,
  himalayasScraper,
  hnWhoIsHiringScraper,
  jobicyScraper,
  joobleScraper,
  remoteokScraper,
  remotiveScraper,
  themuseScraper,
  unstopScraper,
  weworkremotelyScraper,
};
export { SourceBlockedError } from "./lib/http";
export { assessRemote, classifyRegion, type RemoteScope } from "./lib/region";
