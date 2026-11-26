# Amazon — `amazon`

- **Status:** working · **Endpoint type:** public JSON (the search page's own `search.json`) · **Interval:** 30 min
- **Careers page:** https://www.amazon.jobs/en/locations/india

## Endpoint
`GET https://www.amazon.jobs/en/search.json?offset={n}&result_limit=50&sort=recent&normalized_country_code[]=IND`

Response: `{ error, hits, facets, content, jobs[] }`. Each job: `id_icims` (stable id), `title`, `job_path`
(`/en/jobs/{id}/{slug}`), `posted_date` ("November 25, 2026"), `updated_time` ("about 6 hours"), `description`,
`basic_qualifications`, `preferred_qualifications` (HTML with `<br/>`), `job_schedule_type` ("full-time"),
`business_category` ("aws", "studentprograms", "university", …), `job_category`, `job_family`, `team.label`,
`company_name` (legal entity, e.g. "ADCI - Karnataka"), `locations[]` (JSON strings with `type` ONSITE | VIRTUAL and
normalized city/state/country), `url_next_step` (login-gated apply flow), `is_intern`/`university_job` (usually null).

- robots.txt: `User-agent: *` only disallows `/internal`; `/en/search.json` is allowed.
- Pagination: offset/result_limit; verified to the last page (offset 2000 of 2,054). Page size 50.
- India filter: `normalized_country_code[]=IND` (includes Amazon's India "Virtual" = remote roles).
- No detail call: the list carries the full description and qualifications.

## Mapping
| RawJob | Source |
|---|---|
| sourceJobId | `id_icims` |
| sourceUrl / applyUrl | `https://www.amazon.jobs` + `job_path` (official job page) |
| locations | "City, State, Country" per location; VIRTUAL → "Remote (Virtual) - …" |
| workMode | all VIRTUAL → remote, else onsite |
| descriptionHtml | description + "Basic qualifications" + "Preferred qualifications" sections |
| postedAt | `posted_date` (date only, UTC midnight) |
| jobType | title (interns are listed as "full-time") → else `job_schedule_type` |
| experienceLevel | intern title → intern; `business_category` university/studentprograms → fresher |
| experienceMin / experienceRaw | strictest "N+ years" in basic qualifications |
| department | `job_category` |
| extra | legalEntity, jobFamily, businessCategory, team, applyFlowUrl, updated |

## Numbers (2026-11-26, `--limit 60`)
Site total 2,054 India jobs; 60/60 valid in 2.1 s. Fill: descriptionHtml/postedAt/locations/jobType/workMode 100%,
experienceMin 77%, experienceLevel 2% (only student programmes are tagged by the site).
