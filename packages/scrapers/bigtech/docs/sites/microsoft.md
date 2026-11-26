# Microsoft (`microsoft`)

**Status:** working (heavily rate-limited) · **Endpoint type:** JSON — Eightfold PCSX search + position_details · **Interval:** 60 min

## For the registry

Microsoft's careers site is an Eightfold **PCSX** tenant. The classic Eightfold API that P08's adapter uses
(`GET https://apply.careers.microsoft.com/api/apply/v2/jobs?domain=microsoft.com`) answers
`403 {"message": "Not authorized for PCSX"}`, so the registry should list Microsoft as
`ats: "custom"` (token `https://apply.careers.microsoft.com/careers?domain=microsoft.com`) — covered by this scraper.

## Endpoints (what the search/job pages call; robots.txt: `Allow: /careers`, `Allow: /api/pcsx`)

```
GET https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=&location=India&start={0,10,…}&sort_by=timestamp
→ { status: 200, error, data: { count, positions: [{ id, displayJobId, atsJobId, name,
     locations ["India, Karnataka, Bangalore"], standardizedLocations ["Bengaluru, KA, IN"],
     postedTs, creationTs (epoch s), department, workLocationOption ("onsite" for everything — unusable),
     locationFlexibility, isHot, positionUrl "/careers/job/{id}" }],
     appliedFilters { includeRemote: ["1"], … }, filterDef, sortBy } }
```
Page size is fixed at 10 (`num`, `pageSize`, `limit`, `count` are ignored). India count on 2026-11-26: **231** (global 2,363). `includeRemote=1` is applied by default, i.e. remote roles eligible in India are included.

```
GET https://apply.careers.microsoft.com/api/pcsx/position_details?position_id={id}&domain=microsoft.com&hl=en
→ { data: { jobDescription (HTML), publicUrl, efcustomTextWorkSite ["3 days / week in-office"],
     efcustomTextEmploymentType ["Full-Time"], efcustomTextRoletype ["Individual Contributor"],
     efcustomTextCurrentProfession, efcustomTextTaDisciplineName, efcustomTextRequiredTravel, … } }
```

No login, cookie, CSRF or reCAPTCHA token is required (the page loads an invisible reCAPTCHA, but the APIs answer without it).

### Rate limiting

Cookieless clients get `429 "Please try again later"` (no `Retry-After`) after roughly 5–6 requests per minute; even at 7 s spacing a third of calls were throttled, at ~9–10 s spacing almost none. The scraper therefore:

- keeps **15 s** between requests to the host (`minGapMs: 15_000`, 4/min — raised from 10 s after the integration report run hit repeated 429s at 10 s; `BIGTECH_MIN_GAP_MS` can only raise this floor);
- passes `retries: 0` to the contract client (its 1/2/4 s retries would just add 429s) and backs off itself exponentially: 30 s → 60 s → 120 s, or the server's `Retry-After` if longer (`MICROSOFT_429_BACKOFF_MS` scales it); a list page still throttled after that fails the run (no sweep);
- fetches at most **30 details per run** (`maxDetails`); further new jobs are deferred to the next run;
- after a detail call is still throttled following the back-off, it stops fetching details for the rest of the run;
- never stores a *new* job without its description: if its detail call fails or is throttled, the job is skipped (it's unknown, so the sweep is unaffected) and retried next run. Known jobs are emitted as light records from the list data.

A full listing is 24 pages (~6 min at 15 s); steady-state runs add only the new jobs' details (≤ 30 × 15 s).

## Mapping

| RawJob | Source |
|---|---|
| sourceJobId | PCSX `id` (also in the public URL); `extra.jobNumber` = Microsoft job number (`displayJobId`, e.g. 200064448) |
| sourceUrl = applyUrl | `publicUrl` = `https://apply.careers.microsoft.com/careers/job/{id}` |
| locations | `India, Karnataka, Bangalore` → `Bangalore, Karnataka, India`; `India, Multiple Locations, Multiple Locations` → `India` |
| descriptionHtml | `jobDescription` |
| postedAt | `postedTs` (epoch s) |
| department | `department` |
| employmentTypeRaw / jobType | `efcustomTextEmploymentType` ("Full-Time" → full_time; intern titles → internship) |
| workMode | `efcustomTextWorkSite`: "fully on-site" → onsite, "0 days / week in-office – remote" → remote, "1–4 days / week in-office" → hybrid |
| extra | `jobNumber`, `workSite`, `roleType`, `profession`, `discipline`, `travel`, `standardizedLocations`, `createdAt` |

**Levels are intentionally not mapped from the site.** The search has an "Experience level" facet (`filter_seniority=Intern|Entry|Mid-Level|Senior|Manager|Director|…`, verified from the page's own call), but it is model-inferred and contradicts titles: on 2026-11-26 its India "Entry" bucket held *Software Engineer II*, *Product Manager -II* and two *Senior Researcher* roles, and "Intern" held a *Senior Researcher*. Microsoft titles carry explicit levels (II, Senior, Principal, IC3), which the normalizer reads.

## Numbers (live, 2026-11-26)

`npx tsx scripts/try.ts src/sites/microsoft.ts --limit 20` → site total **232** (India), listed 20, **emitted 20/20 valid**, 20 detail calls, 0 detail errors, 273.5 s (2 list pages + 20 details at the 10 s gap; two 429s absorbed by the 30 s back-off).
A `--limit 50` run would take ~9 min at this pace and still emit at most 30 (the per-run detail cap), so the verification used 20.

Fill rates: source/ids/urls/title/company/locations/descriptionHtml/descriptionText/postedAt/department/employmentTypeRaw/jobType/workMode/isRemote/extra **100%** · experienceLevel 0% (deliberately left to the normalizer, see above).
Sample values: workMode hybrid 18 / onsite 2 ("3 days / week in-office" ×17, "Fully on-site" ×2, "4 days / week in-office" ×1); locations Bangalore 13, Hyderabad 10, Noida 4, Pune 2, Mumbai 1.
