# Google — `google` (working)

Source: Google Careers' public **jobs XML feed** — one request per run, the full description included,
no detail calls.

```
GET https://www.google.com/about/careers/applications/jobs/feed.xml
    (careers.google.com/jobs/feed.xml redirects here)
200 text/xml, gzip on the wire ≈ 3.7 MB (18.7 MB XML), cache-control: public, max-age=1500, last-modified
<jobs><updated>2026-11-25T22:22:50Z</updated>
  <job>
    <published>2026-10-20T08:09:16.735Z</published><jobid>96880477301809862</jobid><title>…</title>
    <description>&lt;h3&gt;Minimum qualifications:&lt;/h3&gt;…</description>   (entity-escaped HTML)
    <url>https://careers.google.com/jobs/results/{id}-{slug}/</url>
    <jobtype>FULL_TIME | INTERN | PART_TIME</jobtype><employer>Google | DeepMind | YouTube</employer>
    <languageCode>en-US</languageCode><categories><category>SOFTWARE_ENGINEERING</category></categories>
    <remote>onsite | remote</remote><isRemote>No</isRemote><isHybrid>No</isHybrid>
    <locations><location><city>Bengaluru</city><state>Karnataka</state><country>India</country></location>…</locations>
  </job>…
```

## Robots / etiquette

`www.google.com/robots.txt`, group `User-agent: *` (shared with Google-Extended and Yandex):

```
Disallow: /about/careers/applications/candidate-prep
Disallow: /about/careers/applications/connect-with-a-googler
Disallow: /about/careers/applications/jobs/results?page=
Disallow: /about/careers/applications/jobs/results/?page=
Disallow: /about/careers/applications/jobs/results?*&page=
Disallow: /about/careers/applications/jobs/results/?*&page=
```

A blanket `Disallow: /about/careers/applications/jobs/results` exists only in a separate
`User-agent: Yandex` group. So for us: the feed and job pages are allowed; **paging through search
results is not**. The search UI has no JSON API (server-rendered `AF_initDataCallback` blobs), so the
feed is both the allowed and the cheapest route (1 request vs. hundreds of pages). We do not
enumerate filtered first pages to work around the paging rule.

## Filter and mapping

- India: keep jobs with at least one India location (`isOpenToIndia` on "City, State, Country"
  labels). The feed's remote roles are country-bound (USA/UK/…); remote roles listing India are kept.
  Jobs with no location (≈155 worldwide) are dropped.
- sourceJobId `jobid` · sourceUrl = applyUrl = canonical
  `https://www.google.com/about/careers/applications/jobs/results/{id}-{slug}` (legacy careers.google.com
  URLs 301 there) · title · locations · descriptionHtml (decoded once) · postedAt `published`.
- department: first category, title-cased ("Software Engineering"); more in `extra.categories`.
- employmentTypeRaw `jobtype`; jobType FULL_TIME → full_time, INTERN → internship, PART_TIME → part_time;
  an explicit "(Fixed-Term Contract)" title wins → contract.
- experienceLevel: INTERN → intern; Google's title markers "Early Career" → entry, "University Graduate"
  → fresher; otherwise undefined (normalizer decides).
- workMode: remote → remote, isHybrid → hybrid, else onsite (+ isRemote).
- experienceRaw / experienceMin: highest "N years of experience" inside *Minimum qualifications*.
- company is always "Google" (target `google`); DeepMind / YouTube go to `extra.employer`.

## Numbers (2026-11-25)

- Feed: **3,103** jobs worldwide (USA 1,712, **India 252**, Japan 158, UK 115, …); India: Bengaluru 167,
  Hyderabad 55, Gurugram/Gurgaon 46, Mumbai/Navi Mumbai 41, Pune 7; 249 FULL_TIME + 3 INTERN; 1 remote.
- CLI `--limit all`: **252** emitted, 0 invalid, 0.6 s (full_time 247, internship 3, contract 2;
  entry 7, intern 3). `--limit 50`: 50 emitted, 0 invalid, 1.1 s.

Fill rates (`--limit 50`): source, sourceKind, sourceJobId, sourceUrl, target, applyUrl, title,
company, locations, descriptionHtml, descriptionText, postedAt, companySlug, companyDomain, department,
employmentTypeRaw, jobType, workMode, isRemote **100%** · experienceRaw / experienceMin **88%** ·
extra 46% · experienceLevel 10%.

Caveat: if Google ever retires the feed, there is no robots-compatible fallback (search pagination is
disallowed) — the scraper fails loudly ("<jobs> root not found") rather than degrading.
