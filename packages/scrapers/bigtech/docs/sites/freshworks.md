# Freshworks — registry (no scraper here)

- **Status:** plain SmartRecruiters board → for the registry (P07's `smartrecruiters` adapter)
- careers.freshworks.com/jobs redirects to https://careers.smartrecruiters.com/Freshworks

Verified 2026-11-26: `GET https://api.smartrecruiters.com/v1/companies/Freshworks/postings?limit=3` → `totalFound` 120
(30 with `country=in`), e.g. "Senior Staff Product Manager — Chennai, in".

**For the registry:** `{ slug: "freshworks", name: "Freshworks", domain: "freshworks.com", ats: "smartrecruiters",
token: "Freshworks", careersUrl: "https://careers.smartrecruiters.com/Freshworks", tags: ["product", "unicorn"],
hq: "San Mateo / Chennai", indiaPresence: true, priority: 1 }`
