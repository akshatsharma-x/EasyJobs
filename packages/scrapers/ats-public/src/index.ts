/**
 * @easyjobs/scraper-ats-public — official jobs from public ATS job-board APIs.
 * One Scraper per ATS (kind "ats", handlesAts set), each driven by ctx.targets from the registry.
 */
import type { Scraper } from "@easyjobs/contract/node";
import { ashby } from "./adapters/ashby";
import { bamboohr } from "./adapters/bamboohr";
import { breezy } from "./adapters/breezy";
import { greenhouse } from "./adapters/greenhouse";
import { lever } from "./adapters/lever";
import { personio } from "./adapters/personio";
import { recruitee } from "./adapters/recruitee";
import { smartrecruiters } from "./adapters/smartrecruiters";
import { teamtailor } from "./adapters/teamtailor";
import { workable } from "./adapters/workable";
import { createAtsScraper } from "./core/run";
import type { AtsAdapter } from "./core/types";

export const adapters: readonly AtsAdapter[] = [
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  workable,
  recruitee,
  bamboohr,
  personio,
  breezy,
  teamtailor,
];

export const greenhouseScraper: Scraper = createAtsScraper(greenhouse);
export const leverScraper: Scraper = createAtsScraper(lever);
export const ashbyScraper: Scraper = createAtsScraper(ashby);
export const smartrecruitersScraper: Scraper = createAtsScraper(smartrecruiters);
export const workableScraper: Scraper = createAtsScraper(workable);
export const recruiteeScraper: Scraper = createAtsScraper(recruitee);
export const bamboohrScraper: Scraper = createAtsScraper(bamboohr);
export const personioScraper: Scraper = createAtsScraper(personio);
export const breezyScraper: Scraper = createAtsScraper(breezy);
export const teamtailorScraper: Scraper = createAtsScraper(teamtailor);

export const scrapers: Scraper[] = [
  greenhouseScraper,
  leverScraper,
  ashbyScraper,
  smartrecruitersScraper,
  workableScraper,
  recruiteeScraper,
  bamboohrScraper,
  personioScraper,
  breezyScraper,
  teamtailorScraper,
];

export default scrapers;

export { createAtsScraper, DEFAULT_MAX_DETAILS, DISABLE_ENV, MAX_DETAILS_ENV } from "./core/run";
export type { AtsAdapter, TargetContext } from "./core/types";
