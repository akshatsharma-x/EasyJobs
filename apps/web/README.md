# @easyjobs/web

The EasyJobs website: real-time internship and job search for India. It is built with Next.js 16 (App Router, RSC), React 19, Tailwind CSS v4, Radix (shadcn-style components), TanStack Query v5, nuqs, cmdk, vaul, sonner, motion and zustand.

It works on its own today in **mock mode** (an in-memory API with the same semantics as the real one), and switches to the real API (`apps/api`, prompts.md §0.5) with one env var.

## Quick start

```bash
pnpm install                          # from the repo root
pnpm --filter @easyjobs/web dev       # http://localhost:3000 (mock mode by default)
```

## Switching to the real API

The app reads the **repo-root `.env`** (loaded in `next.config.ts` via `@next/env`). Set:

```bash
NEXT_PUBLIC_USE_MOCKS=0
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Then restart `pnpm --filter @easyjobs/web dev`, or rebuild with `build` + `start`. `NEXT_PUBLIC_*` values are inlined at build time, and in http mode the mock dataset is never shipped.

- The browser calls the API directly for refinements, suggestions and the SSE stream, so the API's CORS settings must allow `WEB_ORIGIN` (default `http://localhost:3000`).
- Server components use `API_INTERNAL_URL` when it's set (Docker or a private network). Otherwise they use `NEXT_PUBLIC_API_URL`.
- Every route, query string and response shape comes from `@easyjobs/contract`: `API_ROUTES`, `toQueryString`, `parseSearchQuery`, `jobPath`. Nothing is redefined here.

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCKS` | `1` | `0` = real API. Build-time. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Public API base URL (browser and server). |
| `API_INTERNAL_URL` | (unset) | Optional server-only API base URL. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical URLs, sitemap, JSON-LD, share links. |
| `NEXT_PUBLIC_MOCK_LATENCY_MS` | `120` | Simulated browser latency in mock mode, so skeletons and keepPreviousData are visible. |
| `LOGO_DEV_TOKEN` | (unset) | Optional, server-only. Lets the `/logo/<domain>` proxy fetch logo.dev images before the Google favicon. |

See `.env.example`.

## Scripts

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next.js on port 3000 |
| `typecheck` | `tsc --noEmit` (strict) |
| `test` | Vitest: mock API filters, facets, sorts and stream; salary and other formatters; smart-query parser; `toQueryString` round trip; HTTP client against a stub §0.5 server |
| `e2e` | Playwright against a **production build** on :3005. Mock mode, desktop and Pixel 7. |
| `screenshots` | 20 review screenshots in `screenshots/`: `/`, `/jobs` with filters, a job page, `/companies` and `/saved`, at 1440×900 and 390×844, light and dark |

Helper scripts in `scripts/` (all optional):
- `console-check.mjs`: browser console errors per page. Set `BASE_URL`.
- `paint-timing.mjs`: FCP and LCP in headless Chromium.
- `h2-proxy.mjs`: a local HTTP/2 + TLS proxy for production-like Lighthouse runs.
- `subset-fonts.mjs`: regenerates the font subsets.

## How it's built

**Data layer (`src/lib/api/`).** There is one `JobsApi` interface (`types.ts`) with two implementations:
- **`http.ts`** uses `fetch` with `API_ROUTES` and `toQueryString`. It maps 404s to `null`, maps `ApiError` responses to `ApiRequestError`, and uses `EventSource` for `subscribe`.
- **`mock.ts`** + **`mock-data.ts`** generate ~400 open jobs and 8 closed ones, deterministically from a seeded PRNG and templates. The companies are real (Google, Razorpay, TCS…) with real domains and careers pages. Behaviour follows §0.5: text match on title, company and skills; every filter; disjunctive facets; 3 sorts; pagination; suggest; stats; companies. A simulated stream emits a realistic job every 6–12 s, biased towards the active filters.
  - Posting times are stored as offsets and turned into dates at query time, so the data always looks fresh and counts are deterministic.
  - Live job ids are self-describing (`lv-…`), so the server can render the page of a job the browser only saw on the stream.
- **`index.ts`** picks the implementation from `NEXT_PUBLIC_USE_MOCKS` through a lazy `import()`. The same `api` object works in server and client components.

**URL state (`src/lib/search-state.ts`).** All search state lives in the URL. Each key is parsed with `parseSearchQuery` and serialised with `toQueryString`. nuqs only provides shallow history updates (no server round trip) and keeps the components in sync. Back and forward work, and every search is shareable. `?job=<id>` holds the split-view selection and uses replace history.

**Rendering.** Pages are server components. `/` and `/jobs` render their first content on the server. The search page prefetches its first results page into TanStack Query on the server (`HydrationBoundary`); after that, refinements fetch on the client with `keepPreviousData`. Job pages are SSR with JSON-LD `JobPosting`, a canonical URL, an OG image (`/og/jobs/[id]` via `next/og`), 308 redirects to the canonical slug, and real 404s.

**Pages.**
- `/` (hero search, live strip, logo marquee, "Just posted" live feed, category bento, top companies, batch band)
- `/jobs`
- `/jobs/[id]/[[...slug]]`
- `/companies`, `/companies/[slug]`
- `/internships`, `/freshers`, `/remote`, `/off-campus`, `/work-from-home` (presets)
- `/saved` (tracker with CSV export)
- `/about`, 404 and error pages
- `sitemap.xml`, `robots.txt`, `manifest.webmanifest`

**Design system (`src/app/globals.css`).**
- **Palette:** a neutral zinc base and one cobalt accent (`--brand`), with green reserved for New/Live. Light and dark themes both meet AA contrast.
- **Type and spacing:** Geist Sans and Geist Mono (subset variable fonts in `src/fonts/`, OFL), an 8-pt rhythm, hairline borders and 12–16 px radii.
- **Interaction:** all motion respects `prefers-reduced-motion`. Filters use native, accessible controls: `<details>` sections, checkboxes, a `role="switch"` checkbox, a range slider and a `<select>` for sort.

**Logos.** The order is `company.logoUrl`, then the same-origin `/logo/<domain>` proxy, then a deterministic monogram. The proxy tries logo.dev, then `https://www.google.com/s2/favicons?domain=<domain>&sz=128`, caching for 7 days. Missing or low-res icons (< 32 px) come back as a 1×1 PNG, and the tile turns them into the monogram. This means no browser 404s and no blurry favicons. Logos always sit on a white rounded tile with a hairline border.

## Keyboard

| Key | Action |
|---|---|
| `/` | Focus search |
| `j` / `k` (or ↑↓ in split view) | Move through jobs |
| `Enter` | Open the selected job |
| `s` | Save or unsave |
| `o` | Open the apply link |
| `Esc` | Close the preview |
| `⌘K` / `Ctrl+K` | Command palette (search, presets, companies, pages, theme) |

## Performance

These choices were measured with Lighthouse 12 mobile:
- Variable fonts are subset to about 36 KB each and both preloaded. Otherwise Mono is discovered from the CSS and adds a round trip.
- JS-heavy primitives are lazy-loaded or replaced with native elements: the vaul sheets, the report dialog, sonner, cmdk and the motion layout features.
- Decorative logos load when the browser is idle.
- Turbopack chunk merging is enabled (`experimental.turbopackChunking`).
- CSS is *not* inlined: Next would duplicate it in the RSC payload.

See `docs/status/P01.md` for the numbers.
