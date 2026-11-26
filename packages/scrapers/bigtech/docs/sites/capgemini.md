# Capgemini — `capgemini`

- **Status:** working · **Endpoint type:** public JSON (the "jobstream" API the capgemini.com job search calls) · **Interval:** 60 min
- **Careers page:** https://www.capgemini.com/in-en/careers/join-capgemini/job-search/

## Endpoint
`GET https://cg-jobstream-api.azurewebsites.net/api/job-search?page={1..}&size=50&country_code=in-en`
→ `{ total, count, max_score, timed_out, took, data[] }`. Facets: `GET /api/job-filters/?country_code=in-en`
(country_code, experience_level, professional_communities, location, contract_type, brand).

Each job: `id` ("511685-en_US_SAPBTP"), `ref` ("511685-en_US"), `source` ("SAP_BTP"), `title`, `brand`
("Capgemini", "Capgemini Engineering", "Capgemini Invent", "frog", "Sogeti"), `contract_type` ("Permanent"),
`experience_level` ("Experienced Professionals" | "Executives"), `professional_communities`, `sbu`,
`location` ("Chennai (ex Madras), Hyderabad, Pune, Bangalore"), `description` (full HTML), `indexed_at`, `updated_at`,
`apply_job_url` (careers.capgemini.com SAP SuccessFactors RMK), `deleted_at`, plus empty legacy fields.

- **robots.txt:** API host has none (404); capgemini.com allows everything relevant. Job pages
  `https://www.capgemini.com/in-en/jobs/{ref}+{source lowercased}` return 200 to the bot UA.
- **India filter:** `country_code=in-en` (802 jobs). The India site lists India-based roles only.
- **Detail:** none needed (full description in the list). Pagination: 1-based `page`, stop at `total`.
- **Not a plain board:** applications run on SAP SuccessFactors (careers.capgemini.com), which isn't one of the plain
  public ATS boards P07/P08 read as-is, so it's built here.

## Mapping
| RawJob | Source |
|---|---|
| sourceJobId | `id` |
| sourceUrl / applyUrl | `https://www.capgemini.com/in-en/jobs/{ref}+{source}` (official job page) |
| locations | split `location`, strip "(ex Madras)" → "City, India" |
| descriptionHtml | `description` |
| postedAt | `indexed_at` (first indexed). `updated_at` is refreshed for every job by the daily feed, so it's kept in extra only |
| department | `professional_communities` |
| employmentTypeRaw / jobType | `contract_type` ("Permanent" → full_time) |
| experienceLevel | "Executives" → executive; "Experienced Professionals" is vague → unset |
| company | always "Capgemini"; the sub-brand goes to extra.brand |
| extra | brand, sbu, experienceCategory, applyFlowUrl (SuccessFactors apply link), updatedAt |

## Numbers (2026-11-26)
Site total 802 India jobs (17 requests per full run, all ids unique, all `SAP_BTP`). `--limit 50`: 50/50 valid in
2.4 s. Fill: locations/descriptionHtml/postedAt/jobType/employmentTypeRaw 100%, department 94%, experienceLevel 2%
(only "Executives"). Capgemini doesn't list campus/fresher roles in this feed (2 "CA Fresher" titles only).
