/**
 * Personio public XML job feed (documented for job-board integrations):
 *   GET https://{company}.jobs.personio.de/xml?language=en   (also *.jobs.personio.com)
 * One request returns every published position. Unknown subdomain → 404 (HTML). robots.txt respected.
 * `language=en` returns ONLY English description texts (a German-only board comes back nearly empty:
 * 1KOMMA5° had 147 English vs 1,354 default-language sections). So: English first, and only when some
 * positions lack a description, one more request for the default-language feed to fill the gaps.
 * Rich structured hints: employmentType (permanent|intern|trainee|working_student|freelance|temporary),
 * schedule (full-time|part-time|full-or-part-time), seniority (student|entry-level|experienced|executive),
 * yearsOfExperience buckets (lt-1, 1-2, 2-5, 5-7, 7-10, 10-15, ht-15) → experienceMin/Max.
 * "trainee" is mostly the German Ausbildung → apprenticeship. Contact sections (recruiter names) are dropped.
 */
import type { CompanyTarget, ExperienceLevel, JobType, RawJob } from "@easyjobs/contract";
import { UnexpectedResponseError } from "../core/errors";
import { getBoardText } from "../core/http";
import { buildJob } from "../core/job";
import type { AtsAdapter } from "../core/types";
import { htmlSection, joinHtml } from "../lib/html";
import { levelFromLabel, yearsFromBucket } from "../lib/hints";
import { clean, extraOf, isRecord, uniqStrings } from "../lib/text";
import { createFeedParser, xmlText } from "../lib/xml";
import { careersOrigin } from "../lib/tokens";

export interface PersonioPosition {
  id: string;
  subcompany?: string | null;
  office?: string | null;
  additionalOffices?: string[];
  department?: string | null;
  recruitingCategory?: string | null;
  name?: string | null;
  descriptions: { name: string | null; value: string | null }[];
  employmentType?: string | null;
  seniority?: string | null;
  schedule?: string | null;
  yearsOfExperience?: string | null;
  occupation?: string | null;
  occupationCategory?: string | null;
  keywords?: string | null;
  createdAt?: string | null;
  /** "default" when the description came from the account's default-language feed. */
  descriptionLanguage?: "en" | "default";
}

const parser = createFeedParser([
  "workzag-jobs.position",
  "workzag-jobs.position.jobDescriptions.jobDescription",
  "workzag-jobs.position.additionalOffices.office",
]);

/** Parses the Personio XML feed into plain position records. Throws on non-feed XML. */
export function parsePersonioXml(xml: string, url = "personio feed"): PersonioPosition[] {
  const doc: unknown = parser.parse(xml);
  const root = isRecord(doc) ? doc["workzag-jobs"] : undefined;
  if (root === undefined) throw new UnexpectedResponseError(url, "expected a <workzag-jobs> document");
  if (!isRecord(root)) return []; // empty feed: <workzag-jobs></workzag-jobs>
  const positions = Array.isArray(root.position) ? root.position : [];
  return positions.filter(isRecord).map((p): PersonioPosition => {
    const descs = isRecord(p.jobDescriptions) && Array.isArray(p.jobDescriptions.jobDescription) ? p.jobDescriptions.jobDescription : [];
    const offices = isRecord(p.additionalOffices) && Array.isArray(p.additionalOffices.office) ? p.additionalOffices.office : [];
    const t = (k: string): string | null => xmlText(p[k]);
    return {
      id: t("id") ?? "",
      subcompany: t("subcompany"),
      office: t("office"),
      additionalOffices: offices.map(xmlText).filter((o): o is string => o !== null),
      department: t("department"),
      recruitingCategory: t("recruitingCategory"),
      name: t("name"),
      descriptions: descs.filter(isRecord).map((d) => ({ name: xmlText(d.name), value: xmlText(d.value) })),
      employmentType: t("employmentType"),
      seniority: t("seniority"),
      schedule: t("schedule"),
      yearsOfExperience: t("yearsOfExperience"),
      occupation: t("occupation"),
      occupationCategory: t("occupationCategory"),
      keywords: t("keywords"),
      createdAt: t("createdAt"),
    };
  });
}

/** "acme" → https://acme.jobs.personio.de ; "acme.jobs.personio.com" / any URL → its origin. */
export const personioOrigin = (token: string): string => careersOrigin(token, "jobs.personio.de");
export const personioFeedUrl = (origin: string, language: "en" | "default" = "en"): string =>
  language === "en" ? `${origin}/xml?language=en` : `${origin}/xml`;

/**
 * English positions, with descriptions of English-less positions filled from the default-language feed.
 * Returns which positions carry default-language text (for extra.descriptionLanguage).
 */
export function mergePersonioLanguages(english: PersonioPosition[], fallback: PersonioPosition[]): PersonioPosition[] {
  const byId = new Map(fallback.map((p) => [p.id, p]));
  return english.map((p) => {
    if (hasDescription(p)) return p;
    const other = byId.get(p.id);
    return other && hasDescription(other) ? { ...p, descriptions: other.descriptions, descriptionLanguage: "default" } : p;
  });
}

const hasDescription = (p: PersonioPosition): boolean => p.descriptions.some((d) => clean(d.value) !== null);

/** Recruiter contact blocks hold personal data — never collected. */
const CONTACT_SECTION = /^(contact|kontakt|ansprechpartner|your contact|contact person|deine ansprechpartner)/i;

export function personioJobType(p: Pick<PersonioPosition, "employmentType" | "schedule">): JobType | undefined {
  const partTime = /^part-time$/i.test(p.schedule ?? "");
  switch (clean(p.employmentType)?.toLowerCase()) {
    case "permanent":
      return partTime ? "part_time" : "full_time";
    case "intern":
      return "internship";
    case "trainee":
      return "apprenticeship";
    case "working_student":
      return "part_time";
    case "freelance":
      return "freelance";
    case "temporary":
      return "temporary";
    default:
      return undefined;
  }
}

export function personioLevel(p: PersonioPosition): ExperienceLevel | undefined {
  const type = clean(p.employmentType)?.toLowerCase();
  if (type === "intern" || type === "working_student") return "intern";
  switch (clean(p.seniority)?.toLowerCase()) {
    case "student":
      return "intern";
    case "entry-level":
      return "entry";
    case "experienced":
      return levelFromLabel("experienced", p.name);
    case "executive":
      return "executive";
    default:
      return undefined;
  }
}

export function mapPersonioPosition(p: PersonioPosition, target: CompanyTarget, origin: string): RawJob | null {
  const years = yearsFromBucket(p.yearsOfExperience);
  const sections = p.descriptions.filter((d) => !CONTACT_SECTION.test(d.name ?? ""));
  return buildJob("personio", target, {
    sourceJobId: p.id,
    title: p.name,
    url: p.id ? `${origin}/job/${encodeURIComponent(p.id)}` : null,
    company: p.subcompany,
    locations: [p.office, ...(p.additionalOffices ?? [])],
    descriptionHtml: joinHtml(sections.map((d) => htmlSection(d.name, d.value))),
    postedAt: p.createdAt,
    department: p.department,
    jobType: personioJobType(p),
    employmentTypeRaw: [p.employmentType, p.schedule].map((v) => clean(v)).filter(Boolean).join(", ") || null,
    experienceLevel: personioLevel(p),
    experienceRaw: years?.label ?? clean(p.seniority),
    experienceMin: years?.min ?? undefined,
    experienceMax: years?.max ?? undefined,
    extra: extraOf({
      subcompany: clean(p.subcompany),
      recruitingCategory: clean(p.recruitingCategory),
      occupation: clean(p.occupation),
      occupationCategory: clean(p.occupationCategory),
      seniority: clean(p.seniority),
      schedule: clean(p.schedule),
      keywords: uniqStrings((p.keywords ?? "").split(",")),
      descriptionLanguage: p.descriptionLanguage === "default" ? "default" : undefined,
    }),
  });
}

export const personio: AtsAdapter = {
  id: "personio",
  name: "Personio",
  ats: "personio",
  endpoint: "https://{company}.jobs.personio.de/xml?language=en",
  async *scrapeTarget(ctx) {
    const origin = personioOrigin(ctx.target.token);
    const opts = { robots: true, accept: "application/xml,text/xml" } as const;
    const url = personioFeedUrl(origin, "en");
    let positions = parsePersonioXml(await getBoardText(ctx, url, opts), url);
    const missing = positions.filter((p) => !hasDescription(p)).length;
    if (missing > 0) {
      const fallbackUrl = personioFeedUrl(origin, "default");
      ctx.log.debug(`${missing} position(s) have no English text — reading the default-language feed`);
      positions = mergePersonioLanguages(positions, parsePersonioXml(await getBoardText(ctx, fallbackUrl, opts), fallbackUrl));
    }
    for (const position of positions) {
      const raw = mapPersonioPosition(position, ctx.target, origin);
      if (raw) yield raw;
      else ctx.skip("missing id/title");
    }
  },
};
