import type { Scraper } from "@easyjobs/contract/node";
import { avatureScraper } from "./avature/scraper";
import { eightfoldScraper } from "./eightfold/scraper";
import { icimsScraper } from "./icims/scraper";
import { jsonldScraper } from "./jsonld/scraper";
import { oracleScraper } from "./oracle/scraper";
import { phenomScraper } from "./phenom/scraper";
import { successFactorsScraper } from "./successfactors/scraper";
import { taleoScraper } from "./taleo/scraper";
import { workdayScraper } from "./workday/scraper";

/** One Scraper per enterprise ATS platform (kind "ats", driven by ctx.targets — prompts.md §0.6 tokens). */
export const scrapers: Scraper[] = [
  workdayScraper,
  oracleScraper,
  eightfoldScraper,
  jsonldScraper,
  successFactorsScraper,
  phenomScraper,
  icimsScraper,
  avatureScraper,
  taleoScraper,
];
export default scrapers;
