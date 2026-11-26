# hcltech — HCLTech (careers.hcltech.com)

**Status:** working · **Endpoint type:** `sitemap.xml` + job pages (SAP SuccessFactors RMK, HTML) · **interval:** 60 min

`www.hcltech.com/careers/*` doesn't answer non-browser clients (Chrome: `ERR_HTTP2_PROTOCOL_ERROR`; curl/Node:
TLS reset or 30 s timeout — Akamai), so it's not used. The job board itself, **careers.hcltech.com**, answers the
bot UA normally.

## Endpoints (verified 2026-11-26)

| Step | Request | Notes |
|---|---|---|
| list | `GET https://careers.hcltech.com/sitemap.xml` | one ~2.6 MB request; **14,196** global postings as `/job/<Title>/<postingId>/` (no location in the slug); `lastmod` = build date |
| detail | `GET <sitemap URL>` (unknown ids only) | unlabelled `joblayouttoken` blocks: `[title, country, "", title, "City, State"…, description]`; several locations are concatenated without separators ("\| Chennai, Tamil NaduBengaluru, Karnataka"); description in `itemprop="description"` (Job Summary / Key Responsibilities / Skill Requirements / Other Requirements) |

**Why not the search API:** `/search/` and `/go/India/9553955/` load jobs from `POST /services/recruiting/v1/jobs`
with a page-embedded `CSRFToken`; robots.txt has `Disallow: /services/`. Unknown paths (e.g. `/sitemap_index.xml`)
just hang for 30 s.

## India filter

Needs the job page (country token = "India"). In the newest-first window **50 of 66** postings (76%) were in India.
Postings found outside India — or closed (`jobErrMsg`) — are memoised in-process (`hclSkipped`, 24 h TTL) so later runs
don't re-fetch them; without this they'd never become "known" and would eat the per-run detail budget forever.

## Mapping

| RawJob | Source |
|---|---|
| sourceJobId | posting id from the URL |
| sourceUrl / applyUrl | sitemap job URL (official page) |
| title | **from the slug** (`Sr Tower Lead (Support & Operations)`; RMK writes "." as "_", converted back) — same in light records; page title in `extra.pageTitle` |
| locations | "City, State, India" per location; "Others, Karnataka" → "Karnataka, India"; "Gautam Buddha Nagar" (Noida's district) → "Noida" |
| descriptionHtml | `itemprop="description"` |
| skills | "Skill Requirements" when it's a short comma list (26%), else left to the normalizer |
| postedAt | **null** — job pages show no date (pipeline falls back to first-seen) |
| extra | `pageTitle`, `country`, `canonicalUrl` |

Light records (known ids) carry title + id only (`locations: []`), which unions cleanly with the full record.

## Numbers (`--limit 50`, 2026-11-26)

- site total (global): **14,196** (≈ 76% India by sample → ~10.8k) · emitted **50/50 valid**, 0 invalid, 70 s (1 sitemap + 66 job pages)
- fill: title/locations/descriptionHtml 100% · skills 26% · postedAt / jobType / experience 0% (not on the page)

## Caveats

- First full backfill ≈ 14.2k job pages at ≤ 200 per run (≈ 71 hourly runs); then only new ids cost a request.
  Raising `BIGTECH_MAX_DETAILS` speeds this up at 1 rps (300 ≈ 5 min/run).
- HCLTech posts many identical requisitions as separate postings (e.g. 10× "SeniorAdministrator - Linux…" in Mumbai);
  they have distinct URLs/ids and are emitted as distinct jobs.
- Closed jobs that are already known stay open until the sitemap drops them.

## For the registry

`{ slug: "hcltech", name: "HCLTech", ats: "successfactors", token: "https://careers.hcltech.com/", careersUrl: "https://careers.hcltech.com/go/India/9553955/" }` —
recommend **`custom`** in P04 (scraped here); the RMK `/services/` API is robots-disallowed.
