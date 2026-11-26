# Barclays — registry (extra; no scraper here)

search.jobs.barclays is a Radancy TalentBrew front end; jobs live on a **public Workday board**:
`POST https://barclays.wd3.myworkdayjobs.com/wday/cxs/barclays/External_Career_Site_Barclays/jobs` → total 655;
searchText "Pune" 179, "Chennai" 24 (2026-11-26). The country facet isn't top-level on this tenant.

**For the registry:** `{ slug: "barclays", name: "Barclays", domain: "barclays.com", ats: "workday",
token: "https://barclays.wd3.myworkdayjobs.com/External_Career_Site_Barclays", careersUrl: "https://search.jobs.barclays/",
tags: ["mnc", "bank", "gcc"], indiaPresence: true, priority: 1 }`
