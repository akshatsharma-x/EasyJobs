# Citi — registry (extra, not in the P09 target list; no scraper here)

- jobs.citi.com is a Radancy TalentBrew front end. Its robots.txt disallows `/search-jobs/` (the results JSON);
  `/sitemap.xml` (allowed, 1.7 MB) lists ~3,200 job pages, ~660 in India (Pune, Chennai, Mumbai, …), each with a
  full schema.org JobPosting JSON-LD block.
- Apply buttons go to Workday, and the Workday board is public:
  `POST https://citi.wd5.myworkdayjobs.com/wday/cxs/citi/2/jobs` → total 2,000+ (capped), India facet
  `Country_and_Jurisdiction` = `c4f78be1a8f14da0ab49ce1162348a5e` (954 jobs, 2026-11-26).

**For the registry:** `{ slug: "citi", name: "Citi", domain: "citi.com", ats: "workday",
token: "https://citi.wd5.myworkdayjobs.com/2", careersUrl: "https://jobs.citi.com/", tags: ["mnc", "bank", "gcc"],
indiaPresence: true, priority: 1, extra: { workdayCountry: "c4f78be1a8f14da0ab49ce1162348a5e" } }`
