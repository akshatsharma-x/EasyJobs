/**
 * @easyjobs/scraper-bigtech — one Scraper per company with a custom-built career portal.
 * Scraper id = registry company slug; kind "career_site"; no handlesAts.
 */
import type { Scraper } from "@easyjobs/contract/node";
import type { CareerSiteScraper } from "./lib/site";
import { accenture } from "./sites/accenture";
import { amazon } from "./sites/amazon";
import { atlassian } from "./sites/atlassian";
import { axisBank } from "./sites/axis-bank";
import { apple } from "./sites/apple";
import { capgemini } from "./sites/capgemini";
import { cognizant } from "./sites/cognizant";
import { deloitte } from "./sites/deloitte";
import { ey } from "./sites/ey";
import { flipkart } from "./sites/flipkart";
import { google } from "./sites/google";
import { hcltech } from "./sites/hcltech";
import { hdfcBank } from "./sites/hdfc-bank";
import { ibm } from "./sites/ibm";
import { infosys } from "./sites/infosys";
import { ltimindtree } from "./sites/ltimindtree";
import { meta } from "./sites/meta";
import { microsoft } from "./sites/microsoft";
import { nttData } from "./sites/ntt-data";
import { tataElxsi } from "./sites/tata-elxsi";
import { tcs } from "./sites/tcs";
import { techMahindra } from "./sites/tech-mahindra";
import { uber } from "./sites/uber";
import { wipro } from "./sites/wipro";
import { zoho } from "./sites/zoho";

/** All company scrapers (enabled and disabled — check `isEnabled(env)`). */
export const careerSites: CareerSiteScraper[] = [
  // Big Tech & product
  amazon, google, microsoft, apple, meta, ibm, atlassian, uber, flipkart, zoho,
  // Indian IT services & consulting
  tcs, infosys, wipro, hcltech, techMahindra, cognizant, capgemini, accenture, deloitte, ltimindtree,
  // Extras beyond the P09 target list (custom portals of other large India employers)
  ey, nttData, tataElxsi, axisBank, hdfcBank,
];

export const scrapers: Scraper[] = careerSites;
export default scrapers;

export type { CareerSiteScraper, RunStats } from "./lib/site";
