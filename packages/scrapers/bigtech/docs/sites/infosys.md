# Infosys — `infosys`

- **Status:** working, **off by default** — opt in with `ENABLE_INFOSYS=1` (see the access note below) · **Endpoint type:** public JSON (the career.infosys.com SPA's unauthenticated job-search gateway) · **Interval:** 60 min
- **Careers page:** https://career.infosys.com/joblist

## Endpoints
- `GET https://intapgateway.infosysapps.com/careersci/search/intapjbsrch/getCareerSearchJobs?sourceId=1,21&searchText=ALL` (Infosys Ltd)
- `GET …/getCareerSearchJobs?sourceId=41&searchText=ALL` (Infosys BPM)
- (`GET …/getJobDesc?referenceCode={code}` returns the same fields for one job, so it isn't used.)

Source ids come from `career.infosys.com/assets/json/sourcelist.json`: 1 = Infosys Ltd India lateral, 21 = Infosys Ltd
India fresher (0 jobs today), 41 = Infosys BPM India. URL bases come from `assets/environments/environment.json`
(`JobsUnAuthUrl`). The authenticated variant (`…/refernow/searchJobs`) is not used.

Response: a JSON array with the whole list, no pagination (3.4 MB for 1,057 jobs). Each job: `referenceCode`
("INFSYS-EXTERNAL-256886" / "PROGEN-EXTERNAL-256895"), `postingTitle`, `roleDesignation`, `company`, `country`,
`location` (padded uppercase city, e.g. "PUNE      ", "Kolkata(WB)"), `functionalArea`, `unit`, `minExperienceLevel`,
`maxExperienceLevel`, `educationalRequirement`, `technicalRequirement`, `preferredSkills` / `genericSkills` (taxonomy
paths "Technology->DevOps->DevOps Platforms,…"), `rolesResponsibilities` (text), `postingDescription`,
`additionalResponsibility`, `createdOn` (naive timestamp, IST), `expiryDate`, `hotjob` ("Y"/"N"), `sourceId`,
`requisitionId`, `postingId`.

Public job page: `https://career.infosys.com/jobdesc?jobReferenceCode={code}&sourceId={id}` (the app's share-link format).

## Access note (judgment call — flagged for review)
- **career.infosys.com** (the HTML site, *even `/robots.txt`*) answers our honest bot UA with an **Akamai 403 "Access
  Denied"**. The scraper never requests that host; job pages are only linked (applyUrl) for humans.
- **intapgateway.infosysapps.com** (the JSON gateway the SPA calls) serves the bot UA (200), needs no login, cookie
  or token, and has no robots.txt (404).
- So nothing is bypassed or spoofed. But Infosys clearly doesn't want bots on the website itself. If W1 reads the
  Akamai block as covering the data too, set `BIGTECH_DISABLE=infosys` (or add a `disabledReason`).


**Decision (P09 integration, 2026-11-26):** treat the website's 403 as Infosys restricting automated access and follow the
project's LinkedIn/Naukri precedent: the scraper ships **off by default** (`isEnabled` is false unless `ENABLE_INFOSYS=1`).
The operator can turn it on at their discretion; it then only calls the open gateway with the honest bot UA.

## Mapping
| RawJob | Source |
|---|---|
| sourceJobId | `referenceCode` |
| sourceUrl / applyUrl | `career.infosys.com/jobdesc?jobReferenceCode=…&sourceId=…` |
| company | "Infosys" (sourceId 1/21) · "Infosys BPM" (41); legal entity in extra |
| locations | title-cased city, "(WB)"-style suffixes dropped → "Pune, India" |
| descriptionHtml | postingDescription + "Roles and responsibilities" + "Additional responsibilities" + "Technical requirements" + "Educational requirements" + "Preferred skills" sections |
| postedAt | `createdOn` interpreted as IST (+05:30) → UTC |
| validThrough | `expiryDate` (IST) |
| experienceMin / Max / Raw | `minExperienceLevel` / `maxExperienceLevel` (structured) |
| experienceLevel | sourceId 21 (fresher programme) → fresher; intern title → intern; else unset (the normalizer derives it from the years) |
| skills | leaf of each `preferredSkills` / `genericSkills` taxonomy path |
| degrees | `educationalRequirement` |
| department | `functionalArea` |
| extra | unit, roleDesignation, hiringType (lateral/fresher/bpm), hotJob, legalEntity, requisitionId |

## Numbers (2026-11-26)
Full run = 2 requests: **1,188 jobs** (1,057 Infosys Ltd + 131 Infosys BPM), 0 invalid, 1.2 s. `--limit 50`: 50/50
valid in 0.5 s. Fill 100%: locations, descriptionHtml, postedAt, validThrough, department, experienceMin/Max/Raw,
skills, degrees. jobType 0% (the site has no employment-type field), experienceLevel 0% today (no fresher-source jobs open).
