# Meta — `meta` (disabled)

**Status: disabled permanently** (`isEnabled` → false, `disabledReason` set). The module makes no
requests even if `scrape()` is called directly (covered by `test/meta.test.ts`).

Reasons:

1. **Terms.** `https://www.metacareers.com/robots.txt` begins with:

   > Notice: Collection of data on Facebook through automated means is prohibited unless you have
   > express written permission from Facebook and may only be conducted for the limited purpose
   > contained in said permission. See: http://www.facebook.com/apps/site_scraping_tos_terms.php

2. **Anti-bot tokens.** The job search is a GraphQL endpoint that needs per-session `lsd` / `fb_dtsg`
   tokens harvested from the page — exactly what §0.8 forbids working around.

Nothing beyond robots.txt (read during P09 triage) was fetched from metacareers.com.

Not a registry candidate: Meta doesn't publish its jobs on a public Greenhouse/Lever/Workday/Oracle/
Eightfold board. Revisit only with written permission or if Meta publishes an official public feed.
