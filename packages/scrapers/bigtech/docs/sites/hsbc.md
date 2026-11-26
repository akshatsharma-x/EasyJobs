# HSBC — registry (extra; no scraper here)

portal.careers.hsbc.com is a plain Eightfold board; the classic v2 API works with our bot UA:
`GET https://portal.careers.hsbc.com/api/apply/v2/jobs?domain=hsbc.com&num=10&start=0&location=India` → count 189
(2026-11-26), e.g. "Head of Wealth Risk, IWPB, HSBC-India — Mumbai, Maharashtra, India".

**For the registry:** `{ slug: "hsbc", name: "HSBC", domain: "hsbc.com", ats: "eightfold",
token: "https://portal.careers.hsbc.com|hsbc.com", careersUrl: "https://portal.careers.hsbc.com/careers",
tags: ["mnc", "bank", "gcc"], indiaPresence: true, priority: 1 }`
