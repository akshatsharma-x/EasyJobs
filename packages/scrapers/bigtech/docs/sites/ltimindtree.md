# ltimindtree — LTIMindtree / "LTM" (ltm.ripplehire.com + careers.ltm.com)

**Status:** working · **Endpoint type:** JSON (RippleHire candidate API) + RSS (SuccessFactors feed) · **interval:** 60 min

LTIMindtree rebranded to **LTM** in 2026: `www.ltimindtree.com/careers` → `www.ltm.com/careers`. Scraper id stays
`ltimindtree`, company "LTIMindtree" (registry slug). ltm.com sends **India** candidates to RippleHire and other regions
to a SuccessFactors board; both are official and both are read.

## 1 · RippleHire (India) — verified 2026-11-26

| Step | Request | Notes |
|---|---|---|
| list | `POST https://ltm.ripplehire.com/candidate/candidatejobsearch` · form `careerSiteUrlParams={"page":N,"search":"*:*","token":"xviyQvbnyYZdGtozXoNm","source":"CAREERSITE","pagesize":50,"geo":"India"}&lang=en` | `{ totalJobCount: 614, jobVoList: [{ jobSeq, jobTitle, locations ("Bengaluru", "Mumbai/Pune/Chennai", "Select Location"), jobReqExp "6 - 11 Years", jobMinExp/jobMaxExp (years), jobCode, numOfOpening }] }`; 0-based pages, newest `jobSeq` first; 13 requests per run |
| detail | `GET https://ltm.ripplehire.com/candidate/candidatejobdetail?token=…&jobSeq={id}&source=CAREERSITE&lang=en` | needs `Accept: application/json` (else XML). `jobVO`: `jobDesc` (HTML), `jobSkills` (HTML "Mandatory Skills : … Good to Have Skills : …"), `jobPostingDate` "24-Nov-2026", `publishDetails.CAREER_SITE` (ISO), `jobTypeCustom3` "Permanent", `jobStatus`, experience in **months** (ignored; list years used) |

- The token is the **public career-site id** in the ltm.com "India" link (static, not a session token); both calls
  work cold with the bot UA, no cookies.
- robots: `ltm.ripplehire.com/robots.txt` redirects to a SAML login page (no rules published → allowed).
- Public job page is a hash route (`…/candidate/?token=…#detail/job/{id}`). URL canonicalisation drops hashes, so
  applyUrl also carries `&jobSeq={id}` as a query param (verified in Chrome: the SPA opens the right job) — keeps
  every job's applyUrl (→ fingerprint) unique.

## 2 · SuccessFactors (careers.ltm.com)

`GET https://careers.ltm.com/sitemap.xml` is actually an RSS 2.0 (Google Base) feed of every posting — 39 items,
only 2 in India on 2026-11-26. One request per run; India items (by `g:location` / title suffix) are emitted with
sourceJobId `sf-<g:id>`. Listed **before** RippleHire so they never get deferred by the per-run detail budget.
robots.txt (RMK default) only disallows `/services/`, `/talentcommunity/`… — allowed.

## Mapping

| RawJob | RippleHire | SF feed |
|---|---|---|
| sourceJobId | `jobSeq` | `sf-<g:id>` |
| title | `jobTitle` | title minus "(City, ST, CC)" |
| locations | `locations` split on `/ , ;`, "Chennai - Tamilnadu" → "Chennai", "Select Location"/"India" → "India" | `g:location` → "Chennai, Tamil Nadu, India" |
| postedAt | `publishDetails.CAREER_SITE` (else `jobPostingDate`) | — (feed has no date) |
| descriptionHtml | `jobDesc` + "Skills" section (`jobSkills`) | `description` (entity-escaped HTML, decoded) |
| experienceRaw/Min/Max | `jobReqExp`, `jobMinExp`, `jobMaxExp` | — |
| skills | mandatory, then good-to-have skills | — |
| employmentTypeRaw / jobType | `jobTypeCustom3` ("Permanent" → full_time) | — |
| validThrough / department | — | `g:expiration_date` / `g:job_function` |
| extra | `jobCode`, `openings`, `requisitionDate`, `board` | `employer`, `board` |

## Numbers (`--limit 50`, 2026-11-26)

- site total: **616** (614 RippleHire India + 2 SF India) · emitted **50/50 valid**, 0 invalid, 50 s
- fill: title/locations/descriptionHtml 100% · postedAt, jobType, employmentTypeRaw, experienceMin/Max 96% · skills 94% (the 2 SF items have none of these)

## For the registry

- RippleHire isn't an `AtsType` → `{ slug: "ltimindtree", name: "LTIMindtree", ats: "custom", token: "https://www.ltm.com/careers", careersUrl: "https://www.ltm.com/careers" }` (scraped here).
- The SF board would be `successfactors` / `https://careers.ltm.com/` — also covered here; recommend P04 not schedule it separately.
