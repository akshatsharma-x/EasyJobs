# Axis Bank — `axis-bank` (extra target)

- **Status:** working · **Endpoint type:** JSON (RippleHire career-site API) · **Interval:** 60 min
- **Careers page:** https://www.axis.bank.in/careers → https://axisbank.ripplehire.com/candidate/?token=WIXhCuz0XRZ7H0GZCwjJ&source=CAREERSITE
- RippleHire is an Indian ATS with no P07/P08 adapter. Shared code: `src/sites/_ripplehire.ts` (also used by `hdfc-bank`).

## Endpoints
- List: `POST https://axisbank.ripplehire.com/candidate/candidatejobsearch`, form body
  `careerSiteUrlParams={"page":N,"search":"*:*","token":"WIXhCuz0XRZ7H0GZCwjJ","source":"CAREERSITE","pagesize":50}&lang=en`
  → `{ totalJobCount, startJobIndex, jobVoList:[{ jobId, jobTitle, jobReqExp "1 - 3 Years", jobMinExp/jobMaxExp (years),
  locations "Jaipur", jobCode, numOfOpening }] }`. `page` is 0-based; verified no overlap between pages; 50 rows/page.
- Detail (unknown ids only): `GET …/candidate/candidatejobdetail?token=…&jobSeq={id}&source=CAREERSITE&lang=en` →
  `jobVO { jobDesc (HTML), jobSkills, publishDetails.CAREER_SITE (ISO), jobPostingDate "25-Nov-2026", jobType "R",
  jobTypeCustom3 ("Onsite"/"Hybrid" — work mode on this tenant), bussinessUnit, … }`. The response's `companyVO` contact
  fields are never read.
- The token is the bank's static career-site key from its public Careers link, not a session/anti-bot token.
- robots.txt: `/robots.txt` on RippleHire hosts redirects into the tenant's SSO login page — no rules are served, so the
  contract client allows the candidate API.

## Mapping
sourceJobId = jobId · sourceUrl/applyUrl = `https://axisbank.ripplehire.com/candidate/?token=…&source=CAREERSITE&jobSeq={id}#detail/job/{id}`
(the job view is hash-routed; `jobSeq` is added as a real query param so §0.4's fragment-stripping canonical URL stays
unique per job) · locations = comma-separated cities → "City, India" · descriptionHtml = jobDesc (+ "Skills" only when it
adds text) · postedAt = publishDetails.CAREER_SITE → jobPostingDate · experienceMin/Max from the list (years) ·
jobType from the code (R → full_time) · workMode from jobTypeCustom3 · extra = jobCode, openings, hotJob.

## Numbers (2026-11-26, `--limit 50`)
Site total **9,480** jobs; 50/50 valid in 50.2 s (1 list page + 50 details). Fill: descriptionHtml/postedAt/locations/
experienceMin/experienceMax/jobType 100%, workMode 98% (onsite 36, hybrid 13). A full run lists 190 pages (~3.2 min) and
fetches ≤ BIGTECH_MAX_DETAILS new jobs per run (the rest are deferred), so the first full backfill spreads over runs.

## Registry note
`{ slug: "axis-bank", name: "Axis Bank", ats: "custom", token: "https://axisbank.ripplehire.com/candidate/?token=WIXhCuz0XRZ7H0GZCwjJ", tags: ["bank"], indiaPresence: true, priority: 1 }`
