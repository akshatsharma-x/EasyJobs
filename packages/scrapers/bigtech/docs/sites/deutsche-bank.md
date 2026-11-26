# Deutsche Bank — registry (extra; no scraper here)

careers.db.com is a BeeSite SPA (`GET https://api-deutschebank.beesite.de/search/?data={JSON}` — 1,845 jobs, 225 with
country 81 = India; `/jobhtml/{id}.json` for the ad). Every ad's `apply_uri` goes to a **public Workday board**:
`POST https://db.wd3.myworkdayjobs.com/wday/cxs/db/DBWebsite/jobs` → total 1,152, India facet `Country` =
`c4f78be1a8f14da0ab49ce1162348a5e` (299 jobs) — verified 2026-11-26. P08's Workday adapter covers it.

**For the registry:** `{ slug: "deutsche-bank", name: "Deutsche Bank", domain: "db.com", ats: "workday",
token: "https://db.wd3.myworkdayjobs.com/DBWebsite", careersUrl: "https://careers.db.com/", tags: ["mnc", "bank", "gcc"],
indiaPresence: true, priority: 1, extra: { workdayCountry: "c4f78be1a8f14da0ab49ce1162348a5e" } }`

Note for P08: the India `Country` facet id `c4f78be1a8f14da0ab49ce1162348a5e` is identical on Citi, Accenture and Deutsche
Bank tenants — it looks like Workday's global reference id for India.
