# Tata Elxsi — `tata-elxsi` (extra target)

- **Status:** working · **Endpoint type:** HTML (company CMS job list + job pages) · **Interval:** 60 min
- **Careers page:** https://www.tataelxsi.com/careers/job-openings — robots.txt: `Allow: /` for `*`.

## Endpoints
- List: `GET https://www.tataelxsi.com/careers/job-openings?page={1..N}` (1-based Laravel pager, ~8 rows/page; the last
  page number is read from the pager). Each row: `<h5>RFH/07664</h5><h3>Title</h3><p>Bangalore/ Pune | 4 - 7 years |
  B.E, B.Tech, MCA | Role</p><p>25 Nov 2026</p><a href="…/job-openings/{slug}">`.
- Detail (unknown ids only): `GET https://www.tataelxsi.com/careers/job-openings/{slug}` → `<div class="jbpam1">`
  (description; extracted with balanced-div parsing).

## Mapping
sourceJobId = URL slug (always present; RFH requisition id is missing on some rows → extra.requisitionId) · locations =
"/"-separated cities ("Bangalore, India") · experienceMin/Max/Raw from "4 - 7 years" · degrees from the qualification
column · postedAt = list date · descriptionHtml = job page body · extra.role when it differs from the title. Rows
located only abroad (Coventry / Gaydon, US cities) are skipped.

## Numbers (2026-11-26)
Site total **92** openings (83 in India, 9 abroad). `--limit 50`: 50/50 valid in 57.1 s (7 list pages + 50 job pages).
Fill: descriptionHtml/postedAt/locations/experienceMin/experienceMax/degrees 100%.

## Registry note
`{ slug: "tata-elxsi", name: "Tata Elxsi", ats: "custom", token: "https://www.tataelxsi.com/careers/job-openings" }`
