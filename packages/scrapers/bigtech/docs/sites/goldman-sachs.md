# Goldman Sachs — for the registry (not built here)

**Status: registry.** Goldman Sachs' public career site (higher.gs.com) is a custom React front end, but
every role it lists applies on a public **Oracle Recruiting Cloud** board, which P08's `oracle` adapter
reads as-is. Per the P09 rule ("plain … Oracle … board → don't build it here"), there is no
`goldman-sachs` scraper in this package.

## For the registry

| slug | name | ats | token | careersUrl |
|---|---|---|---|---|
| `goldman-sachs` | Goldman Sachs | `oracle` | `https://hdpc.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/LateralHiring` | `https://higher.gs.com/results?LOCATION=India` |

Suggested tags: `bank`, `mnc`, `gcc`, `fintech`; hq New York; indiaPresence true (Bengaluru, Hyderabad, Mumbai); priority 1.

Verified 2026-11-25 with the bot UA (`EasyJobsBot/1.0`):
- `GET https://hdpc.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=LateralHiring,limit=25,offset=0,sortBy=POSTING_DATES_DESC`
  → 200, `TotalJobsCount` **953** worldwide; with `locationId=300000000228786` (India facet) **131**.
- `robots.txt` on the Oracle host → 404 (no rules).
- Requisition rows carry `Id`, `Title`, `PostedDate`, `PrimaryLocation`, `PrimaryLocationCountry`, `secondaryLocations`, `ShortDescriptionStr`; details via `recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id="{id}",siteNumber=LateralHiring`.
- Public job URL: `https://hdpc.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/LateralHiring/job/{Id}`.

Data-quality notes for P08 / the normalizer:
- The board includes internal placeholder requisitions titled **"Contingent Worker India 1"**, "Contingent Worker Americas 2024_1", … (posted 2021–2025). They are not real openings — filter titles matching `^Contingent Worker\b`.
- Site `CX` on the same host only contains those placeholders; other site numbers fall back to `LateralHiring`. Campus programmes (e.g. "2026 | India | Bengaluru/Hyderabad | Industrial Training") are on `LateralHiring` too.
- GS's own early-career search (`experiences: ["EARLY_CAREER"]`) currently returns 0 India roles.

## Why not the custom higher.gs.com API

higher.gs.com calls a public GraphQL gateway (no auth, no tokens; host has no robots.txt — 404 — and
higher.gs.com's robots allows only `/roles/`):

```
POST https://api-higher.gs.com/gateway/api/v1/graphql
{ "operationName": "GetRoles",
  "variables": { "searchQueryInput": {
      "page": { "pageSize": 50, "pageNumber": 0 },
      "sort": { "sortStrategy": "RELEVANCE", "sortOrder": "DESC" },
      "filters": [{ "filterCategoryType": "LOCATION", "filters": [{ "filter": "India", "subFilters": [] }] }],
      "experiences": ["EARLY_CAREER", "PROFESSIONAL"], "searchTerm": "" } },
  "query": "query GetRoles($searchQueryInput: RoleSearchQueryInput!) { roleSearch(searchQueryInput: $searchQueryInput) { totalCount items { roleId corporateTitle jobTitle jobFunction locations { primary state country city } status division skills jobType { code description } externalSource { sourceId } } } }" }
→ { data: { roleSearch: { totalCount: 141, items: [...] } } }

Detail: operationName "GetRoleById", variables { externalSourceId: "<numeric sourceId>", externalSourceFetch: true }
→ role { descriptionHtml, division, corporateTitle, skillset, compensation{minSalary,maxSalary,currency},
         externalSource { externalApplicationUrl, applyInExternalSource, sourceId, secondarySourceId } }
```

Findings that decided it (2026-11-25):
1. **Every** role's `externalApplicationUrl` points at the Oracle board above
   (`…/sites/LateralHiring/job/{sourceId}/apply/email`), i.e. the ATS of record is Oracle.
2. India: GS API 141 vs Oracle 131. The 15 GS-only roles (UUID `roleId`s) have Oracle ids that
   the Oracle detail endpoint reports as `count: 0` — not externally open, i.e. stale on the
   portal. Oracle additionally lists 1 internship programme the portal doesn't show (+ 4 placeholders).
3. The GraphQL schema has **no posting date**: `postedDate`/`postingDate`/`datePosted`/`publishedDate`
   are undefined fields; `createdDate` is the portal's cache timestamp (it equalled the time of our own
   `externalSourceFetch` call), `lastModifiedDate` is null. Oracle's `PostedDate` is real.

So the Oracle board is the more complete and more accurate official source. If W1 ever wants the
portal anyway (e.g. for `corporateTitle` → level and `division`), the request/response shapes above
are verified; set `ats: "custom"` in the registry to avoid double-scraping.
