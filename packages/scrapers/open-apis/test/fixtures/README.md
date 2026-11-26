# Fixtures

| File | Provenance |
|---|---|
| `unstop-jobs.json`, `unstop-internships.json` | Live `search-result?per_page=50&oppstatus=open`, 2026-11-26; 9 representative records, `details` trimmed to 1.2 kB, pagination set to a single page |
| `remotive.json` | Live `remotive.com/api/remote-jobs`, 2026-11-26 (whole 16-job feed, descriptions trimmed) |
| `remoteok.json` | Live `remoteok.com/api`, 2026-11-26: legal row + Worldwide/Asia/blank/US/salary rows |
| `arbeitnow.json` | Live page 1, 2026-11-26: all 26 remote rows + 3 on-site rows, `links.next` nulled |
| `himalayas-search.json` | Live `jobs/api/search?country=IN&sort=recent&page=1`, 2026-11-26 (20 jobs) |
| `jobicy-anywhere.json`, `jobicy-apac.json` | Live `api/jobs?count=100&geo=…`, 2026-11-26; 12 rows each, cursor removed |
| `wwr.rss` | Live `remote-jobs.rss`, 2026-11-26; 14 items (kept and restricted examples) |
| `hn-search.json`, `hn-thread.json` | Live Algolia responses, 2026-11-26; thread trimmed to 30 top-level comments |
| `adzuna-in.json`, `jooble-in.json`, `themuse.json` | **Synthetic**, in the documented response formats (no keys were available; The Muse answered with a Cloudflare challenge from our network) |

Privacy: HN usernames are replaced with `redacted`; emails and phone numbers are scrubbed from every fixture; the two
personal-name posts in the HN sample (a job seeker and a recruiter) are anonymised ("Rahul Example", "Erica Example"),
and the job-seeker profile post is replaced with synthetic text.
