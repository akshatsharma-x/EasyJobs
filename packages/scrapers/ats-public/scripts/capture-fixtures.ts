/**
 * Captures small, real API fixtures for the parser tests:  pnpm --filter @easyjobs/scraper-ats-public fixtures
 *
 * Fetches each board once through the polite contract HttpClient (responses cached in .cache/fixtures/,
 * delete it to refresh), picks postings that cover the edge cases we test (remote-only, multi-location,
 * salary present/absent, internships, …), trims long descriptions and writes test/fixtures/<ats>/*.
 * test/fixtures/manifest.json records which posting id covers which case.
 *
 * Re-capturing changes the data, so expectations in test/*.test.ts may need updating afterwards.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpClient, createLogger } from "@easyjobs/contract/node";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "fixtures");
const OUT = join(ROOT, "test", "fixtures");
const log = createLogger("fixtures");
const http = createHttpClient({ log, perHostConcurrency: 1, perHostDelayMs: 1000 });

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw third-party payloads

async function fetchCached(url: string, opts: { robots?: boolean; accept?: string } = {}): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${createHash("sha1").update(url).digest("hex").slice(0, 16)}.txt`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  log.info(`GET ${url}`);
  const res = await http.fetch(url, { robots: opts.robots ?? false, headers: opts.accept ? { accept: opts.accept } : {} });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  writeFileSync(file, body);
  return body;
}

const json = async (url: string, robots = false): Promise<Json> => JSON.parse(await fetchCached(url, { robots, accept: "application/json" }));

/** Cuts HTML (raw or entity-escaped) at a closing block tag near `max` chars, so fixtures stay small. */
function trimHtml(html: unknown, max = 900): unknown {
  if (typeof html !== "string" || html.length <= max) return html;
  const re = /(<\/(p|li|ul|ol|div|h[1-6])>|&lt;\/(p|li|ul|ol|div|h[1-6])&gt;)/gi;
  let cut = -1;
  for (const m of html.matchAll(re)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end > max) break;
    cut = end;
  }
  return cut > 0 ? html.slice(0, cut) : html.slice(0, max);
}

const manifest: Record<string, Record<string, string>> = {};
function note(ats: string, kase: string, id: unknown): void {
  if (id === undefined || id === null) {
    log.warn(`${ats}: no posting found for case "${kase}"`);
    return;
  }
  (manifest[ats] ??= {})[kase] = String(id);
}

function write(ats: string, file: string, data: unknown): void {
  const path = join(OUT, ats, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`);
  log.info(`wrote test/fixtures/${ats}/${file}`);
}

/** First item matching each predicate (in order), de-duplicated by id. */
function pick<T>(items: T[], idOf: (t: T) => unknown, preds: [string, (t: T) => boolean][], ats: string): T[] {
  const chosen = new Map<string, T>();
  for (const [kase, pred] of preds) {
    const hit = items.find(pred);
    note(ats, kase, hit ? idOf(hit) : undefined);
    if (hit) chosen.set(String(idOf(hit)), hit);
  }
  return [...chosen.values()];
}

/* ───────────── Greenhouse ───────────── */
async function greenhouse(): Promise<void> {
  const url = (t: string): string => `https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true&pay_transparency=true`;
  const trimJob = (j: Json): Json => ({ ...j, content: trimHtml(j.content) });
  const range = (j: Json): Json[] => j.pay_input_ranges ?? [];
  const meta = (j: Json, name: string): string => String((j.metadata ?? []).find((m: Json) => m.name === name)?.value ?? "");

  const groww = await json(url("groww"));
  const growwJobs = pick(groww.jobs, (j: Json) => j.id, [["india", (j) => /India/.test(j.location?.name ?? "")]], "greenhouse");
  write("greenhouse", "groww.json", { jobs: growwJobs.map(trimJob), meta: { total: growwJobs.length } });

  const mongo = await json(url("mongodb"));
  const mongoJobs = pick(
    mongo.jobs,
    (j: Json) => j.id,
    [
      ["metadataIntern", (j) => meta(j, "Employment Type") === "Intern"],
      ["placeholderPay", (j) => range(j).some((r: Json) => r.max_cents === 1)],
      ["metadataRemote", (j) => /Fully Remote/.test(meta(j, "Working Model Eligibility")) && !/In Office/.test(meta(j, "Working Model Eligibility"))],
      ["metadataContract", (j) => meta(j, "Employment Type") === "Contract"],
    ],
    "greenhouse",
  );
  write("greenhouse", "mongodb.json", { jobs: mongoJobs.map(trimJob), meta: { total: mongoJobs.length } });

  const airbnb = await json(url("airbnb"));
  const airbnbJobs = pick(
    airbnb.jobs,
    (j: Json) => j.id,
    [
      ["inrPay", (j) => range(j).some((r: Json) => r.currency_type === "INR")],
      ["monthlyPay", (j) => range(j).some((r: Json) => /Monthly/.test(r.title ?? ""))],
      ["multiZonePay", (j) => range(j).length > 2 && range(j).every((r: Json) => r.currency_type === "USD")],
      ["noPay", (j) => range(j).length === 0],
    ],
    "greenhouse",
  );
  write("greenhouse", "airbnb.json", { jobs: airbnbJobs.map(trimJob), meta: { total: airbnbJobs.length } });

  const rubrik = await json(url("rubrik"));
  const rubrikJobs = pick(
    rubrik.jobs,
    (j: Json) => j.id,
    [
      ["multiOffice", (j) => (j.offices ?? []).length > 2],
      ["indiaRubrik", (j) => /India|Bengaluru|Bangalore/.test(j.location?.name ?? "")],
    ],
    "greenhouse",
  );
  write("greenhouse", "rubrik.json", { jobs: rubrikJobs.map(trimJob), meta: { total: rubrikJobs.length } });

  const databricks = await json(url("databricks"));
  const dbJobs = pick(
    databricks.jobs,
    (j: Json) => j.id,
    [
      ["semicolonLocations", (j) => /;/.test(j.location?.name ?? "") && range(j).length > 0],
      ["indiaNoPay", (j) => /India|Bengaluru|Bangalore/.test(j.location?.name ?? "") && range(j).length === 0],
    ],
    "greenhouse",
  );
  write("greenhouse", "databricks.json", { jobs: dbJobs.map(trimJob), meta: { total: dbJobs.length } });
}

/* ───────────── Lever ───────────── */
async function lever(): Promise<void> {
  const url = (site: string, eu = false): string => `https://api${eu ? ".eu" : ""}.lever.co/v0/postings/${site}?mode=json&limit=100&skip=0`;
  const trim = (p: Json): Json => ({
    ...p,
    description: trimHtml(p.description, 700),
    descriptionPlain: typeof p.descriptionPlain === "string" ? p.descriptionPlain.slice(0, 500) : p.descriptionPlain,
    descriptionBody: trimHtml(p.descriptionBody, 400),
    descriptionBodyPlain: typeof p.descriptionBodyPlain === "string" ? p.descriptionBodyPlain.slice(0, 300) : p.descriptionBodyPlain,
    opening: trimHtml(p.opening, 300),
    openingPlain: typeof p.openingPlain === "string" ? p.openingPlain.slice(0, 300) : p.openingPlain,
    additional: trimHtml(p.additional, 400),
    additionalPlain: typeof p.additionalPlain === "string" ? p.additionalPlain.slice(0, 300) : p.additionalPlain,
    lists: (p.lists ?? []).slice(0, 2).map((l: Json) => ({ ...l, content: trimHtml(l.content, 400) })),
  });
  const paytm = await json(url("paytm"));
  const paytmPicks = pick(
    paytm,
    (p: Json) => p.id,
    [
      ["intern", (p) => /intern/i.test(p.categories?.commitment ?? "")],
      ["multiLocation", (p) => (p.categories?.allLocations ?? []).length > 1],
      ["zeroSalary", (p) => p.salaryRange && p.salaryRange.max === 0],
      ["onRoll", (p) => /on-roll/i.test(p.categories?.commitment ?? "")],
    ],
    "lever",
  );
  write("lever", "paytm.json", paytmPicks.map(trim));
  const spotify = await json(url("spotify"));
  const spotifyPicks = pick(
    spotify,
    (p: Json) => p.id,
    [
      ["salary", (p) => p.salaryRange && p.salaryRange.max > 0],
      ["remote", (p) => p.workplaceType === "remote"],
    ],
    "lever",
  );
  write("lever", "spotify.json", spotifyPicks.map(trim));
  const creatio = await json(url("creatio", true));
  const creatioPicks = pick(creatio, (p: Json) => p.id, [["eu", () => true]], "lever");
  write("lever", "creatio-eu.json", creatioPicks.map(trim));
}

/* ───────────── Ashby ───────────── */
async function ashby(): Promise<void> {
  const url = (t: string): string => `https://api.ashbyhq.com/posting-api/job-board/${t}?includeCompensation=true`;
  const trim = (j: Json): Json => ({
    ...j,
    descriptionHtml: trimHtml(j.descriptionHtml, 600),
    descriptionPlain: typeof j.descriptionPlain === "string" ? j.descriptionPlain.slice(0, 400) : j.descriptionPlain,
  });
  const comps = (j: Json): Json[] => j.compensation?.summaryComponents ?? [];
  const sarvam = await json(url("sarvam"));
  const sarvamJobs = pick(sarvam.jobs, (j: Json) => j.id, [["indiaOnsite", (j) => j.workplaceType === "OnSite"], ["intern", (j) => j.employmentType === "Intern"]], "ashby");
  write("ashby", "sarvam.json", { apiVersion: sarvam.apiVersion, jobs: sarvamJobs.map(trim) });
  const ramp = await json(url("ramp"));
  const rampJobs = pick(
    ramp.jobs,
    (j: Json) => j.id,
    [
      ["hybridWithRemoteSecondary", (j) => j.workplaceType === "Hybrid" && (j.secondaryLocations ?? []).some((s: Json) => /remote/i.test(s.location ?? ""))],
      ["monthlyInternPay", (j) => comps(j).some((c: Json) => c.compensationType === "Salary" && c.interval === "1 MONTH")],
      ["remoteOnly", (j) => j.workplaceType === "Remote"],
    ],
    "ashby",
  );
  write("ashby", "ramp.json", { apiVersion: ramp.apiVersion, jobs: rampJobs.map(trim) });
  const harvey = await json(url("harvey"));
  const harveyJobs = pick(
    harvey.jobs,
    (j: Json) => j.id,
    [["hourlyZeroMin", (j) => comps(j).some((c: Json) => c.compensationType === "Salary" && c.interval === "1 HOUR" && c.minValue === 0)]],
    "ashby",
  );
  write("ashby", "harvey.json", { apiVersion: harvey.apiVersion, jobs: harveyJobs.map(trim) });
}

/* ───────────── SmartRecruiters ───────────── */
async function smartrecruiters(): Promise<void> {
  const list = (c: string): string => `https://api.smartrecruiters.com/v1/companies/${c}/postings?limit=100&offset=0`;
  const detail = (c: string, id: string): string => `https://api.smartrecruiters.com/v1/companies/${c}/postings/${id}`;
  const trimDetail = (d: Json): Json => {
    const sections = Object.fromEntries(
      Object.entries(d.jobAd?.sections ?? {}).map(([k, v]: [string, Json]) => [k, v ? { ...v, text: trimHtml(v.text, 400) } : v]),
    );
    const { creator: _creator, ...rest } = d; // never keep the recruiter's name
    return { ...rest, jobAd: { ...d.jobAd, sections } };
  };
  for (const [company, preds] of [
    [
      "Freshworks",
      [
        ["indiaHybrid", (p: Json) => p.location?.country === "in" && p.location?.hybrid === true],
        ["remoteContract", (p: Json) => p.location?.remote === true && p.typeOfEmployment?.id === "contract"],
      ],
    ],
    [
      "NielsenIQ",
      [
        ["internship", (p: Json) => p.experienceLevel?.id === "internship" || p.typeOfEmployment?.id === "intern"],
        ["director", (p: Json) => p.experienceLevel?.id === "director" || p.experienceLevel?.id === "executive"],
        ["entryLevel", (p: Json) => p.experienceLevel?.id === "entry_level" || p.experienceLevel?.id === "associate"],
      ],
    ],
  ] as [string, [string, (p: Json) => boolean][]][]) {
    const page = await json(list(company));
    const picks = pick(page.content, (p: Json) => p.id, preds, "smartrecruiters").map(({ creator: _c, ...p }: Json) => p);
    write("smartrecruiters", `${company.toLowerCase()}-list.json`, { offset: 0, limit: 100, totalFound: picks.length, content: picks });
    for (const p of picks) write("smartrecruiters", `${company.toLowerCase()}-detail-${p.id}.json`, trimDetail(await json(detail(company, p.id))));
  }
}

/* ───────────── Workable ───────────── */
async function workable(): Promise<void> {
  const url = (a: string): string => `https://apply.workable.com/api/v1/widget/accounts/${a}?details=true`;
  const trim = (j: Json): Json => ({ ...j, description: trimHtml(j.description, 500), requirements: trimHtml(j.requirements, 300), benefits: trimHtml(j.benefits, 300) });
  for (const [account, preds] of [
    [
      "covergo",
      [
        ["multiLocationIndia", (j: Json) => j.country === "India"],
        ["remote", (j: Json) => j.telecommuting === true && j.country !== "India"],
      ],
    ],
    [
      "exponent-energy",
      [
        ["indiaOnsite", (j: Json) => j.telecommuting === false && j.experience !== "Internship"],
        ["internship", (j: Json) => j.experience === "Internship"],
      ],
    ],
  ] as [string, [string, (j: Json) => boolean][]][]) {
    const data = await json(url(account));
    const picks = pick(data.jobs, (j: Json) => j.shortcode, preds, "workable");
    const codes = new Set(picks.map((j: Json) => j.shortcode));
    // keep EVERY per-location entry of the chosen shortcodes (that is the multi-location quirk under test)
    write("workable", `${account}.json`, { name: data.name, description: trimHtml(data.description, 200), jobs: data.jobs.filter((j: Json) => codes.has(j.shortcode)).map(trim) });
  }
}

/* ───────────── Recruitee ───────────── */
async function recruitee(): Promise<void> {
  const url = (c: string): string => `https://${c}.recruitee.com/api/offers/`;
  const trim = (o: Json): Json => {
    const { mailbox_email: _m, translations: _t, open_questions: _q, ...rest } = o;
    return { ...rest, description: trimHtml(o.description, 500), requirements: trimHtml(o.requirements, 300) };
  };
  for (const [company, preds] of [
    [
      "advancy",
      [
        ["salaryYear", (o: Json) => o.salary?.min !== null && o.salary?.period === "year"],
        ["internship", (o: Json) => o.employment_type_code === "internship"],
        ["noSalary", (o: Json) => o.salary?.min === null && o.salary?.max === null],
      ],
    ],
    ["acturis", [["hybridCustomDomain", (o: Json) => o.hybrid === true]]],
    ["addepto", [["remoteOnly", (o: Json) => o.remote === true && !o.on_site && !o.hybrid]]],
    ["channable", [["salaryMonth", (o: Json) => o.salary?.min !== null && o.salary?.period === "month"]]],
  ] as [string, [string, (o: Json) => boolean][]][]) {
    const data = await json(url(company));
    write("recruitee", `${company}.json`, { offers: pick(data.offers, (o: Json) => o.id, preds, "recruitee").map(trim) });
  }
}

/* ───────────── BambooHR ───────────── */
async function bamboohr(): Promise<void> {
  const list = (c: string): string => `https://${c}.bamboohr.com/careers/list`;
  const detail = (c: string, id: string): string => `https://${c}.bamboohr.com/careers/${id}/detail`;
  for (const [company, preds] of [
    [
      "acino",
      [
        ["onsite", (j: Json) => j.locationType === "0"],
        ["remote", (j: Json) => j.locationType === "1"],
        ["hybrid", (j: Json) => j.locationType === "2"],
      ],
    ],
    ["accuratetemps", [["compensationText", () => true]]],
  ] as [string, [string, (j: Json) => boolean][]][]) {
    const data = await json(list(company), true);
    let candidates: Json[] = data.result;
    if (company === "accuratetemps") {
      // find a posting whose detail carries compensation text
      for (const j of data.result.slice(0, 8)) {
        const d = await json(detail(company, j.id), true);
        if (d.result?.jobOpening?.compensation) {
          candidates = [j];
          break;
        }
      }
    }
    const picks = pick(candidates, (j: Json) => j.id, preds, "bamboohr");
    write("bamboohr", `${company}-list.json`, { meta: { totalCount: picks.length }, result: picks });
    for (const j of picks) {
      const d = await json(detail(company, j.id), true);
      d.result.jobOpening.description = trimHtml(d.result.jobOpening.description, 500);
      delete d.result.formFields; // the application form definition — not used
      write("bamboohr", `${company}-detail-${j.id}.json`, d);
    }
  }
}

/* ───────────── Personio ───────────── */
async function personio(): Promise<void> {
  const url = (c: string, en: boolean): string => `https://${c}.jobs.personio.de/xml${en ? "?language=en" : ""}`;
  const positions = (xml: string): string[] => xml.match(/<position>[\s\S]*?<\/position>/g) ?? [];
  const idOf = (p: string): string => /<id>(\d+)<\/id>/.exec(p)?.[1] ?? "";
  const trimCdata = (p: string): string =>
    p.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, body: string) => `<![CDATA[${String(trimHtml(body, 300))}]]>`);
  // Contact sections name real recruiters: keep the section (the adapter must drop it) but redact its content.
  const redactContacts = (p: string): string =>
    p.replace(
      /(<name>\s*(?:Contact|Kontakt|Ansprechpartner)[^<]*<\/name>\s*<value>\s*<!\[CDATA\[)[\s\S]*?(\]\]>)/gi,
      '$1<p>Recruiter Name<br>HR Manager<br><a href="mailto:careers@example.com">Send email</a></p>$2',
    );
  const doc = (ps: string[]): string =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<workzag-jobs>\n${ps.map(redactContacts).join("\n")}\n</workzag-jobs>\n`;

  const t360 = positions(await fetchCached(url("360t", true), { robots: true }));
  const p360 = [t360.find((p) => /<name>Contact/.test(p) && /<yearsOfExperience>/.test(p)), t360.find((p) => /Asia Pacific/.test(p))].filter(
    (p): p is string => Boolean(p),
  );
  note("personio", "contactSection", p360[0] && idOf(p360[0]));
  write("personio", "360t.xml", doc([...new Set(p360)].map(trimCdata)));

  const en = positions(await fetchCached(url("1komma5grad", true), { robots: true }));
  const def = positions(await fetchCached(url("1komma5grad", false), { robots: true }));
  const want = [
    ["germanOnly", (p: string) => !/<jobDescription>/.test(p)],
    ["workingStudent", (p: string) => /<employmentType>working_student/.test(p)],
    ["trainee", (p: string) => /<employmentType>trainee/.test(p)],
    ["remoteOffice", (p: string) => /<additionalOffices>[\s\S]*Remote/i.test(p)],
  ] as const;
  const ids = new Set<string>();
  for (const [kase, pred] of want) {
    const hit = en.find(pred);
    note("personio", kase, hit && idOf(hit));
    if (hit) ids.add(idOf(hit));
  }
  write("personio", "1komma5grad-en.xml", doc(en.filter((p) => ids.has(idOf(p))).map(trimCdata)));
  write("personio", "1komma5grad-default.xml", doc(def.filter((p) => ids.has(idOf(p))).map(trimCdata)));
}

/* ───────────── Breezy ───────────── */
async function breezy(): Promise<void> {
  const url = (c: string): string => `https://${c}.breezy.hr/json?verbose=true`;
  const trim = (p: Json): Json => ({ ...p, description: trimHtml(p.description, 400) });
  for (const [company, preds] of [
    ["021-strategic", [["remoteCad", (p: Json) => /year/.test(p.salary ?? "") && p.location?.country?.id === "CA"]]],
    [
      "2ulaundry",
      [
        ["hourly", (p: Json) => /hour/.test(p.salary ?? "")],
        ["openEndedHourly", (p: Json) => /\+/.test(p.salary ?? "")],
        ["noSalary", (p: Json) => !p.salary],
      ],
    ],
    ["20four7va", [["worldwideRemote", (p: Json) => p.location?.is_remote === true]]],
  ] as [string, [string, (p: Json) => boolean][]][]) {
    const data = await json(url(company), true);
    write("breezy", `${company}.json`, pick(data, (p: Json) => p.id, preds, "breezy").map(trim));
  }
}

/* ───────────── Teamtailor ───────────── */
async function teamtailor(): Promise<void> {
  const url = (c: string): string => `https://${c}.teamtailor.com/jobs.rss?per_page=100&offset=0`;
  for (const [company, preds] of [
    ["lunar", [["hybrid", (i: string) => /<remoteStatus>hybrid/.test(i)], ["onsite", (i: string) => /<remoteStatus>onsite/.test(i)], ["none", (i: string) => /<remoteStatus>none/.test(i)]]],
    ["tibber", [["multiLocation", (i: string) => (i.match(/<tt:location>/g) ?? []).length > 1]]],
  ] as [string, [string, (i: string) => boolean][]][]) {
    const xml = await fetchCached(url(company), { robots: true });
    const head = xml.slice(0, xml.indexOf("<item>"));
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    const chosen = pick(items, (i) => /<link>[^<]*\/jobs\/(\d+)/.exec(i)?.[1] ?? "", preds, "teamtailor");
    const trimmed = chosen.map((i) => i.replace(/<description>([\s\S]*?)<\/description>/, (_m, d: string) => `<description>${String(trimHtml(d, 500))}</description>`));
    write("teamtailor", `${company}.rss`, `${head}${trimmed.join("\n    ")}\n  </channel>\n</rss>\n`);
  }
}

const steps: [string, () => Promise<void>][] = [
  ["greenhouse", greenhouse],
  ["lever", lever],
  ["ashby", ashby],
  ["smartrecruiters", smartrecruiters],
  ["workable", workable],
  ["recruitee", recruitee],
  ["bamboohr", bamboohr],
  ["personio", personio],
  ["breezy", breezy],
  ["teamtailor", teamtailor],
];
const only = process.argv[2];
for (const [name, step] of steps) {
  if (only && only !== name) continue;
  try {
    await step();
  } catch (e) {
    log.error(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
const manifestPath = join(OUT, "manifest.json");
const previous = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, Record<string, string>>) : {};
writeFileSync(manifestPath, `${JSON.stringify({ ...previous, ...manifest }, null, 2)}\n`);
log.info("manifest written", manifest);
