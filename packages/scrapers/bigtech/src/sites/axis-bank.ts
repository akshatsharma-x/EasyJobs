/**
 * Axis Bank — axisbank.ripplehire.com (RippleHire), linked from https://www.axis.bank.in/careers.
 * ~9,500 India openings (mostly branch banking / sales). See src/sites/_ripplehire.ts and
 * docs/sites/axis-bank.md. jobTypeCustom3 carries the work mode ("Onsite") on this tenant.
 */
import { createRippleHireScraper, type RippleHireSite } from "./_ripplehire";

export const AXIS_BANK_SITE: RippleHireSite = {
  company: {
    slug: "axis-bank",
    name: "Axis Bank",
    domain: "axisbank.com",
    careersUrl: "https://www.axis.bank.in/careers",
  },
  name: "Axis Bank Careers",
  host: "axisbank.ripplehire.com",
  token: "WIXhCuz0XRZ7H0GZCwjJ",
  intervalMinutes: 60,
  custom3: "workMode",
};

export const axisBank = createRippleHireScraper(AXIS_BANK_SITE);
