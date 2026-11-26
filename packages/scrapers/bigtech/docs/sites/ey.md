# EY — `ey` (extra target: Ernst & Young incl. GDS India)

- **Status:** working · **Endpoint type:** HTML (SAP SuccessFactors RMK search pages + job-page microdata) · **Interval:** 60 min
- **Careers page:** https://careers.ey.com/ey/search/?locationsearch=India
- Not in the P09 list, added because EY/GDS is one of India's largest fresher and lateral employers and its site is
  SuccessFactors (not a plain P07/P08 board).

## Endpoints (robots.txt allows /ey/search/ and /ey/job/; disallows /services/, /applybutton/, /talentcommunity/, …)
- List: `GET https://careers.ey.com/ey/search/?locationsearch=India&sortColumn=referencedate&sortDirection=desc&startrow={n}`
  → 25 `<tr class="data-row">` rows per page (title link `/ey/job/{slug}/{id}/`, `City, ST, IN, PIN` +"N more"),
  and "Results 1 – 25 of 3335". The pager advances by rows received and stops at the total.
- Detail (unknown ids only): `GET https://careers.ey.com/ey/job/{slug}/{id}/` → schema.org JobPosting microdata:
  `datePosted`/`validThrough` as Java dates ("Sat Nov 14 02:00:00 UTC 2026"), one `itemprop="address"` per location,
  `span.jobdescription`, and RMK custom fields (`customfield3` work arrangement, `customfield5` requisition id).
- `locationsearch` is a text match, so rows are kept only when the country code is `IN`.

## Mapping
sourceJobId = RMK job id · sourceUrl/applyUrl = job page · locations = every microdata address ("Kochi, Kerala, India")
· descriptionHtml = job description · postedAt/validThrough from microdata · extra = requisitionId, workArrangement,
additionalLocations. "Anywhere in Country" is location flexibility, not remote → workMode left unset. Titles carry EY ranks
(Staff / Senior / Manager …) which the normalizer reads; no level hint is set here.

## Numbers (2026-11-26, `--limit 30`)
Site total 3,335 India jobs; 30/30 valid in 34.8 s (2 list pages + 30 detail pages, ≈1.07 s per request).
Fill: descriptionHtml/postedAt/locations 100%, validThrough 97%. A full run lists 134 pages (~2.5 min) and fetches up to
BIGTECH_MAX_DETAILS (200) new job pages; the rest are deferred to later runs.

## Registry note
`{ slug: "ey", ats: "successfactors", token: "https://careers.ey.com/ey/search/" }` — covered here; P04 should mark it `custom`.
