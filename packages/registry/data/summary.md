# Company registry summary

Generated 2026-11-25T23:47:08.096Z by `scripts/verify.ts` (last check 2026-11-25T23:36:29.653Z).

| | count |
|---|---:|
| Companies in `companies.json` | **1,581** |
| Verified via a live ATS job API (`verifiedBy: ats-api`, job count known) | **752** |
| … of which with ≥ 1 open job | 730 |
| ATS identified + careers page verified, no job API (`verifiedBy: ats-page`: Phenom, SuccessFactors, Avature, iCIMS, Taleo, JSON-LD, Darwinbox, Keka, Zoho Recruit…) | 122 |
| Careers-page entries (`ats: custom`, page loaded, no job API) | 418 |
| Curated portals not fetchable politely (`verifiedBy: unverified`, `verifiedAt: null`) | 289 |
| Portals scraped by `@easyjobs/scraper-bigtech` (P09; `extra.scrapedBy`) | 15 |
| Open jobs across verified boards | 138,440 |
| Open jobs in India (Workday tenants that expose a country facet) | 0 |
| Companies with India presence | 942 |
| Rejected candidates (`rejected.json`) | 307 |

## By ATS

| ats | companies | with open jobs | open jobs |
| --- | ---: | ---: | ---: |
| custom | 435 | 0 | 0 |
| greenhouse | 324 | 322 | 31,730 |
| ashby | 273 | 257 | 13,426 |
| workday | 272 | 0 | 0 |
| lever | 58 | 56 | 4,513 |
| smartrecruiters | 50 | 50 | 41,697 |
| successfactors | 26 | 0 | 0 |
| oracle | 24 | 24 | 43,895 |
| darwinbox | 22 | 0 | 0 |
| phenom | 21 | 4 | 8,700 |
| avature | 13 | 0 | 0 |
| keka | 12 | 0 | 0 |
| zoho_recruit | 10 | 0 | 0 |
| workable | 7 | 6 | 213 |
| teamtailor | 7 | 6 | 83 |
| recruitee | 6 | 6 | 274 |
| eightfold | 5 | 5 | 2,646 |
| jsonld | 4 | 0 | 0 |
| icims | 4 | 0 | 0 |
| bamboohr | 3 | 3 | 40 |
| taleo | 2 | 0 | 0 |
| personio | 2 | 1 | 6 |
| freshteam | 1 | 1 | 16 |

## By tag

| tag | companies | ATS-verified | open jobs |
| --- | ---: | ---: | ---: |
| big_tech (Big Tech) | 22 | 5 | 4,979 |
| mnc (MNC) | 522 | 117 | 107,289 |
| unicorn (Unicorn) | 347 | 246 | 21,701 |
| startup (Startup) | 614 | 389 | 15,646 |
| indian_it (Indian IT services) | 27 | 2 | 288 |
| product (Product company) | 967 | 526 | 55,459 |
| service (Service company) | 78 | 18 | 9,628 |
| gcc (Global capability centre) | 302 | 29 | 40,905 |
| fintech (Fintech) | 244 | 126 | 16,585 |
| consulting (Consulting) | 29 | 5 | 928 |
| bank (Banking) | 38 | 4 | 9,686 |
| ai (AI) | 218 | 157 | 12,210 |
| yc (Y Combinator) | 94 | 72 | 4,730 |

## By priority

| priority | companies | ATS-verified | open jobs |
| --- | ---: | ---: | ---: |
| 1 (~15 min) | 329 | 101 | 33,888 |
| 2 (hourly) | 750 | 270 | 61,097 |
| 3 (daily) | 502 | 381 | 52,254 |

## By candidate segment

| segment | companies | ATS-verified |
| --- | ---: | ---: |
| ai | 122 | 101 |
| big-tech | 74 | 24 |
| enterprise-software | 163 | 100 |
| finance | 116 | 27 |
| global-startups | 305 | 239 |
| india-startups | 198 | 43 |
| indian-it | 88 | 16 |
| mnc-other | 134 | 10 |
| more | 257 | 147 |
| semis-hardware | 74 | 11 |
| yc | 50 | 34 |

## Top 50 by open jobs

| # | company | ats | open jobs | India jobs | priority |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Domino's (`domino-s`) | smartrecruiters | 25,238 | – | 3 |
| 2 | Marriott International (`marriott-international`) | oracle | 13,014 | – | 2 |
| 3 | JPMorgan Chase (`jpmorgan-chase`) | oracle | 6,802 | – | 1 |
| 4 | Bosch (`bosch`) | smartrecruiters | 5,168 | – | 1 |
| 5 | Hilton (`hilton`) | oracle | 4,569 | – | 2 |
| 6 | SpaceX (`spacex`) | greenhouse | 2,884 | – | 3 |
| 7 | Oracle (`oracle`) | oracle | 2,858 | – | 1 |
| 8 | EXL (`exl`) | oracle | 2,468 | – | 1 |
| 9 | Sopra Steria (`sopra-steria`) | smartrecruiters | 2,122 | – | 2 |
| 10 | AbbVie (`abbvie`) | smartrecruiters | 2,015 | – | 2 |
| 11 | Startek (`startek`) | oracle | 1,908 | – | 2 |
| 12 | H&M (`h-and-m`) | smartrecruiters | 1,826 | – | 2 |
| 13 | Marks & Spencer (`marks-and-spencer`) | oracle | 1,823 | – | 2 |
| 14 | HSBC (`hsbc`) | eightfold | 1,453 | – | 1 |
| 15 | BNY (`bny`) | oracle | 1,234 | – | 1 |
| 16 | Emerson (`emerson`) | oracle | 1,204 | – | 2 |
| 17 | Cummins (`cummins`) | oracle | 1,177 | – | 2 |
| 18 | Fortinet (`fortinet`) | oracle | 1,081 | – | 2 |
| 19 | ServiceNow (`servicenow`) | smartrecruiters | 972 | – | 1 |
| 20 | Photon (`photon`) | oracle | 967 | – | 2 |
| 21 | OpenAI (`openai`) | ashby | 876 | – | 1 |
| 22 | Veeva Systems (`veeva-systems`) | lever | 875 | – | 2 |
| 23 | Databricks (`databricks`) | greenhouse | 874 | – | 1 |
| 24 | Uber (`uber`) | oracle | 857 | – | 1 |
| 25 | Delivery Hero (`delivery-hero`) | smartrecruiters | 809 | – | 3 |
| 26 | Stripe (`stripe`) | greenhouse | 772 | – | 1 |
| 27 | Chubb (`chubb`) | oracle | 750 | – | 2 |
| 28 | Gopuff (`gopuff`) | lever | 748 | – | 3 |
| 29 | onsemi (`onsemi`) | oracle | 701 | – | 2 |
| 30 | Shield AI (`shield-ai`) | ashby | 687 | – | 3 |
| 31 | Coupang (`coupang`) | greenhouse | 671 | – | 2 |
| 32 | Anthropic (`anthropic`) | greenhouse | 635 | – | 1 |
| 33 | Dell Technologies (`dell-technologies`) | oracle | 621 | – | 1 |
| 34 | Expeditors (`expeditors`) | smartrecruiters | 556 | – | 2 |
| 35 | Rocket Lab (`rocket-lab`) | greenhouse | 551 | – | 3 |
| 36 | Continental (`continental`) | smartrecruiters | 543 | – | 2 |
| 37 | KPMG (`kpmg`) | oracle | 535 | – | 1 |
| 38 | Cloudflare (`cloudflare`) | greenhouse | 523 | – | 2 |
| 39 | Lucid Motors (`lucid-motors`) | greenhouse | 511 | – | 3 |
| 40 | Airwallex (`airwallex`) | ashby | 508 | – | 3 |
| 41 | Netflix (`netflix`) | eightfold | 445 | – | 1 |
| 42 | NielsenIQ (`nielseniq`) | smartrecruiters | 435 | – | 2 |
| 43 | Sutherland (`sutherland`) | smartrecruiters | 430 | – | 2 |
| 44 | MongoDB (`mongodb`) | greenhouse | 422 | – | 2 |
| 45 | Lyra Health (`lyra-health`) | lever | 421 | – | 3 |
| 46 | Wise (`wise`) | smartrecruiters | 417 | – | 2 |
| 47 | DoorDash (`doordash`) | greenhouse | 402 | – | 3 |
| 48 | Zscaler (`zscaler`) | greenhouse | 393 | – | 1 |
| 49 | Datadog (`datadog`) | greenhouse | 392 | – | 2 |
| 50 | Elastic (`elastic`) | greenhouse | 391 | – | 2 |

## Rejected candidates by reason

| reason | candidates |
| --- | ---: |
| no ATS board or careers page found | 239 |
| board belongs to another company | 53 |
| blocked (robots.txt / 403) | 6 |
| board/page not found (404, empty or moved) | 5 |
| errors (network / 5xx / unexpected response) | 4 |
