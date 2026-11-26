# HDFC Bank — `hdfc-bank` (extra target)

- **Status:** working · **Endpoint type:** JSON (RippleHire career-site API) · **Interval:** 60 min
- **Careers page:** https://www.hdfc.bank.in/careers → https://hdfcbank.ripplehire.com/candidate/careers, which
  redirects every visitor to `/candidate/?token=pvB5iAMcmu4ydUh2IW2O&source=CAREERSITE`.
- Same adapter as Axis Bank (`src/sites/_ripplehire.ts`); see docs/sites/axis-bank.md for the endpoint shapes.

## Tenant differences
- `jobTypeCustom3` is the employment type here ("Permanent") → employmentTypeRaw / jobType, not a work mode.
- `jobDesc` is often a whole DOCX-exported HTML document (`<!DOCTYPE><html><head><style>…`): only `<body>` content is
  kept, styles/classes/empty paragraphs dropped. `jobSkills` usually repeats the description, so it is appended as a
  "Skills" section only when its text is not already contained in the description.
- `bussinessUnit` (e.g. "Retail Trade and Forex", "Retail Branch Banking") → department.
- Multi-city postings ("Dabhoi, Vadodara, Halol, Bharuch") → one location per city.

## Numbers (2026-11-26, `--limit 50`)
Site total **561** jobs; 50/50 valid in 50.1 s. Fill: descriptionHtml/postedAt/locations/department/experienceMin/Max/
jobType 100%; workMode 0% (not published by this tenant).

## Registry note
`{ slug: "hdfc-bank", name: "HDFC Bank", ats: "custom", token: "https://hdfcbank.ripplehire.com/candidate/?token=pvB5iAMcmu4ydUh2IW2O", tags: ["bank"], indiaPresence: true, priority: 1 }`

Other RippleHire tenants probed and not built: indusind.ripplehire.com (1 job) and rblbank.ripplehire.com (2 jobs) —
vestigial, not linked from those banks' career pages.
