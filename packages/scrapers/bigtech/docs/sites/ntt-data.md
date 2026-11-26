# NTT DATA — `ntt-data` (extra target)

- **Status:** working · **Endpoint type:** HTML with embedded JSON (Phenom People `phApp.ddo`) · **Interval:** 60 min
- **Careers page:** https://careers.nttdata.com/global/en/search-results?qcountry=India
- Phenom is in P08's best-effort list only; most NTT DATA jobs are Phenom-native (`source: "CRM"`, ids like `P-100130`),
  i.e. there is no plain ATS board to register instead.

## Endpoints (robots.txt `User-agent: *` disallows only apply/jobcart/chatbot/auth/widget paths)
- List: `GET https://careers.nttdata.com/global/en/search-results?qcountry=India&from={n}` → `phApp.ddo.eagerLoadRefineSearch`
  `{ totalHits, data.jobs[10]: { jobId, reqId, title, location, multi_location[], type, category, postedDate
  "2025-08-05T00:00:00.000+0000", externalApply, ml_skills[], … } }`. `qcountry` is the country facet (1,042 India of 2,801);
  adding `s=1` silently drops the facet, so it isn't sent. The pager advances by rows received and stops at totalHits.
- Detail (unknown ids only): `GET https://careers.nttdata.com/global/en/job/{jobId}/{slug}` → `phApp.ddo.jobDetail.data.job`
  `{ description, jobRequirements (HTML), experienceLevel, remoteType, companyName, source/ats, applyUrl }`.
- `phApp.ddo` is read with a balanced-brace, string-aware extractor (not a regex) for robustness.

## Mapping
sourceJobId = jobId · sourceUrl = Phenom job page · applyUrl = the job page, or — for aggregated NTT-group subsidiary
jobs (`ats/source: "BRIGHTDATA"`, `externalApply: true`, e.g. Niveus, NTT DATA Business Solutions) — the subsidiary's
own apply link with `utm_*` removed · company = "NTT DATA" or the subsidiary name · locations = every `multi_location`
entry ("Bengaluru, Karnataka, India") · descriptionHtml = description (+ "Requirements" when it adds text) · postedAt =
postedDate → dateCreated · department = category (except "Other") · jobType from `type` · workMode from `remoteType` ·
skills = `ml_skills` (≤ 12) · extra = reqId, sourceAts, externalApply, subsidiary. Listing rows whose title is a
template leftover ("Job Description:") are skipped.

## Numbers (2026-11-26, `--limit 50`)
Site total **1,042** India jobs; listed 53, emitted 50/50 valid (3 junk-title rows skipped) in 56.7 s. Fill:
descriptionHtml/postedAt/locations 100%, skills 98%, department/jobType 94%, workMode 78%, experienceLevel 2%.
A full run lists 105 pages (~2 min) plus ≤ BIGTECH_MAX_DETAILS job pages (~170 KB each).

## Registry note
`{ slug: "ntt-data", name: "NTT DATA", ats: "phenom", token: "https://careers.nttdata.com/global/en" }` — covered here;
P04 should mark it `custom`. (nttglobaldatacenters.wd501.myworkdayjobs.com/External is only the data-centre subsidiary.)
