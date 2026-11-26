# PhonePe — registry (extra; no scraper here)

phonepe.com/careers/job-openings (Gatsby) loads `GET https://www.phonepe.com/apollo/job-postings/latest.json`
(`{results:[{status, applyUrl, type, title, department, location, updatedAt "/Date(ms)/"}], totalCount, fetchedAt}`;
1,000 rows of which only `status: "PUBLIC"` rows have an apply link). Public rows link to
`jobs.smartrecruiters.com/PHONEPELIMITED/…`, so P07's SmartRecruiters adapter covers PhonePe.

**For the registry:** `{ slug: "phonepe", name: "PhonePe", domain: "phonepe.com", ats: "smartrecruiters",
token: "PHONEPELIMITED", careersUrl: "https://www.phonepe.com/careers/job-openings/", tags: ["unicorn", "fintech", "product"],
indiaPresence: true, priority: 1 }`
