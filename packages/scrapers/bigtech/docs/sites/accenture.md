# Accenture — `accenture`

- **Status:** working · **Endpoint type:** public JSON (multipart POST `findjobs`, the careers search page's own call) · **Interval:** 60 min
- **Careers page:** https://www.accenture.com/in-en/careers (AEM front end; applications run on Workday)

## Endpoint
`POST https://www.accenture.com/api/accenture/elastic/findjobs` — `multipart/form-data`, exactly the fields the page sends:
`startIndex`, `maxResultSize` (50), `jobKeyword` (""), `jobCountry=India`, `jobLanguage=en`, `countrySite=in-en`,
`sortBy` (0 relevancy · **1 newest** · 2 proximity/latest — the scraper uses 1), `searchType=vectorSearch`,
`enableQueryBoost=true`, `minScore=0.6`, `getFeedbackJudgmentEnabled=true`, `useCleanEmbedding=true`, `score=true`,
`totalHits=true`, `debugQuery=false`, `jobFilters` = JSON `[{fieldName, items:[term], multiSelect:false}]` with
`fieldName` ∈ `yearsOfExperience.keyword`, `location.keyword`, `areaOfInterestTitle.keyword`, `employeeType.keyword`.

Response: `{ data[], aggregations[{fieldName, filterDisplayName, items[{term,count}]}], totalHits{total ≤ 10000, overMaxHits}, labelConfigMapping, message:"Success" }`.
Each job: `requisitionId` ("AIOC-S01675388" / "ATCI-5224532-S1917590"), `guid` (`…_en`), `title`, `jobDetailUrl`
(`https://www.accenture.com/{0}/careers/jobdetails?id={guid}&title=…`), `location[]` (cities), `country`, `updateDate`
(ISO), `postedDateText` ("Posted within last 24 hours" / "Posted 4 days ago"), `employeeType` ("Full-time"),
`jobScheduleDescription`, `jobTypeDescription` ("Early Career" / "Mid-Level" / "Senior Level"), `careerLevel`
("New Associate", "Associate", "Senior Analyst", "Team Lead/Consultant", "Associate Manager", …), `yearsOfExperience`
("Experience: 0-2 years"), `education[]`, `jobFamilyGroup[]`, `businessArea`, `function[]`, `workdaySkill[]`,
`mustHaveSkills`, `goodToHaveSkills`, `jobDescription` (HTML incl. "Years of Experience: 0 to 1 years"),
`azureopenaiSummary`, `remoteType` (empty in every sample), plus large duplicate text fields we ignore.

- **No token.** The page's JS sends an *empty* `CSRF-Token` header on the public host (it only fetches
  `/libs/granite/csrf/token.json` on the AEM `author-` host). The bot UA gets 200 with no header at all.
- **robots.txt:** disallows `*/careers/jobsearch?` (the HTML search page). `/api/…` and `/careers/jobdetails` are not
  disallowed; job pages return 200 (no Cloudflare challenge) to the bot UA.
- **Detail:** none needed; the list carries the full description, skills and experience.

## Volume and scope (important)
India has **25,290** jobs (sum of the Experience facet; `totalHits` caps at 10,000). Sorted newest-first, offset 6,000
is already ~5 days old, i.e. **~1,200 new India postings a day**, and each record is ~13 KB (≈680 KB per 50-job page).
- A full crawl would be ~500 requests / ~340 MB per run, too heavy for an hourly schedule.
- A "newest N" window would let the worker's sweep close live jobs within days.
- So the crawl is **scoped by Accenture's own Experience facet and complete within that scope**, which keeps
  sweeps correct. Default: `Experience: 0-2 years` → **2,721 jobs, 56 requests, 57 s** (fresher/entry roles, the
  product's core audience).
- `ACCENTURE_EXPERIENCE=0-2,2-5` (any bands) or `all` widens it. A band at the 10k search window (5-10 years = 11,088)
  is split per city (`location.keyword` terms from the probe's aggregations); duplicates are dropped by id.
- One probe request (`maxResultSize=1`, no filters) per run reads the facet counts.

## Mapping
| RawJob | Source |
|---|---|
| sourceJobId | `requisitionId` (= Workday `jobReqId`) |
| sourceUrl / applyUrl | `https://www.accenture.com/in-en/careers/jobdetails?id={guid}` (official job page) |
| locations | `location[]` → "City, India" |
| descriptionHtml | `jobDescription` (raw newlines → `<br>`) |
| postedAt | `updateDate` (what "Posted N days ago" is computed from) |
| experienceMin/Max/Raw | "Years of Experience: 0 to 1 years" in the description, else the facet band |
| experienceLevel | careerLevel *New Associate* → fresher, *Associate* → entry, *…Director* → executive, else from years (≤2 entry, ≤5 mid, ≤10 senior, >10 lead); intern title → intern |
| jobType / employmentTypeRaw | `employeeType` ("Full-time") |
| department | `jobFamilyGroup[0]` (else `businessArea`) |
| skills | `workdaySkill` + must/good-to-have skills |
| degrees | `education[]` |
| workMode | `remoteType` when present (always empty so far) |
| extra | careerLevel, careerStage, experienceBand, businessArea, function, jobProfile, qualification, postedText, summary (Accenture's AI summary) |

## Numbers (2026-11-26)
- `--limit 50`: 50/50 valid in 2.0 s. Fill 100%: locations, descriptionHtml, postedAt, department, employmentTypeRaw,
  jobType, experienceLevel, experienceMin/Max/Raw, skills, degrees. workMode 0% (site leaves `remoteType` empty).
- `--limit all` (default scope): 2,721 listed = 2,721 emitted, 0 invalid, 57.2 s. Levels: entry 2,005 · fresher 716.

## For the registry (finding: don't add it as-is)
The same postings are on a public Workday board: token `https://accenture.wd103.myworkdayjobs.com/AccentureCareers`,
India facet `locationCountry` = `c4f78be1a8f14da0ab49ce1162348a5e` (33,981 jobs; `jobReqId` = the accenture.com
`requisitionId`). **But Workday CXS reports `total: 2000` and ignores offsets ≥ 2000** (offsets 2000/5000/33960 return
page 1 again), so a Workday adapter can read only ~2,000 (≈6%) of India's jobs per query unless it partitions by
city facets. That's why the scraper is built here. Recommendation for W1/P04: register Accenture as `ats: "custom"`
(handled by this scraper). If the Workday board is also added for non-India coverage, don't give it the India
facet, or both sources will emit the same postings under different apply URLs (accenture.com vs myworkdayjobs.com),
which don't merge by fingerprint.
