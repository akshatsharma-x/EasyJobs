/** Link classification: ATS/careers hosts, shorteners, and links we must never treat as apply URLs. */

const ATS_HOSTS: readonly RegExp[] = [
  /(^|\.)greenhouse\.io$/, /(^|\.)lever\.co$/, /(^|\.)ashbyhq\.com$/, /(^|\.)smartrecruiters\.com$/,
  /(^|\.)workable\.com$/, /(^|\.)recruitee\.com$/, /(^|\.)bamboohr\.com$/, /(^|\.)breezy\.hr$/,
  /(^|\.)teamtailor\.com$/, /(^|\.)jobs\.personio\.(de|com)$/, /(^|\.)myworkdayjobs\.com$/, /(^|\.)myworkdaysite\.com$/,
  /(^|\.)oraclecloud\.com$/, /(^|\.)successfactors\.(com|eu)$/, /(^|\.)eightfold\.ai$/, /(^|\.)icims\.com$/,
  /(^|\.)avature\.net$/, /(^|\.)taleo\.net$/, /(^|\.)zohorecruit\.(com|in|eu)$/, /(^|\.)keka\.com$/,
  /(^|\.)darwinbox\.(in|com)$/, /(^|\.)freshteam\.com$/, /(^|\.)jobvite\.com$/, /^ats\.rippling\.com$/,
  /^jobs\.gem\.com$/, /(^|\.)pinpointhq\.com$/, /(^|\.)homerun\.co$/, /(^|\.)applytojob\.com$/,
  /(^|\.)jazzhr\.com$/, /(^|\.)recruiting\.paylocity\.com$/, /(^|\.)workforcenow\.adp\.com$/, /^myjobs\.adp\.com$/,
  /(^|\.)ultipro\.com$/, /(^|\.)ukg\.net$/, /(^|\.)paycomonline\.net$/, /^app\.dover\.com$/, /(^|\.)comeet\.com$/,
  /(^|\.)trakstar\.com$/, /(^|\.)polymer\.co$/, /(^|\.)join\.com$/, /(^|\.)welcomekit\.co$/, /(^|\.)jobylon\.com$/,
  /(^|\.)traffit\.com$/, /(^|\.)hirehive\.com$/, /(^|\.)manatal\.com$/, /(^|\.)careers-page\.com$/,
];

const SHORTENER_HOSTS = new Set([
  "bit.ly", "t.co", "tinyurl.com", "lnkd.in", "buff.ly", "ow.ly", "goo.gl", "rebrand.ly", "hubs.ly", "hubs.la",
  "shorturl.at", "rb.gy", "cutt.ly", "is.gd", "t.ly", "s.id", "tiny.cc", "trib.al", "dub.sh", "grnh.se", "lever.to",
]);

/** Application forms: legitimate apply links, but not company domains. */
const FORM_HOSTS: readonly RegExp[] = [
  /^forms\.gle$/, /^docs\.google\.com$/, /(^|\.)typeform\.com$/, /^tally\.so$/, /(^|\.)airtable\.com$/,
  /(^|\.)jotform\.com$/, /^forms\.office\.com$/, /(^|\.)notion\.site$/, /(^|\.)notion\.so$/,
];

/** Never apply links: discussion threads, social profiles, code, papers, media. */
const EXCLUDED_HOSTS: readonly RegExp[] = [
  /^news\.ycombinator\.com$/, /^hn\.algolia\.com$/, /(^|\.)github\.com$/, /(^|\.)gitlab\.com$/, /(^|\.)arxiv\.org$/, /(^|\.)youtube\.com$/,
  /^youtu\.be$/, /(^|\.)twitter\.com$/, /^x\.com$/, /(^|\.)facebook\.com$/, /(^|\.)instagram\.com$/,
  /(^|\.)medium\.com$/, /(^|\.)substack\.com$/, /(^|\.)wikipedia\.org$/, /(^|\.)crunchbase\.com$/,
  /(^|\.)techcrunch\.com$/, /(^|\.)bloomberg\.com$/, /(^|\.)nytimes\.com$/, /(^|\.)calendly\.com$/,
  /(^|\.)cal\.com$/, /(^|\.)loom\.com$/, /(^|\.)vimeo\.com$/, /(^|\.)apps\.apple\.com$/, /^play\.google\.com$/,
];

/** Job boards / aggregators: a valid apply link, but not "official". */
const BOARD_HOSTS: readonly RegExp[] = [
  /(^|\.)linkedin\.com$/, /(^|\.)wellfound\.com$/, /(^|\.)angel\.co$/, /(^|\.)workatastartup\.com$/,
  /(^|\.)indeed\.com$/, /(^|\.)glassdoor\.com$/, /(^|\.)welcometothejungle\.com$/, /(^|\.)otta\.com$/,
  /(^|\.)builtin\.com$/, /(^|\.)remoteok\.com$/, /(^|\.)weworkremotely\.com$/, /(^|\.)remotive\.com$/,
  /(^|\.)himalayas\.app$/, /(^|\.)jobicy\.com$/, /(^|\.)arbeitnow\.com$/, /(^|\.)naukri\.com$/,
  /(^|\.)internshala\.com$/, /(^|\.)unstop\.com$/, /(^|\.)adzuna\.[a-z.]+$/, /(^|\.)jooble\.org$/,
  /(^|\.)themuse\.com$/, /(^|\.)hired\.com$/, /(^|\.)dice\.com$/, /(^|\.)ycombinator\.com$/,
];

const CAREERS_PATH_RE =
  /\/(careers?|jobs?|join(-us|-the-team)?|work-with-us|work-at|hiring|positions|openings|open-roles|vacanc(y|ies)|opportunities|apply)(\/|$|\?|#|\.html?)/i;
const CAREERS_HOST_RE = /^(careers?|jobs|apply|join|work|hiring|talent)\./i;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const anyMatch = (host: string, list: readonly RegExp[]): boolean => list.some((re) => re.test(host));

export const isAtsUrl = (url: string): boolean => {
  const h = hostOf(url);
  return h !== null && anyMatch(h, ATS_HOSTS);
};
export const isShortenerUrl = (url: string): boolean => {
  const h = hostOf(url);
  return h !== null && SHORTENER_HOSTS.has(h);
};
export const isFormUrl = (url: string): boolean => {
  const h = hostOf(url);
  return h !== null && anyMatch(h, FORM_HOSTS);
};
export const isExcludedUrl = (url: string): boolean => {
  const h = hostOf(url);
  return h === null || anyMatch(h, EXCLUDED_HOSTS);
};
export const isBoardUrl = (url: string): boolean => {
  const h = hostOf(url);
  return h !== null && anyMatch(h, BOARD_HOSTS);
};
export const isCareersUrl = (url: string): boolean => {
  const h = hostOf(url);
  if (h === null) return false;
  try {
    return CAREERS_HOST_RE.test(h) || CAREERS_PATH_RE.test(new URL(url).pathname + "/");
  } catch {
    return false;
  }
};

/**
 * How good a link is as an apply URL: ATS 10 · careers page 8 · shortener 6 (resolved later) · form 5 ·
 * board 4 · company page 3 · excluded -1.
 */
/** Personal profiles/posts (LinkedIn /in/, /posts/, /pub/): personal data, never an apply link. */
const PERSONAL_PATH_RE = /^https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:in|pub|posts|feed)\//i;

export function applyLinkScore(url: string): number {
  if (!/^https?:\/\//i.test(url) || isExcludedUrl(url) || PERSONAL_PATH_RE.test(url)) return -1;
  if (isAtsUrl(url)) return 10;
  if (isShortenerUrl(url)) return 6;
  if (isFormUrl(url)) return 5;
  if (isBoardUrl(url)) return 4;
  if (isCareersUrl(url)) return 8;
  return 3;
}

const MULTI_PART_SUFFIXES = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "ltd", "plc"]);

/** Registrable-ish domain of a company website ("careers.acme.co.uk" → "acme.co.uk"); null for ATS/boards/forms. */
export function companyDomainOf(url: string): string | null {
  if (applyLinkScore(url) < 0 || isAtsUrl(url) || isBoardUrl(url) || isFormUrl(url) || isShortenerUrl(url)) return null;
  const host = hostOf(url);
  if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const tld = labels[labels.length - 1] ?? "";
  const second = labels[labels.length - 2] ?? "";
  const take = tld.length === 2 && MULTI_PART_SUFFIXES.has(second) ? 3 : 2;
  return labels.slice(-take).join(".");
}
