# Atlassian (`atlassian`)

**Status:** working · **Endpoint type:** JSON (single listings endpoint, no detail calls) · **Interval:** 60 min

## Endpoint

| | |
|---|---|
| Request | `GET https://www.atlassian.com/endpoint/careers/listings` (what `/company/careers/all-jobs` loads) |
| Response | JSON array of **all** open jobs worldwide (~1.6 MB, 223 jobs on 2026-11-26) |
| Item | `id`, `title`, `locations[]`, `category`, `type` ("Full-Time" or absent), `overview` / `responsibilities` / `qualifications` / `payRanges` / `compensation` (HTML), `applyUrl` (iCIMS `?mode=apply`), `portalJobPost { portalId, portalUrl (iCIMS job page), updatedDate "2026-11-09 12:21 PM" }` |
| robots.txt | `Disallow: /company/careers/detail/*` only — the endpoint is allowed; we never fetch job pages |
| Auth / tokens | none |

Applications run on **iCIMS** (7 portals: careers-americas, globalcareers-atlassian, careers-apac-atlassian, campus-americas, …). `api.lever.co/v0/postings/atlassian` is 404 — Atlassian is not a plain Lever/Greenhouse board, so it is built here.

## India filter (client-side, `keep`)

Keep a job when a location names India (`Bengaluru - India - …`, `Remote - India - Remote`) or is `Remote - APAC`.
`Remote - Remote` is **not** enough: Atlassian attaches it next to office locations everywhere (157 of 223 jobs, mostly US/UK), so treating it as "open to India" would flood results with US roles.

## Mapping

| RawJob | Source |
|---|---|
| sourceJobId | `id` |
| sourceUrl = applyUrl | `https://www.atlassian.com/company/careers/details/{id}` (official job page, verified 200) |
| locations | cleaned: `Bengaluru - India -   Bengaluru,  560071 India` → `Bengaluru, India`; `Remote - India - Remote` → `Remote - India`; `Remote - Remote` → `Remote` |
| descriptionHtml | overview + Responsibilities + Qualifications + Compensation sections |
| postedAt | `portalJobPost.updatedDate` (no posting date exists in the feed; iCIMS gives no zone → read as UTC; the DB keeps the earliest postedAt) |
| department | `category` |
| employmentTypeRaw / jobType | `type`; category `Interns` → internship |
| experienceLevel | category `Interns` → intern, `Graduates` → fresher; else left to the normalizer |
| workMode | `remote` when every India/APAC location is a remote one; otherwise unset (office + remote option) |
| extra | `icimsUrl`, `icimsApplyUrl`, `icimsPortalId`, `rawLocations`, `updatedDate` |

Pay ranges are US pay-zone text, so they stay in the description and are never mapped to `salary`.

## Numbers (live, 2026-11-26)

`npx tsx scripts/try.ts src/sites/atlassian.ts --limit 50` → listed 223 (site total 223), **emitted 21**, 0 invalid, 0.6 s, 1 request.

Fill rates: source/ids/urls/title/company/locations/descriptionHtml/descriptionText/postedAt/department/extra 100% · employmentTypeRaw 33% · jobType 33% · workMode 14% · isRemote 14% · experienceLevel 0% (no India intern/graduate roles open today).
