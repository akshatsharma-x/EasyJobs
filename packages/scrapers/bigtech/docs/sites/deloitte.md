# deloitte — Deloitte USI (usijobs.deloitte.com)

**Status:** working · **Endpoint type:** HTML (Avature `SearchJobs`) + JSON-LD job pages · **interval:** 60 min

Deloitte's India hiring for the US firm ("USI — Deloitte US India Offices": Hyderabad, Bengaluru, Mumbai, Pune,
Chennai, Gurugram, Kolkata) runs on an **Avature** portal (`deloitteus.avature.net`, not SuccessFactors).
`jobsindia.deloitte.com` (Deloitte India member firm) no longer resolves (DNS ENOTFOUND, 2026-11-26), so it isn't covered.

## Endpoints (verified 2026-11-26)

| Step | Request | Notes |
|---|---|---|
| list | `GET https://usijobs.deloitte.com/en_US/careersUSI/SearchJobs/?jobRecordsPerPage=10&jobOffset={n}` | server-rendered `<article class="article--result" data-total="750">` tiles: title + `…/JobDetail/<slug>/<id>`, brand, legal entity, location ("Hyderabad, Telangana, India" or "Multiple Locations"); **10 per page max** (larger values ignored) → 75 pages per run |
| detail | `GET …/JobDetail/<slug>/<id>` (unknown ids only) | schema.org `JobPosting` JSON-LD: `datePosted`, `description` (HTML), `educationRequirements`, internal requisition `title` with the level code (`USI - EH27 - L55 Manager, …`); `jobLocation` is empty |

robots.txt: `Allow: /*/careers` (covers `/en_US/careersUSI/…`) plus `Disallow: /` for everything else — both
paths are allowed (checked with the contract's `parseRobots`/`isPathAllowed`). The portal RSS
(`SearchJobs/feed/`) always returns the same 20 items regardless of paging, so it isn't used.

## India filter

The portal is India-only; `keep()` still checks the tile location (`isOpenToIndia`, unknown → keep).

## Mapping

| RawJob | Source |
|---|---|
| sourceJobId | numeric id from the JobDetail URL |
| sourceUrl / applyUrl | tile link (official job page) |
| title | tile title (same in light records) |
| locations | tile location; "Multiple Locations" → cities from a `Location: …` / `Location – A/B` / `Locations` + bullet line in the description, else `["India"]` (light records contribute `[]`, so the stored union never gains a conflicting entry) |
| postedAt | JSON-LD `datePosted` |
| descriptionHtml | JSON-LD `description` |
| degrees | `educationRequirements` ("Bachelor's Degree") |
| experienceLevel / jobType | only clear signals: intern / campus / fresher in the title |
| extra | `legalEntity` (Deloitte Consulting / Tax Services / Support Services India Pvt Ltd, Edge24 LLP …), `brand`, `requisitionTitle`, `levelCode` (L35…L70), `multipleLocations` |

## Numbers (`--limit 50`, 2026-11-26)

- site total: **750** · emitted **50/50 valid**, 0 invalid, 63 s (5 list pages + 50 job pages)
- fill: title/locations/descriptionHtml/postedAt/degrees 100% · experience/skills/jobType 0% (not structured on the site)

## Caveats

- 75 list requests per complete run (Avature's 10-per-page cap) ≈ 80 s at 1 rps.
- Unknown jobs whose detail page fails are retried next run rather than stored without a description.

## For the registry

`{ slug: "deloitte", name: "Deloitte", ats: "avature", token: "https://usijobs.deloitte.com/en_US/careersUSI", careersUrl: "https://usijobs.deloitte.com/en_US/careersUSI" }` —
recommend **`custom`** in P04 (scraped here).
