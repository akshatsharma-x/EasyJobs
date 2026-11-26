# Zoho — `zoho`

- **Status:** working · **Endpoint type:** RSS (Zoho Recruit career-site feed) · **Interval:** 60 min
- **Careers page:** https://careers.zohocorp.com/jobs/Careers

## Endpoint
`GET https://careers.zohocorp.com/jobs/Careers/rss` — robots.txt: `Allow: /jobs/*` (Zoho Recruit career site).

Each `<item>`: `title`, `link` (`/jobs/Careers/{id}/{slug}?source=RSS`), `guid` (= job id), `pubDate`
("Fri, 24 Jun 2022 12:00:00 IST"), `description` = `Category: X<br><br>Location: Y<br>…` + full description HTML +
a trailing "Details" link.

Why the feed: the landing page embeds only a couple of featured roles (hidden `<input id="jobs">`, HTML-escaped JSON
with `Job_Type`, `Remote_Job`, `Country1`) inside a 1.8 MB page, and job pages are ~1.7 MB of JS each. The feed lists
every published opening with its full description in ~28 KB.

## Mapping
- sourceJobId = guid; sourceUrl/applyUrl = link without `?source=RSS`.
- locations: cities named in "…requirements for this role in Chennai, Salem, … and Madurai." → "Chennai, India", …;
  otherwise the Location line ("Tamil Nadu Tamil Nadu India" → "Tamil Nadu, India").
- department = Category; postedAt = pubDate (IST → UTC). Zoho keeps evergreen roles open for years, so dates can be old.
- Description: header lines, "Details" link, inline styles and font spans removed.
- No job type / work mode in the feed → left to the normalizer.

## Numbers (2026-11-26)
Site total 9 openings; 9/9 valid in 0.4 s (1 request). Fill: locations/descriptionHtml/postedAt/department 100%.

## For the registry
`{ slug: "zoho", name: "Zoho", ats: "zoho_recruit", token: "https://careers.zohocorp.com/jobs/Careers" }` — no
zoho_recruit adapter exists in P07/P08; this scraper covers it, so P04 should mark Zoho `custom`.
