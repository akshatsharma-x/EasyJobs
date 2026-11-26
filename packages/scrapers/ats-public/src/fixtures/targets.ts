/**
 * Real, live companies per ATS, each verified against its public API (see scripts/verify-targets.ts).
 * Used by the CLI and the LIVE=1 smoke tests. The production list lives in @easyjobs/registry.
 * openJobs = board size at verifiedAt (for SmartRecruiters/Bosch: the India-filtered board).
 */
import type { CompanyTarget } from "@easyjobs/contract";

const VERIFIED_AT = "2026-11-25";

type Seed = Omit<CompanyTarget, "verifiedAt"> & { verifiedAt?: string };

const seeds: Seed[] = [
  /* ── Greenhouse ── */
  { slug: "groww", name: "Groww", domain: "groww.in", ats: "greenhouse", token: "groww", careersUrl: "https://job-boards.eu.greenhouse.io/groww", tags: ["unicorn", "fintech", "startup", "product"], hq: "Bengaluru, India", indiaPresence: true, priority: 1, openJobs: 8 },
  { slug: "inmobi", name: "InMobi", domain: "inmobi.com", ats: "greenhouse", token: "inmobi", careersUrl: "https://job-boards.greenhouse.io/inmobi", tags: ["unicorn", "product", "startup", "ai"], hq: "Bengaluru, India", indiaPresence: true, priority: 1, openJobs: 63 },
  { slug: "hackerrank", name: "HackerRank", domain: "hackerrank.com", ats: "greenhouse", token: "hackerrank", careersUrl: "https://job-boards.greenhouse.io/hackerrank", tags: ["product", "startup"], hq: "Mountain View, United States", indiaPresence: true, priority: 2, openJobs: 32 },
  { slug: "rubrik", name: "Rubrik", domain: "rubrik.com", ats: "greenhouse", token: "rubrik", careersUrl: "https://job-boards.greenhouse.io/rubrik", tags: ["mnc", "product"], hq: "Palo Alto, United States", indiaPresence: true, priority: 2, openJobs: 220 },
  { slug: "databricks", name: "Databricks", domain: "databricks.com", ats: "greenhouse", token: "databricks", careersUrl: "https://www.databricks.com/company/careers/open-positions", tags: ["mnc", "product", "ai"], hq: "San Francisco, United States", indiaPresence: true, priority: 1, openJobs: 874 },

  /* ── Lever (eu: prefix = api.eu.lever.co) ── */
  { slug: "paytm", name: "Paytm", domain: "paytm.com", ats: "lever", token: "paytm", careersUrl: "https://jobs.lever.co/paytm", tags: ["unicorn", "fintech", "product"], hq: "Noida, India", indiaPresence: true, priority: 1, openJobs: 192 },
  { slug: "meesho", name: "Meesho", domain: "meesho.com", ats: "lever", token: "meesho", careersUrl: "https://jobs.lever.co/meesho", tags: ["unicorn", "product", "startup"], hq: "Bengaluru, India", indiaPresence: true, priority: 1, openJobs: 48 },
  { slug: "mindtickle", name: "Mindtickle", domain: "mindtickle.com", ats: "lever", token: "mindtickle", careersUrl: "https://jobs.lever.co/mindtickle", tags: ["unicorn", "product", "startup"], hq: "San Francisco, United States", indiaPresence: true, priority: 2, openJobs: 20 },
  { slug: "spotify", name: "Spotify", domain: "spotify.com", ats: "lever", token: "spotify", careersUrl: "https://jobs.lever.co/spotify", tags: ["mnc", "product"], hq: "Stockholm, Sweden", indiaPresence: true, priority: 2, openJobs: 96 },
  { slug: "creatio", name: "Creatio", domain: "creatio.com", ats: "lever", token: "eu:creatio", careersUrl: "https://jobs.eu.lever.co/creatio", tags: ["product"], hq: "Boston, United States", indiaPresence: false, priority: 3, openJobs: 95 },

  /* ── Ashby ── */
  { slug: "sarvam-ai", name: "Sarvam AI", domain: "sarvam.ai", ats: "ashby", token: "sarvam", careersUrl: "https://jobs.ashbyhq.com/sarvam", tags: ["startup", "ai"], hq: "Bengaluru, India", indiaPresence: true, priority: 1, openJobs: 39 },
  { slug: "notion", name: "Notion", domain: "notion.com", ats: "ashby", token: "notion", careersUrl: "https://jobs.ashbyhq.com/notion", tags: ["unicorn", "product"], hq: "San Francisco, United States", indiaPresence: true, priority: 2, openJobs: 174 },
  { slug: "elevenlabs", name: "ElevenLabs", domain: "elevenlabs.io", ats: "ashby", token: "elevenlabs", careersUrl: "https://jobs.ashbyhq.com/elevenlabs", tags: ["unicorn", "ai", "startup"], hq: "New York, United States", indiaPresence: true, priority: 2, openJobs: 117 },
  { slug: "composio", name: "Composio", domain: "composio.dev", ats: "ashby", token: "composio", careersUrl: "https://jobs.ashbyhq.com/composio", tags: ["startup", "ai"], hq: null, indiaPresence: true, priority: 2, openJobs: 30 },
  { slug: "linear", name: "Linear", domain: "linear.app", ats: "ashby", token: "linear", careersUrl: "https://jobs.ashbyhq.com/linear", tags: ["startup", "product"], hq: "San Francisco, United States", indiaPresence: false, priority: 3, openJobs: 30 },

  /* ── SmartRecruiters (company identifier; extra.country = server-side country filter) ── */
  { slug: "freshworks", name: "Freshworks", domain: "freshworks.com", ats: "smartrecruiters", token: "Freshworks", careersUrl: "https://jobs.smartrecruiters.com/Freshworks", tags: ["product", "mnc"], hq: "San Mateo, United States", indiaPresence: true, priority: 1, openJobs: 120 },
  { slug: "servicenow", name: "ServiceNow", domain: "servicenow.com", ats: "smartrecruiters", token: "ServiceNow", careersUrl: "https://jobs.smartrecruiters.com/ServiceNow", tags: ["mnc", "product"], hq: "Santa Clara, United States", indiaPresence: true, priority: 1, openJobs: 972 },
  { slug: "nielseniq", name: "NielsenIQ", domain: "nielseniq.com", ats: "smartrecruiters", token: "NielsenIQ", careersUrl: "https://jobs.smartrecruiters.com/NielsenIQ", tags: ["mnc"], hq: "Chicago, United States", indiaPresence: true, priority: 2, openJobs: 435 },
  { slug: "experian", name: "Experian", domain: "experian.com", ats: "smartrecruiters", token: "Experian", careersUrl: "https://jobs.smartrecruiters.com/Experian", tags: ["mnc", "fintech"], hq: "Dublin, Ireland", indiaPresence: true, priority: 2, openJobs: 416 },
  { slug: "bosch", name: "Bosch", domain: "bosch.com", ats: "smartrecruiters", token: "BoschGroup", careersUrl: "https://jobs.smartrecruiters.com/BoschGroup", tags: ["mnc", "gcc"], hq: "Gerlingen, Germany", indiaPresence: true, priority: 2, openJobs: 687, extra: { country: "in" } },

  /* ── Workable (account slug) ── */
  { slug: "exponent-energy", name: "Exponent Energy", domain: "exponent.energy", ats: "workable", token: "exponent-energy", careersUrl: "https://apply.workable.com/exponent-energy/", tags: ["startup"], hq: "Bengaluru, India", indiaPresence: true, priority: 2, openJobs: 66 },
  { slug: "lokal", name: "Lokal", domain: "lokalapps.com", ats: "workable", token: "lokal-app", careersUrl: "https://apply.workable.com/lokal-app/", tags: ["startup"], hq: null, indiaPresence: true, priority: 2, openJobs: 79 },
  { slug: "mercari-india", name: "Mercari India", domain: "mercari.com", ats: "workable", token: "mercari-india", careersUrl: "https://apply.workable.com/mercari-india/", tags: ["mnc", "gcc", "product"], hq: "Tokyo, Japan", indiaPresence: true, priority: 2, openJobs: 12 },
  { slug: "covergo", name: "CoverGo", domain: "covergo.com", ats: "workable", token: "covergo", careersUrl: "https://apply.workable.com/covergo/", tags: ["startup", "fintech"], hq: null, indiaPresence: true, priority: 3, openJobs: 67 },
  { slug: "hugging-face", name: "Hugging Face", domain: "huggingface.co", ats: "workable", token: "huggingface", careersUrl: "https://apply.workable.com/huggingface/", tags: ["ai", "unicorn", "startup"], hq: "New York, United States", indiaPresence: false, priority: 3, openJobs: 10 },

  /* ── Recruitee (subdomain) ── */
  { slug: "advancy", name: "Advancy", domain: "advancy.com", ats: "recruitee", token: "advancy", careersUrl: "https://advancy.recruitee.com/", tags: ["consulting"], hq: "Paris, France", indiaPresence: false, priority: 3, openJobs: 18 },
  { slug: "acturis", name: "Acturis", domain: "acturis.com", ats: "recruitee", token: "acturis", careersUrl: "https://acturis.recruitee.com/", tags: ["product"], hq: "London, United Kingdom", indiaPresence: false, priority: 3, openJobs: 19 },
  { slug: "bunq", name: "bunq", domain: "bunq.com", ats: "recruitee", token: "bunq", careersUrl: "https://bunq.recruitee.com/", tags: ["fintech", "startup"], hq: "Amsterdam, Netherlands", indiaPresence: false, priority: 3, openJobs: 23 },
  { slug: "channable", name: "Channable", domain: "channable.com", ats: "recruitee", token: "channable", careersUrl: "https://channable.recruitee.com/", tags: ["product", "startup"], hq: "Utrecht, Netherlands", indiaPresence: false, priority: 3, openJobs: 10 },
  { slug: "addepto", name: "Addepto", domain: "addepto.com", ats: "recruitee", token: "addepto", careersUrl: "https://addepto.recruitee.com/", tags: ["ai", "service"], hq: "Warsaw, Poland", indiaPresence: false, priority: 3, openJobs: 8 },

  /* ── BambooHR (subdomain) ── */
  { slug: "acino", name: "Acino", domain: "acino.swiss", ats: "bamboohr", token: "acino", careersUrl: "https://acino.bamboohr.com/careers", tags: ["mnc"], hq: "Zurich, Switzerland", indiaPresence: false, priority: 3, openJobs: 46 },
  { slug: "ace-electric", name: "Ace Electric", domain: null, ats: "bamboohr", token: "aceelectric", careersUrl: "https://aceelectric.bamboohr.com/careers", tags: [], hq: null, indiaPresence: false, priority: 3, openJobs: 67 },
  { slug: "abstra", name: "Abstra", domain: null, ats: "bamboohr", token: "abstra", careersUrl: "https://abstra.bamboohr.com/careers", tags: ["service"], hq: null, indiaPresence: false, priority: 3, openJobs: 15 },
  { slug: "abi-research", name: "ABI Research", domain: "abiresearch.com", ats: "bamboohr", token: "abiresearch", careersUrl: "https://abiresearch.bamboohr.com/careers", tags: ["consulting"], hq: "Oyster Bay, United States", indiaPresence: false, priority: 3, openJobs: 6 },
  { slug: "1valet", name: "1VALET", domain: "1valet.com", ats: "bamboohr", token: "1valet", careersUrl: "https://1valet.bamboohr.com/careers", tags: ["startup", "product"], hq: "Ottawa, Canada", indiaPresence: false, priority: 3, openJobs: 9 },

  /* ── Personio (subdomain of jobs.personio.de) ── */
  { slug: "1komma5", name: "1KOMMA5°", domain: "1komma5.com", ats: "personio", token: "1komma5grad", careersUrl: "https://1komma5grad.jobs.personio.de/", tags: ["unicorn", "startup"], hq: "Hamburg, Germany", indiaPresence: false, priority: 3, openJobs: 343 },
  { slug: "360t", name: "360T", domain: "360t.com", ats: "personio", token: "360t", careersUrl: "https://360t.jobs.personio.de/", tags: ["fintech"], hq: "Frankfurt, Germany", indiaPresence: false, priority: 3, openJobs: 20 },
  { slug: "42watt", name: "42watt", domain: null, ats: "personio", token: "42watt", careersUrl: "https://42watt.jobs.personio.de/", tags: ["startup"], hq: null, indiaPresence: false, priority: 3, openJobs: 12 },
  { slug: "7learnings", name: "7Learnings", domain: "7learnings.com", ats: "personio", token: "7learnings", careersUrl: "https://7learnings.jobs.personio.de/", tags: ["startup", "ai"], hq: "Berlin, Germany", indiaPresence: false, priority: 3, openJobs: 5 },
  { slug: "accure", name: "ACCURE Battery Intelligence", domain: "accure.net", ats: "personio", token: "accure", careersUrl: "https://accure.jobs.personio.de/", tags: ["startup"], hq: "Aachen, Germany", indiaPresence: false, priority: 3, openJobs: 5 },

  /* ── Breezy HR (subdomain) ── */
  { slug: "20four7va", name: "20four7VA", domain: "20four7va.com", ats: "breezy", token: "20four7va", careersUrl: "https://20four7va.breezy.hr/", tags: ["service"], hq: null, indiaPresence: false, priority: 3, openJobs: 119 },
  { slug: "zerotoone-strategic", name: "ZeroToOne Strategic", domain: null, ats: "breezy", token: "021-strategic", careersUrl: "https://021-strategic.breezy.hr/", tags: ["consulting"], hq: null, indiaPresence: false, priority: 3, openJobs: 5 },
  { slug: "2ulaundry", name: "2ULaundry", domain: "2ulaundry.com", ats: "breezy", token: "2ulaundry", careersUrl: "https://2ulaundry.breezy.hr/", tags: ["startup"], hq: "Charlotte, United States", indiaPresence: false, priority: 3, openJobs: 6 },

  /* ── Teamtailor (subdomain; custom career domains also accepted as full URLs) ── */
  { slug: "lunar", name: "Lunar", domain: "lunar.app", ats: "teamtailor", token: "lunar", careersUrl: "https://jobs.lunar.app/jobs", tags: ["fintech", "startup"], hq: "Aarhus, Denmark", indiaPresence: false, priority: 3, openJobs: 26 },
  { slug: "tibber", name: "Tibber", domain: "tibber.com", ats: "teamtailor", token: "tibber", careersUrl: "https://jobs.tibber.com/jobs", tags: ["startup"], hq: null, indiaPresence: false, priority: 3, openJobs: 13 },
  { slug: "anyfin", name: "Anyfin", domain: "anyfin.com", ats: "teamtailor", token: "anyfin", careersUrl: "https://career.anyfin.com/jobs", tags: ["fintech", "startup"], hq: "Stockholm, Sweden", indiaPresence: false, priority: 3, openJobs: 15 },
  { slug: "sats", name: "SATS", domain: "sats.com", ats: "teamtailor", token: "sats", careersUrl: "https://careers.sats.com/jobs", tags: [], hq: "Oslo, Norway", indiaPresence: false, priority: 3, openJobs: 50 },
  // polestar.teamtailor.com was dropped: its robots.txt is "Disallow: /" (verified 2026-11-26).
  { slug: "qliro", name: "Qliro", domain: "qliro.com", ats: "teamtailor", token: "qliro", careersUrl: "https://qliro.teamtailor.com/jobs", tags: ["fintech"], hq: "Stockholm, Sweden", indiaPresence: false, priority: 3, openJobs: 8 },
];

export const targets: CompanyTarget[] = seeds.map((s) => ({ ...s, verifiedAt: s.verifiedAt ?? VERIFIED_AT }));

export const targetsFor = (ats: CompanyTarget["ats"]): CompanyTarget[] => targets.filter((t) => t.ats === ats);

export default targets;
