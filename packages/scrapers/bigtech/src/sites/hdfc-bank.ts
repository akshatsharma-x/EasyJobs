/**
 * HDFC Bank — hdfcbank.ripplehire.com (RippleHire), linked from https://www.hdfc.bank.in/careers
 * (hdfcbank.ripplehire.com/candidate/careers redirects to the token URL below).
 * See src/sites/_ripplehire.ts and docs/sites/hdfc-bank.md. jobTypeCustom3 carries the employment
 * type ("Permanent") on this tenant.
 */
import { createRippleHireScraper, type RippleHireSite } from "./_ripplehire";

export const HDFC_BANK_SITE: RippleHireSite = {
  company: {
    slug: "hdfc-bank",
    name: "HDFC Bank",
    domain: "hdfcbank.com",
    careersUrl: "https://www.hdfc.bank.in/careers",
  },
  name: "HDFC Bank Careers",
  host: "hdfcbank.ripplehire.com",
  token: "pvB5iAMcmu4ydUh2IW2O",
  intervalMinutes: 60,
  custom3: "employmentType",
};

export const hdfcBank = createRippleHireScraper(HDFC_BANK_SITE);
