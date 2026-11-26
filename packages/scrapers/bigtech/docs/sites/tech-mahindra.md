# tech-mahindra — Tech Mahindra (careers.techmahindra.com)

**Status:** disabled (`isEnabled → false`) · **Endpoint type:** none usable

## Findings (2026-11-26)

- `www.techmahindra.com/careers/` links only to `careers.techmahindra.com`, an **ASP.NET WebForms** app
  (robots.txt 404 → crawling allowed). `CurrentOpportunity.aspx` (GET) renders 12 job tiles: job code (`HdnJobCode`),
  IT/BPS, title, "Skill Set", "Experience : 4 - 7 Years", "Location : NAVI MUMBAI". `BPSOpportunity.aspx` renders none.
- Paging is `__doPostBack('ctl00$ContentPlaceHolder1$rptPager$ctl01$lnkPage','')` — a form POST that must replay the
  page's `__VIEWSTATE` / `__EVENTVALIDATION` tokens. We don't harvest page/session tokens.
- **No per-job public URL:** "Apply/Shortlist" is a postback into Signin/Registration (login). Every job would share
  the listing URL, which would also collapse them into one fingerprint downstream (applyUrl-based dedupe).
- No JSON, `.asmx`/`.ashx` services, feed, sitemap or JSON-LD. No public ATS board: Greenhouse / Lever / Ashby `techmahindra` → 404;
  SmartRecruiters `TechMahindra` → 0 postings. (A Ceipal job-order field hints at a US staffing ATS, which needs API keys.)

**Reason in code:** `TECH_MAHINDRA_DISABLED_REASON` in `src/sites/tech-mahindra.ts`. Re-check if the site adds
job detail pages, a sitemap or JSON-LD; the tile fields above would map cleanly (experience range → experienceMin/Max,
skill set → skills, location → city).

## For the registry

No ATS board to list (`ats: "custom"`, careersUrl `https://careers.techmahindra.com/CurrentOpportunity.aspx`).
