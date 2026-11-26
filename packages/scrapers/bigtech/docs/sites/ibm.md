# IBM (`ibm`)

**Status:** working · **Endpoint type:** JSON (search API POST, list only) · **Interval:** 60 min

## Endpoint

The careers search page (`www.ibm.com/careers/search`) calls IBM's own Elasticsearch-style search API.

```
POST https://www-api.ibm.com/search/api/v2
content-type: application/json
{
  "appId": "careers", "scopes": ["careers2"],
  "query": { "bool": { "must": [] } },
  "post_filter": { "term": { "field_keyword_05": "India" } },
  "size": 50, "from": 0,
  "sort": [{ "dcdate": "desc" }, { "_id": "asc" }],
  "lang": "zz", "localeSelector": {}, "sm": { "query": "", "lang": "zz" },
  "_source": ["_id","title","url","description","body","dcdate","language","entitled",
              "field_keyword_05","field_keyword_08","field_keyword_17","field_keyword_18","field_keyword_19"]
}
→ { hits: { total: { value }, hits: [{ _id, _source: {…} }] } }
```

| Field | Meaning |
|---|---|
| `url` | `https://careers.ibm.com/careers/JobDetail?jobId=N` (official job page; `jobId` = sourceJobId) |
| `body` | **full description** as flattened text with inline `•` bullets, followed by a facet tail: `India Data & Analytics Hybrid Professional GURGAON, IN GURGAON (0063) IBM India Private Limited <skill keywords…>` |
| `description` | ~250-char teaser (fallback only) |
| `dcdate` | posting date `2026-11-24` (sortable; epoch ms in `sort`) |
| `field_keyword_05` | country (India 3,819 of 5,789 on 2026-11-26) |
| `field_keyword_08` | category (Software Engineering, Consulting, Data & Analytics, …) |
| `field_keyword_17` | work mode: `Hybrid` / `Remote` / `""` |
| `field_keyword_18` | career level: `Professional` / `Entry Level` / `Internship` |
| `field_keyword_19` | location `Bangalore, IN`, `PUNE, IN`, `Multiple Cities` |

The API validates `_source`, `sort` and `aggs` against a whitelist (a single unknown field → HTTP 400); `size: 0` is rejected. The page's default sort (`_score`, `pageviews`) is unstable for pagination, so we sort by `dcdate desc, _id asc`.

**robots / bot checks:** `www-api.ibm.com/robots.txt` serves the IBM home page (no rules) and the API answers the EasyJobsBot UA with clean 200s, no cookies. The search page itself runs Akamai bot-manager sensors, and the job pages on `careers.ibm.com` (Avature; robots allows `/careers`) answer bots with an **AWS WAF challenge** (`HTTP 202`, `x-amzn-waf-action: challenge`). We never fetch job pages — the API already has the full text.

## Mapping

| RawJob | Source |
|---|---|
| sourceUrl = applyUrl | `https://careers.ibm.com/careers/JobDetail?jobId={jobId}` |
| title | `title` |
| locations | `PUNE, IN` → `Pune, India` (", IN" would read as Indiana); `Multiple Cities` → `India` |
| descriptionHtml | `body` minus the facet tail → `<p>intro</p><ul><li>…</li></ul>` |
| postedAt | `dcdate` |
| department | `field_keyword_08` |
| workMode | `field_keyword_17` (Hybrid → hybrid, Remote → remote, blank → unset) |
| jobType / experienceLevel | `field_keyword_18`: Internship → internship/intern, Entry Level → entry, Professional → unset (vague) |
| extra | `careerLevel`, `office` ("GURGAON (0063)"), `legalEntity` ("IBM India Private Limited"), `skillKeywords` (raw space-joined phrases; not split because multi-word skills are ambiguous), `language`, `searchId` |

India filter: the API's own country facet. IBM's remote roles in other countries are country-bound, so they're not added.

## Numbers (live, 2026-11-26)

`npx tsx scripts/try.ts src/sites/ibm.ts --limit 50` → site total **3,819** (India), emitted 50/50 valid, 2.8 s (1 request). A full run is ~77 pages of 50 at ≤ 1 rps.

Fill rates (first 50): source/ids/urls/title/company/locations/descriptionHtml/descriptionText/postedAt/department/extra 100% · workMode 96% · isRemote 96% · jobType/experienceLevel 0% in this sample (only 2 of 3,819 India jobs are Internship/Entry Level). Facet-tail parsing (office, legal entity, skills) succeeded on 50/50.

Full run (`--limit all`): listed 3,819 = emitted 3,819, 0 invalid, 78.5 s, 77 requests. workMode 93%; legal entity + office parsed on 3,819/3,819, skill keywords on 3,818; no tail text leaked into descriptions; description text p5/p50/p95 = 2.7/3.4/3.8 KB.
