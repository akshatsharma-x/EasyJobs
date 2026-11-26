# @easyjobs/scraper-coursejoiner

Internships, fresher jobs and off-campus drives from **CourseJoiner** and three similar Indian WordPress job blogs.
Each post becomes one `RawJob` per role (`sourceJobId = <postId>#<n>`, `sourceKind: "aggregator"`, `target: null`).
Each job links to the **original apply link** (company career site / ATS first), so it merges with the official
posting via fingerprint rule 1 (prompts.md §0.4).

| Scraper id | Site | Strategy | Why it's in |
|---|---|---|---|
| `coursejoiner` | https://coursejoiner.com | WP REST | the primary source |
| `freshershunt` | https://freshershunt.in | WP REST only (`/feed/` is disallowed) | off-campus + internships, direct ATS links, many multi-role posts |
| `fresheroffcampus` | https://www.fresheroffcampus.com | WP REST | off-campus fresher hiring, direct ATS/career links |
| `kickcharm` | https://kickcharm.com | WP REST | fresher/WFH jobs, plain `Label: value` posts |

All four share one implementation: `createWpJobBlogScraper({ id, name, baseUrl, includeCategories, excludeCategories, … })`
(`src/wp/scraper.ts`, configs in `src/sites.ts`).

## Discovery (2026-11-26)

### CourseJoiner
- **robots.txt**: `User-agent: *` · `Disallow: /wp-admin/` · `Allow: /wp-admin/admin-ajax.php` · `Sitemap: /sitemap_index.xml`. Cloudflare sits in front and serves our bot user agent normally.
- **Sitemaps**: Yoast-style `sitemap_index.xml` → `post-sitemap1…24.xml`, `page-sitemap.xml`, `category-sitemap.xml`. Every `lastmod` was stuck at 2026-06-0x (stale cache), so sitemaps are useless for freshness. They are only the last-resort HTML strategy.
- **WP REST**: open. `/wp-json/wp/v2/posts?per_page=100&_fields=id,date_gmt,modified_gmt,link,title,content,categories,tags`
  → 3,358 posts (`X-WP-Total`), `after`, `modified_after`, `include`, `orderby=modified` all work. `/categories` has 74 terms and `/tags` thousands.
  REST responses carry no ETag/Last-Modified (`cache-control: must-revalidate, max-age=0`).
- **RSS**: `/feed/` and `/category/<slug>/feed/` serve 50 items each. Excerpts only, no `content:encoded`. ETag + Last-Modified are sent and `304 Not Modified` works.
- **Volume**: ≈ 346 posts per 60 days. About 210 are job categories (`internship` 154, `job` 38, `apprenticeship` 12, `internships`, `trainee`, `placement`, `fellowship`). The rest are free courses, Udemy coupons, scholarships, "free Gemini/ChatGPT" offers, hackathons and news.
- **Post shapes** (all covered by fixtures):
  - Nov 2026: "Key Highlights" table (`Feature | Official Details`), FAQ block, closing `Official Job Apply Link – <url>`.
  - Feb 2026: `<li><strong>Company:</strong> …</li>` lists.
  - Jul 2026: mostly prose.
  - 2025: "Key Highlights" lists (`Institution:`, `Internship Name:`, `Monthly Stipend:`).
- **Apply links**: CourseJoiner links job boards a lot (Naukri, Internshala, LinkedIn: about 60%). Many links are `tinyurl.com` shorteners.
- **Pitfalls found**: a wrong-company "Submitted Reference Link" (Cisco URL in an EA post), `google.com/search?q=<internal url>` wrappers, "Read More" related-post links inside the eligibility sections, `redirect.viglink.com/?u=…` affiliate wrappers, and AI-written FAQ boilerplate.

### Similar blogs (candidates vetted with `pnpm discover <host>`)
| Site | Verdict |
|---|---|
| kickcharm.com | ✅ robots allows everything but `/wp-admin/`; REST open (7k posts); ~3 job posts/day |
| freshershunt.in | ✅ REST allowed (`/feed/`, `/tag/`, `/?s=` disallowed → config `strategies: ["rest"]`); ~4 posts/day |
| fresheroffcampus.com | ✅ robots allows all but `/wp-admin/`; REST open; ~5 posts/day (re-dates old post ids — see known gaps) |
| offcampusjobs4u.com | ❌ its own robots section adds `Disallow: /*?` (every REST query) and `/feed/`; Cloudflare `Content-Signal: ai-train=no` |
| freshersnow.com | ❌ mostly govt results/admit cards; walk-ins have no apply link (Telegram/WhatsApp/maps only) |
| freshersvoice.com | ⏸ REST open, but many round-up posts ("Jobs in Mumbai") and govt jobs; possible later |
| studentscircles.com | ❌ no longer WordPress (Job Boardly 404) |
| freshercareers.in / freshersgold.com / jobskar.com | ❌ stale since 2026-06 / now Udemy coupons / down (522) |

## How it works
```
list (REST: after | modified_after, newest first; RSS fallback with conditional GET; HTML: sitemaps + pages)
 → intent filter on categories/tags/title (no content needed)
 → content fetch in batches (REST include=…, 25 per request), cached by post id + modified date
 → resolve shorteners (HEAD, manual redirects, cached 30 days; robots.txt respected)
 → parsePost: line model → Label:value pairs → company → apply-link scoring → role(s) → hints → descriptionHtml
 → optional LLM second opinion for low-confidence posts
 → emit (skip expired), cache the parse
```
- **Politeness**: everything goes through the contract HTTP client (robots.txt, retries, 429/5xx backoff), plus a per-host gate: one request in flight and ≥ 1 s between requests (`minGapMs`).
- **Intent / category filter** (`src/parse/intent.ts`): `excludeCategories` win over `includeCategories`; patterns support `*`. Titles that are never jobs (courses, Udemy, scholarships, quizzes, results, admit cards, answer keys, hackathons, job simulations, "X to hire 20,000", "job market today") are skipped even inside job categories. Ambiguous categories (`program`, `fellowship`, `uncategorized`, `placement`) need a job word in the title.
- **Labels** (`src/parse/labels.ts`): tolerant mapping of "Company Name/Company/Organization/Institution", "Job Role/Role/Role Title/Position/Post Name/Designation", "Qualification/Education/Eligibility/Eligible Stream", "Batch/Eligible Batch/Passing Year/YOP", "Experience", "Salary/CTC/Package/Stipend/Offered Salary / CTC", "Job Location/Location(s)", "Job Type/Employment Type", "Work Mode", "Last Date/Application Deadline/Apply by", "Skills", "Apply Link/Official Job Apply Link" … from 2-column tables, `<strong>Label:</strong>` lines, plain `Label: value` lines and `<br>`-split paragraphs. "Not disclosed / ASAP / Not mentioned" values are dropped.
- **Company**: KV value > "About X" heading > title prefix (cut at Internship/Job/Recruitment/Off Campus/year, trailing role words removed unless the body uses the longer name on its own, e.g. "Mahindra Finance") > lead sentence > tag slug (`firstcry-internship-2026`). Candidates that agree reinforce each other.
- **Apply link** (`src/parse/apply.ts`): every outbound link is classified (ATS, company, job board, form, shortener; rejected: social, Telegram/WhatsApp, maps, app stores, other blogs/news, this site, assets).
  - Scoring: host kind + company match (host or ATS tenant/path) + job-specific path + "Apply Link/Apply Now/Click here to apply" anchor or KV label + "How to apply" section + repetition.
  - Penalties: homepages, job-board search/company pages, "Read More" context, FAQ.
  - Wrappers (`google.com/url`, `google.com/search?q=`, viglink, facebook `l.php`) are unwrapped and tracking params stripped (`utm_*`, `gh_src`, Naukri `src/sid/xp/px`, LinkedIn `/jobs/view` query).
  - No external apply link → the post is skipped.
- **Multi-role** (`src/parse/roles.ts`), checked in this order:
  1. A role table (rows tied to links by in-row link, requisition id or name).
  2. Several role-naming apply anchors with distinct URLs (incl. card-style anchors `<a><span>Role</span><span>Job ID…</span></a>`).
  3. One role with several city-specific links ("Click Here (Pune) · Click Here (Mysore)").
- **Hints**:
  - Values: `experienceRaw`, `salaryRaw`, `batches` (years next to batch words only), `degrees` (fixed vocabulary, case-sensitive for BE/ME/BA/CA), `validThrough` (deadline → 23:59:59 IST; year inferred from the post date).
  - Classification: `jobType`, `experienceLevel` (intern/fresher only when obvious), `workMode`/`isRemote`, and `tags` (`off-campus`, `walk-in`, `wfh`, `urgent`, `women`) from the title/role and specific slugs.
  - Other fields: `department`, `employmentTypeRaw`, `skills`, `companyDomain` (only when the apply host matches the company).
  - `extra` carries `postId`, `postTitle`, `categories`, `applyLinkKind`, `applyLinkScore`, `companySource`, `roleSource`, `roles`, `venue`, `interviewDate`, `vacancies`, `duration`, `lastDateRaw`, `qualificationRaw`.
- **descriptionHtml** (`src/parse/description.ts`): only the job-relevant part. Removed: images, ads, share/Telegram/WhatsApp blocks, TOC, FAQ, related-post lists, "Read More", interview-prep / conclusion / disclaimer sections, internal links (turned into text), attributes.
- **Optional LLM** (`src/llm/`): only when `ANTHROPIC_API_KEY` is set, the site allows it (`llm: true`) and the heuristics are unsure (confidence < 0.6, or skipped for no company/role/apply link).
  - Uses `claude-haiku-5-5` with a strict JSON schema (structured outputs, `effort: "low"`), capped at 30 calls per run.
  - The model may only choose apply links **by index** from our candidate list, so it can never invent a URL.
  - Cached by `postId:modified`. Everything works without it.

## Incremental & backfill
- `intervalMinutes: 15`.
- **First run / CLI / once per `WPJOBS_REFRESH_HOURS` (24 h)**: full window — posts published in the last `--backfill-days` (default 60). Unchanged posts are re-emitted from the parse cache (no refetch, no re-parse). With `ctx.isKnown` they go out as light records (`descriptionHtml: null`), so open jobs keep getting sightings.
- **`ctx.since` set** (worker) and a full run within 24 h: only posts with `modified_after = since − 1 h` (server query widened by 15 h for site-local-time quirks, then filtered exactly on `*_gmt`).
- **`ctx.isKnown(id#1)`** true, nothing cached and not modified since `since` → skipped without fetching content.
- **ETag / If-Modified-Since**: used for feeds and sitemaps (RSS/HTML strategies). REST on these hosts sends no validators.
- **`ctx.limit`** is honoured. Jobs whose deadline passed more than a day ago are not emitted.
- **Cache**: `packages/scrapers/coursejoiner/.cache/<site>/` (gitignored) holds post content, parses (bumping `PARSER_VERSION` re-parses offline), terms, redirects, HTTP validators, LLM answers and run metadata. Pruned to the window + 7 days. It is always safe to delete.

## Usage
```bash
pnpm --filter @easyjobs/scraper-coursejoiner scrape --limit 100                # all four sites → out/<id>.jsonl
pnpm --filter @easyjobs/scraper-coursejoiner scrape --scraper coursejoiner --limit all --backfill-days 30
pnpm --filter @easyjobs/scraper-coursejoiner scrape --scraper freshershunt --since 6h   # incremental mode
pnpm --filter @easyjobs/scraper-coursejoiner scrape --no-cache                 # memory-only cache
pnpm --filter @easyjobs/scraper-coursejoiner stats out [--markdown]            # validity, apply-link kinds, fill rates
pnpm --filter @easyjobs/scraper-coursejoiner inspect [--lines|--desc|--debug] test/fixtures/coursejoiner/40193.json
pnpm --filter @easyjobs/scraper-coursejoiner fixtures <siteId> <postId>[:shape] …   # save real posts as fixtures
pnpm --filter @easyjobs/scraper-coursejoiner discover <host> …                 # vet a new blog (robots/REST/RSS)
pnpm --filter @easyjobs/scraper-coursejoiner test          # offline (51 real post fixtures + a real feed & page, with snapshots)
LIVE=1 pnpm --filter @easyjobs/scraper-coursejoiner test   # + live smoke test per site
```

### Env vars (see `.env.example`)
| Var | Default | Meaning |
|---|---|---|
| `SCRAPER_USER_AGENT` | contract default | bot UA (robots groups are matched against it) |
| `ENABLE_COURSEJOINER`, `ENABLE_FRESHERSHUNT`, `ENABLE_FRESHEROFFCAMPUS`, `ENABLE_KICKCHARM` | on | set `0` to disable a site |
| `WPJOBS_BACKFILL_DAYS` / `<ID>_BACKFILL_DAYS` | 60 | backfill/refresh window (CLI `--backfill-days`) |
| `WPJOBS_REFRESH_HOURS` | 24 | how often an incremental worker run becomes a full-window refresh |
| `WPJOBS_CACHE_DIR` | package `.cache/` | cache root; `off` = memory only |
| `ANTHROPIC_API_KEY` | — | enables the optional LLM pass |
| `WPJOBS_LLM`, `WPJOBS_LLM_MODEL`, `WPJOBS_LLM_MAX_CALLS` | on, `claude-haiku-5-5`, 30 | LLM switches |

### Adding a blog
1. `pnpm discover <host>`. All REST rows must be `ALLOW`, and the site must have real apply links.
2. Add a `WpJobBlogConfig` to `src/sites.ts` with exclude/include patterns from its category list. Set `llm: false` when robots.txt carries content signals.
3. `pnpm fixtures <id> <postId>:<shape> …`, then `pnpm test` (new snapshots are written; review them).
