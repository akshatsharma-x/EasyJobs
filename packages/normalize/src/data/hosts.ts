/**
 * Host lists used by fingerprinting (prompts.md §0.4 rule 1) and domain/logo derivation.
 * Matching is by registrable suffix: "in.linkedin.com" matches "linkedin.com".
 */

/** ATS platforms. A company's board on these hosts IS the official posting (but the host is not the company's domain). */
export const ATS_HOSTS: readonly string[] = [
  "greenhouse.io", "lever.co", "ashbyhq.com", "smartrecruiters.com", "workable.com", "myworkdayjobs.com",
  "myworkdaysite.com", "oraclecloud.com", "taleo.net", "eightfold.ai", "icims.com", "successfactors.com",
  "successfactors.eu", "sapsf.com", "sapsf.eu", "jobvite.com", "recruitee.com", "bamboohr.com", "breezy.hr",
  "teamtailor.com", "personio.de", "personio.com", "zohorecruit.com", "zohorecruit.in", "zohorecruit.eu", "keka.com",
  "darwinbox.in", "darwinbox.com", "freshteam.com", "phenompeople.com", "avature.net", "ultipro.com",
  "workforcenow.adp.com", "recruiting.adp.com", "paylocity.com", "applytojob.com", "jazzhr.com", "pinpointhq.com",
  "comeet.com", "comeet.co", "homerun.co", "rippling.com", "rippling-ats.com", "brassring.com", "kenexa.com",
  "hirequotient.com", "springrecruit.com", "turbohire.co", "mynexthire.com", "superset.com", "ripplehire.com",
  "zwayam.com", "skillate.com", "talentrecruit.com", "kula.ai", "gem.com", "dover.com", "polymer.co", "manatal.com",
];

/** Aggregators and job boards: never the official source (§0.4 rule 2). */
export const JOB_BOARD_HOSTS: readonly string[] = [
  "linkedin.com", "naukri.com", "naukrigulf.com", "indeed.com", "indeed.co.in", "glassdoor.com", "glassdoor.co.in",
  "monster.com", "monsterindia.com", "foundit.in", "foundit.sg", "shine.com", "timesjobs.com", "internshala.com",
  "unstop.com", "dare2compete.com", "coursejoiner.com", "freshersworld.com", "freshersnow.com", "fresherslive.com",
  "freshershunt.in", "freshersvoice.com", "fresherscamp.com", "offcampusjobs4u.com", "studentscircles.com",
  "freejobalert.com", "sarkariresult.com", "jobsarkari.com", "instahyre.com", "hirist.com", "hirist.tech",
  "iimjobs.com", "cutshort.io", "wellfound.com", "angel.co", "apna.co", "workindia.in", "quikr.com", "olx.in",
  "ziprecruiter.com", "simplyhired.com", "simplyhired.co.in", "careerbuilder.com", "dice.com", "adzuna.com",
  "adzuna.in", "adzuna.co.uk", "jooble.org", "remoteok.com", "remoteok.io", "weworkremotely.com", "remotive.com",
  "remotive.io", "himalayas.app", "arbeitnow.com", "jobicy.com", "workingnomads.com", "remote.co", "flexjobs.com",
  "workatastartup.com", "ycombinator.com", "hackerearth.com", "hackerrank.com", "techgig.com", "talentrack.in",
  "jobhai.com", "placementindia.com", "jobrapido.com", "careerjet.co.in", "careerjet.com", "jobsora.com",
  "talent.com", "neuvoo.com", "whatjobs.com", "jora.com", "jobstreet.com", "seek.com.au", "reed.co.uk",
  "totaljobs.com", "stepstone.de", "xing.com", "builtin.com", "otta.com", "welcometothejungle.com", "hired.com",
  "levels.fyi", "herkey.com", "jobsforher.com", "geeksforgeeks.org", "jobsearcher.com", "jobgether.com",
  "recruit.net", "bebee.com", "jobleads.com", "trabajo.org", "learn4good.com", "freshersrecruitment.co.in",
  "jobfound.org", "careerpower.in", "recruitmentindia.in", "talentd.in", "fresheropenings.com", "itjobsfreshers.com",
];

/** Shorteners, messaging, social, forms and file hosts: neither official nor a stable job key. */
export const NON_OFFICIAL_HOSTS: readonly string[] = [
  "bit.ly", "tinyurl.com", "rb.gy", "cutt.ly", "shorturl.at", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "tiny.cc", "lnkd.in", "rebrand.ly", "shorte.st", "linktr.ee", "t.me", "telegram.me", "telegram.org", "wa.me",
  "whatsapp.com", "facebook.com", "fb.com", "fb.me", "instagram.com", "twitter.com", "x.com", "youtube.com",
  "youtu.be", "forms.gle", "docs.google.com", "drive.google.com", "sites.google.com", "typeform.com", "jotform.com",
  "airtable.com", "forms.office.com", "forms.microsoft.com", "dropbox.com", "medium.com", "blogspot.com",
  "wixsite.com",
];

/** Multi-label public suffixes we care about, for registrable-domain extraction. */
export const MULTI_LABEL_SUFFIXES: ReadonlySet<string> = new Set([
  "co.in", "org.in", "net.in", "gov.in", "ac.in", "edu.in", "res.in", "firm.in", "gen.in", "ind.in", "nic.in",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "co.kr", "com.sg",
  "com.my", "com.br", "com.mx", "com.ar", "com.cn", "com.hk", "com.tw", "co.za", "com.tr", "com.eg", "com.sa",
  "com.pk", "com.bd", "com.np", "co.id", "com.ph", "com.vn", "co.th", "co.il", "com.co", "com.pe",
]);
