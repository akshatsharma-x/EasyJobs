# wipro — Wipro (careers.wipro.com)

**Status:** working · **Endpoint type:** `sitemap.xml` + job pages (SAP SuccessFactors RMK, HTML) · **interval:** 60 min

## Endpoints (verified 2026-11-26)

| Step | Request | Notes |
|---|---|---|
| list | `GET https://careers.wipro.com/sitemap.xml` | one ~1.3 MB request; 6,924 `<url>` entries `/job/<City>-<TITLE>-<ISO3>-<postal>/<postingId>/`, all `lastmod` = sitemap build date (useless as a posting date) |
| detail | `GET <sitemap URL>` (unknown ids only) | redirects to `/job/<Title>/<reqId>-en_US/`; `joblayouttoken` blocks: *Job Title*, *City*, *State/Province*, *Posting Start Date* (`M/D/YY`), then `itemprop="description"` blocks |

**Why not the search API:** the search page (SearchResultsUnify) loads jobs from `POST /services/recruiting/v1/jobs`
(with a page-embedded CSRF token), and robots.txt has `Disallow: /services/`. `/search/` HTML renders no jobs
server-side. robots.txt allows `/sitemap.xml` and `/job/…`.

## India filter

From the ISO-3 country token in the slug (`…-IND-560035`) — no request needed. Slugs without a country token
are kept only when their city prefix is an Indian city. **5,689 of 6,924** postings are in India.
Country tokens are matched against a list of real ISO-3 codes so title acronyms ("…-JAVA-SAP") aren't mistaken
for countries.

## Mapping

| RawJob | Source |
|---|---|
| sourceJobId | posting id from the URL (`1375742855`) |
| sourceUrl / applyUrl | the sitemap job URL (official job page) |
| title | **derived from the slug** (`PRINCIPAL CONSULTANT TECH & IMPL L1`); the page title (`… - TECH & IMPL L1`) is `extra.pageTitle` |
| locations | `"<slug city>, India"` |
| postedAt | *Posting Start Date* (`11/9/26` → `2026-11-09T00:00:00Z`) |
| descriptionHtml | the job-specific `itemprop="description"` block; corporate intro ("Wipro Limited (NYSE: WIT…") and outro ("Reinvent your world…") are cut |
| skills | `Mandatory Skills: …` line |
| experienceRaw/Min/Max | `Experience: 8-10 Years` line |
| jobType / employmentTypeRaw | `contract` when the title says "(CONTRACT)", else unset |
| extra | `pageTitle`, `city`, `state`, `postal`, `band` (Wipro band L1–L5), `canonicalUrl` |

Title and location come from the slug in **both** full and light records (known ids → no detail fetch), so the
stored values don't flip between runs; only punctuation (" - ") differs from the page title.

## Decisions / caveats

- Closed postings render `<p class="jobErrMsg">` (≈1 in 9 in a sample — the sitemap is rebuilt every few days);
  they're skipped and memoised in-process (`wiproSkipped`, 24 h TTL) so later runs don't re-fetch them.
  Known jobs that close stay open until the sitemap drops them.
- Newly posted jobs appear only after the site regenerates its sitemap (it was 5 days old on 2026-11-26).
- Detail budget: ≤ 200 job pages per run (`BIGTECH_MAX_DETAILS`), newest posting ids first; the first full
  backfill of ~5.7k India jobs takes ~29 hourly runs, after which only new ids cost a request.
- No level hint: the site has no career-stage category (bands L1–L5 are kept in `extra.band`).

## Numbers (`npx tsx scripts/try.ts src/sites/wipro.ts --limit 50`, 2026-11-26)

- site total (India): **5,689** · emitted **50/50 valid**, 0 invalid, 53 s (1 sitemap + 50 job pages at ≤ 1 rps)
- fill: title/locations/descriptionHtml/postedAt 100% · experienceMin/Max 82% · skills 82% · jobType 46% (contract roles)

## For the registry

`{ slug: "wipro", name: "Wipro", ats: "successfactors", token: "https://careers.wipro.com/", careersUrl: "https://careers.wipro.com/" }` —
recommend P04 mark it **`custom`** (this package scrapes it). Note for P08: the RMK `/services/` API is
robots-disallowed here; use sitemap + job pages.
