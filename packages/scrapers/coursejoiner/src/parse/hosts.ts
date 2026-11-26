/** Host classification for outbound links found in job posts. */
import { hostMatches, parseUrl, registrableDomain } from "../util/url";

export type LinkKind =
  | "ats" | "company" | "job_board" | "form" | "shortener" | "pdf" | "other"
  | "social" | "messaging" | "maps" | "app_store" | "asset" | "blog" | "self" | "search";

/** Kinds that can never be an apply link. */
export const REJECTED_KINDS: ReadonlySet<LinkKind> = new Set(["social", "messaging", "maps", "app_store", "asset", "blog", "self", "search"]);

/** Applicant-tracking systems and campus-hiring platforms (company-run postings → "official"). */
export const ATS_DOMAINS = [
  "greenhouse.io", "lever.co", "ashbyhq.com", "smartrecruiters.com", "workable.com", "recruitee.com", "bamboohr.com",
  "personio.de", "personio.com", "breezy.hr", "teamtailor.com", "myworkdayjobs.com", "myworkdaysite.com", "myworkday.com",
  "taleo.net", "successfactors.com", "successfactors.eu", "sapsf.com", "sapsf.eu", "eightfold.ai", "phenompeople.com",
  "icims.com", "avature.net", "zohorecruit.com", "zohorecruit.in", "keka.com", "darwinbox.in", "darwinbox.com",
  "freshteam.com", "jobvite.com", "applytojob.com", "jazzhr.com", "ultipro.com", "workforcenow.adp.com", "myjobs.adp.com",
  "paylocity.com", "paycomonline.net", "njoyn.com", "joinsuperset.com", "zimyo.work", "zimyo.com", "turbohire.co",
  "recruitcrm.io", "ceipal.com", "jobdiva.com", "pinpointhq.com", "ats.rippling.com", "jobs.gem.com", "trakstar.com",
  "csod.com", "brassring.com", "kenexa.com", "dayforcehcm.com", "ripplehire.com", "peoplestrong.com", "hire.withgoogle.com",
  "careers-page.com", "recooty.com", "manatal.com", "skillate.com", "talentrecruit.com", "hirequotient.com", "springworks.in",
  "freshworks.com/hrms", "kula.ai", "jobs.workable.com", "apply.workable.com", "fountain.com", "oorwin.com", "hirist.ats",
];

/** Oracle HCM is only an ATS on its CandidateExperience paths. */
function isOracleHcm(u: URL): boolean {
  return hostMatches(u.hostname, "oraclecloud.com") && /\/hcmui\/candidateexperience\//i.test(u.pathname);
}

export const JOB_BOARD_DOMAINS = [
  "naukri.com", "indeed.com", "indeed.co.in", "glassdoor.com", "glassdoor.co.in", "foundit.in", "monsterindia.com",
  "shine.com", "timesjobs.com", "internshala.com", "unstop.com", "apna.co", "instahyre.com", "cutshort.io", "wellfound.com",
  "angel.co", "iimjobs.com", "hirist.tech", "hirist.com", "freshersworld.com", "workindia.in", "hirect.in", "jobhai.com",
  "simplyhired.com", "ziprecruiter.com", "monster.com", "careerbuilder.com", "letsintern.com", "twenty19.com",
  "hackerearth.com", "hackerrank.com", "weekday.works", "uplers.com", "naukrigulf.com", "jobsforher.com", "herkey.com",
  "dare2compete.com", "updazz.com", "wellfound.co",
];

export const FORM_DOMAINS = [
  "forms.gle", "forms.office.com", "forms.microsoft.com", "typeform.com", "jotform.com", "airtable.com", "forms.zohopublic.in",
  "forms.zohopublic.com", "zfrmz.in", "zfrmz.com", "tally.so", "surveymonkey.com", "formfacade.com", "forms.app",
];

export const SHORTENER_DOMAINS = [
  "bit.ly", "bitly.com", "tinyurl.com", "t.co", "goo.gl", "rb.gy", "cutt.ly", "shorturl.at", "is.gd", "ow.ly", "buff.ly",
  "lnkd.in", "rebrand.ly", "tiny.cc", "s.id", "v.gd", "t.ly", "surl.li", "bl.ink", "short.io", "shorturl.asia", "amzn.to",
  "dlvr.it", "trib.al", "u.to", "tny.im", "shrtco.de", "rebrandly.com", "bitly.ws", "short.gy", "tinu.be", "urlz.fr",
];

const SOCIAL_DOMAINS = [
  "facebook.com", "fb.com", "fb.me", "instagram.com", "twitter.com", "x.com", "youtube.com", "youtu.be", "pinterest.com",
  "pinterest.in", "reddit.com", "quora.com", "threads.net", "tiktok.com", "snapchat.com", "tumblr.com", "linktr.ee",
  "koo.in", "sharechat.com/profile", "moj.app",
];
const MESSAGING_DOMAINS = ["t.me", "telegram.me", "telegram.dog", "telegram.org", "wa.me", "whatsapp.com", "discord.gg", "discord.com", "signal.group"];
const APP_STORE_DOMAINS = ["play.google.com", "apps.apple.com", "itunes.apple.com"];

/** Other job blogs, news and education portals — never an apply link (unless the company itself is that site). */
export const BLOG_DOMAINS = [
  "coursejoiner.com", "freshershunt.in", "fresheroffcampus.com", "kickcharm.com", "offcampusjobs4u.com", "freshersnow.com",
  "freshersvoice.com", "studentscircles.com", "freshercareers.in", "freshersgold.com", "jobskar.com", "fresherslive.com",
  "freejobalert.com", "sarkariresult.com", "sarkarinaukri.com", "careerpower.in", "adda247.com", "testbook.com",
  "jagranjosh.com", "shiksha.com", "collegedunia.com", "careers360.com", "prepinsta.com", "geeksforgeeks.org",
  "javatpoint.com", "talentbattle.in", "blogspot.com", "wordpress.com", "medium.com", "substack.com", "indiatoday.in",
  "timesofindia.indiatimes.com", "hindustantimes.com", "livemint.com", "economictimes.indiatimes.com", "moneycontrol.com",
  "news18.com", "business-standard.com", "thehindu.com", "financialexpress.com", "zeebiz.com", "ndtv.com", "wikipedia.org",
  "freshersopenings.in", "jobsforfreshers.in", "naukrinama.com", "studentsdrive.in", "kalvimalar.com", "examsdaily.in",
  "recruitmentresult.com", "govtjobsblog.in", "placementstore.com", "offcampusdrive.in", "freshersworld.in",
  "jobsinternships.in", "internshipwala.com", "coursera.org", "udemy.com", "edx.org", "skillindiadigital.gov.in",
];

const ASSET_EXT = /\.(?:jpe?g|png|gif|webp|svg|bmp|ico|mp4|mp3|zip|rar|css|js)$/i;

export interface HostClassifierOptions {
  /** Host of the blog being scraped (internal links). */
  selfHost: string;
  /** Additional blog hosts to reject. */
  extraBlogHosts?: string[];
}

function inList(host: string, list: readonly string[]): boolean {
  return list.some((d) => (d.includes("/") ? false : hostMatches(host, d)));
}

function pathListMatch(u: URL, list: readonly string[]): boolean {
  return list.some((d) => {
    if (!d.includes("/")) return false;
    const [h, ...p] = d.split("/");
    return hostMatches(u.hostname, h ?? "") && u.pathname.toLowerCase().startsWith(`/${p.join("/")}`);
  });
}

export function classifyUrl(url: string, opts: HostClassifierOptions): LinkKind {
  const u = parseUrl(url);
  if (!u) return "asset";
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  if (hostMatches(host, opts.selfHost) || (opts.extraBlogHosts ?? []).some((h) => hostMatches(host, h))) return "self";
  if (ASSET_EXT.test(path) || /\/wp-content\/uploads\//.test(path)) return "asset";
  if (/(^|\.)google\.[a-z.]+$/.test(host)) {
    if (path.startsWith("/maps") || host.startsWith("maps.")) return "maps";
    if (path.startsWith("/search") || path === "/url") return "search";
    if (host === "docs.google.com" && path.startsWith("/forms")) return "form";
    if (host === "sites.google.com" || host === "docs.google.com" || host === "drive.google.com") return "other";
    if (host === "careers.google.com" || (host.endsWith("google.com") && path.startsWith("/about/careers"))) return "company";
    return "other";
  }
  if (host === "share.google" || host === "maps.app.goo.gl" || (host === "goo.gl" && path.startsWith("/maps"))) return "maps";
  if (inList(host, MESSAGING_DOMAINS)) return "messaging";
  if (inList(host, APP_STORE_DOMAINS)) return "app_store";
  if (hostMatches(host, "linkedin.com")) return /^\/jobs\/(view|collections|search)/.test(path) || path.startsWith("/jobs/") ? "job_board" : "social";
  if (inList(host, SOCIAL_DOMAINS) || pathListMatch(u, SOCIAL_DOMAINS)) return "social";
  if (inList(host, SHORTENER_DOMAINS)) return "shortener";
  if (inList(host, FORM_DOMAINS)) return "form";
  if (inList(host, ATS_DOMAINS) || pathListMatch(u, ATS_DOMAINS) || isOracleHcm(u)) return "ats";
  if (inList(host, JOB_BOARD_DOMAINS)) return "job_board";
  if (inList(host, BLOG_DOMAINS)) return "blog";
  if (path.endsWith(".pdf")) return "pdf";
  return "other";
}

/** Labels of host + path that may name the company (for ATS tenants and job-board slugs). */
export function urlNameTokens(url: string): string[] {
  const u = parseUrl(url);
  if (!u) return [];
  const generic = /^(www\d?|jobs?|careers?|apply|boards?|job-boards|en|in|us|global|wd\d+|hcm|hcmui|recruiting|talent|hire|work|join|portal|my|app|external|ext|ext\d|fa|ocs|candidateexperience|sites|site|requisitions?|preview|detail|details|search|com|co|org|net|io|ai|ats|myworkdayjobs|myworkdaysite|greenhouse|lever|ashbyhq|smartrecruiters|workable|recruitee|bamboohr|personio|breezy|teamtailor|taleo|successfactors|icims|avature|zohorecruit|keka|darwinbox|freshteam|jobvite|njoyn|joinsuperset|superset|zimyo|oraclecloud|eightfold|phenompeople|company|corp|xweb|en-us|en_us|en-gb|jobdetail|jobdesc|listing|listings|job-listings|view|position|positions|opening|openings|roles?)$/;
  const hostLabels = u.hostname.toLowerCase().split(".").slice(0, -1);
  const pathSegs = u.pathname.split("/").map((s) => decodeURIComponent(s).toLowerCase()).slice(0, 6);
  const tokens = [...hostLabels, ...pathSegs].flatMap((s) => s.split(/[^a-z0-9]+/)).filter((s) => s.length >= 2 && !generic.test(s) && !/^\d+$/.test(s));
  return [...new Set(tokens)];
}

export function registrableOf(url: string): string {
  const u = parseUrl(url);
  return u ? registrableDomain(u.hostname) : "";
}
