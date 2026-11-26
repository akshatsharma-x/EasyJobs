# Extra candidates surveyed by fork E (2026-11-26) — not built

Built: `axis-bank`, `hdfc-bank` (RippleHire, shared `_ripplehire.ts`), `ntt-data` (Phenom), `tata-elxsi` (CMS HTML).
Registry-only (plain boards, verified): deutsche-bank (Workday), barclays (Workday), hsbc (Eightfold v2),
nagarro / swiggy / phonepe (SmartRecruiters), paytm / meesho / cred (Lever), groww (Greenhouse) — see their files.

| Candidate | Finding | Decision |
|---|---|---|
| Coforge (careers.coforge.com → Zwayam) | `POST public.zwayam.com/jobs/search` (143 jobs, 89 India) — but Zwayam's Akamai edge drops requests carrying our bot UA (0 bytes / timeout) while answering a browser UA | skip — UA-based bot block |
| Cyient (careers.cyient.com/cyient/, Zwayam path) | connection fails from here | skip |
| ICICI Bank (careers.icici.bank.in/CareerApplicant) | obfuscated React bundle with a devtools guard and AES-GCM-keyed API payloads (`REACT_APP_WEB_CAREER_KEY_GCM`) | skip — anti-reverse-engineering |
| Jio (careers.jio.com) | robots allows `/`; ~30k listings (mostly freelance sales); lists are paged via ASP.NET WebForms postbacks (`__VIEWSTATE`/`__EVENTVALIDATION`) | skip — form-state postbacks, fragile |
| L&T (larsentoubrocareers.peoplestrong.com) | PeopleStrong portal; anonymous `cp/session` returns "Session Expired", job list needs a session | skip — session-gated |
| upGrad (recruit.upgrad.com) | robots.txt `Disallow: /` | skip |
| Ola (olacabs.com/careers → TurboHire) | TurboHire robots allows only Googlebot (same as Flipkart) | skip |
| IndusInd / RBL Bank (RippleHire) | tenants exist but hold 1 and 2 jobs, not linked from the banks' career pages | skip |
| KPMG India, Zensar, Hexaware, Dell | Oracle Recruiting Cloud | registry candidates (not verified here) |
| Samsung India | Workday reference only | not pursued |
| Siemens (jobs.siemens.com) | unreachable from here | skip |
| Virtusa, KPIT | no job portal found from the careers page / CAPTCHA reference | not pursued |
