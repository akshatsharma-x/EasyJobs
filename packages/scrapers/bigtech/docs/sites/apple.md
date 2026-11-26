# Apple — `apple` (working)

Source: jobs.apple.com, a server-rendered React Router app. No JSON API is used: `POST /api/role/search`
requires an `x-apple-csrf-token` session token, which we do not harvest. Every page embeds its data:

```html
<script>window.__staticRouterHydrationData = JSON.parse("{\"loaderData\":{…}}")</script>
```

`parseAppleHydration()` decodes the JS string literal, then the JSON (and also accepts a plain object
literal, in case Apple drops the `JSON.parse` wrapper).

## Endpoints

| | Request | Data |
|---|---|---|
| List | `GET https://jobs.apple.com/en-in/search?location=india-INDC&sort=newest&page={n}` (20 per page, fixed) | `loaderData.search { searchResults[], totalRecords, page }` |
| Detail | `GET https://jobs.apple.com/en-in/details/{positionId}/{transformedPostingTitle}` (unknown ids only) | `loaderData.jobDetails.jobsData` |

Search result: `id` (`<positionId>-<locCode>` or `PIPE-<positionId>`), `positionId`, `postingTitle`,
`transformedPostingTitle`, `jobSummary` (text), `locations[{name, countryName, level}]`, `postDateInGMT`,
`postingDate` ("25 Nov 2026"), `team{teamName, teamCode}`, `type` (REQ | PIPE), `managedPipelineRole`,
`homeOffice`, `standardWeeklyHours`, `isMultiLocation`, `reqId`.

Detail adds: `description`, `minimumQualifications`, `preferredQualifications` (plain text), `teamNames[]`,
all `locations[]`, `postingPostLocationData{locale:{postLocationId:{postingDate}}}`, `jobType`
(CORPORATE | RETAIL), `homeOffice`.

## Robots / etiquette

- `jobs.apple.com/robots.txt` redirects to `www.apple.com/pagenotfound` (404) → no rules (the contract
  client treats a non-OK robots response as allow-all).
- Search pages carry `<meta name="robots" content="noindex,follow">` — an indexing directive; following
  links is explicitly allowed. Detail pages are indexable (canonical link, no robots meta).
- Pages are ~180–330 KB; with the 1 rps gap a first full run (≈10 list pages + ≈180 details) takes
  ~6–7 min, later runs ≈10 list requests (known ids skip details).

## Mapping

| RawJob | Apple |
|---|---|
| sourceJobId | `positionId` |
| sourceUrl = applyUrl | `https://jobs.apple.com/en-in/details/{positionId}/{slug}` (multi-location positions 301 to `…/{positionId}-{loc}/…`; the positionId form is the stable, location-independent URL) |
| title | `postingTitle` with the retail country prefix stripped ("IN-Business Expert" → "Business Expert"; original in `extra.postingTitle`) |
| locations | "City, Country" / "India" (detail list when fetched, else merged list entries) |
| descriptionHtml | jobSummary + Description + Minimum / Preferred Qualifications (text → HTML) |
| postedAt | `postDateInGMT`; for **managed pipeline** roles the earliest `postingPostLocationData` date (their list date is refreshed continuously — e.g. list 21:58, detail 22:20, original 2026-06-02), else null |
| department | team names joined ("Apple Retail / Sales and Business Development") |
| employmentTypeRaw / jobType | `standardWeeklyHours` ("40 hours/week" → full_time; < 35 → part_time); "Students: Internships" team or intern title → internship |
| experienceLevel | from team names via `levelFromCategory` (Students → intern / fresher); otherwise undefined |
| workMode / isRemote | `homeOffice: true` → remote; otherwise unset (Apple doesn't state on-site) |
| experienceRaw / Min / Max | `parseExperienceYears(minimumQualifications)` |
| extra | reqId, postingType (REQ/PIPE), managedPipelineRole, appleJobType (CORPORATE/RETAIL), teamCode |

Multi-location positions appear once per location (same `positionId`, different `id`) on the same or
the next page — merged with a one-page lookahead. Paging is stable (no `id` repeats across pages).

## Numbers (2026-11-25)

- India: `totalRecords` **193** search rows = **182** unique positions; REQ 84 / PIPE 109; 8 managed
  pipeline (retail); all 40 h/week; `homeOffice` false for all; 0 open internships in India
  (team "Students: Internships" exists).
- CLI `--limit 50`: 50 emitted, 0 invalid, 50 detail calls, 120 s live.

Fill rates (`--limit 50`): source, sourceKind, sourceJobId, sourceUrl, target, applyUrl, title,
company, locations, descriptionHtml, descriptionText, postedAt, companySlug, companyDomain, department,
employmentTypeRaw, jobType, extra **100%** · experienceRaw / experienceMin **76%** · experienceMax 20% ·
workMode 0% · experienceLevel 0% (no student roles open).
