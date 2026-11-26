# Swiggy — registry (extra; no scraper here)

careers.swiggy.in is a Vite SPA that loads one static file, `GET https://careers.swiggy.in/api/jobs.json`
(`{generatedAt, total, jobs:[{t: title, c: city, l: location, b: business unit, e: "Permanent", r, h, d: epoch ms,
u: SmartRecruiters URL}]}`, 153 jobs on 2026-11-26). Every job links to `jobs.smartrecruiters.com/SWIGGY/…` and the
public SmartRecruiters API serves the same board, so P07's adapter covers it.

**For the registry:** `{ slug: "swiggy", name: "Swiggy", domain: "swiggy.com", ats: "smartrecruiters", token: "SWIGGY",
careersUrl: "https://careers.swiggy.in/", tags: ["unicorn", "product"], indiaPresence: true, priority: 1 }`
