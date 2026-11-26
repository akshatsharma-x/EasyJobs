# Nagarro — registry (extra; no scraper here)

nagarro.com/en/careers (HubSpot) reads a public read-only Azure Table (`nagcareersite.table.core.windows.net/Main`, SAS
valid to 2090) whose rows link every job to SmartRecruiters `Nagarro1`. Public API:
`GET https://api.smartrecruiters.com/v1/companies/Nagarro1/postings` → totalFound 618, 199 with `country=in` (2026-11-26).

**For the registry:** `{ slug: "nagarro", name: "Nagarro", domain: "nagarro.com", ats: "smartrecruiters", token: "Nagarro1",
careersUrl: "https://www.nagarro.com/en/careers", tags: ["mnc", "service"], indiaPresence: true, priority: 1 }`
