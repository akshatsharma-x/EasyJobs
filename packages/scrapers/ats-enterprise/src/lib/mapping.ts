import type { ExperienceLevel, JobType, WorkMode } from "@easyjobs/contract";
import { cleanText } from "./html";

const INTERN = /\b(?:intern|interns|internship|internships|co-?op|werkstudent|working student|stagiaire|stage|praktikum|praktikant|summer analyst|summer associate|student (?:worker|assistant|job))\b/i;
const APPRENTICE = /\b(?:apprentice|apprenticeship|ausbildung)\b/i;
const PART_TIME = /\bpart[\s_-]?time\b|\bparttime\b|\bteilzeit\b/i;
const TEMPORARY = /\b(?:temp|temporary|fixed[\s_-]?term|seasonal|per[\s_-]?diem|casual|befristet)\b/i;
const CONTRACT = /\b(?:contract|contractor|contingent|consultant contract|c2h|contract[\s_-]to[\s_-]hire)\b/i;
const FREELANCE = /\b(?:freelance|freelancer)\b/i;
const FULL_TIME = /\bfull[\s_-]?time\b|\bfulltime\b|\bregular\b|\bpermanent\b|\bvollzeit\b|\bunbefristet\b/i;

/**
 * Structured employment labels ("Full time", "FULL_TIME", "Intern (Fixed Term)", "CONTRACTOR",
 * schema.org values) → JobType. Internship beats everything; unknown → undefined.
 */
export function mapEmploymentType(...raws: (string | null | undefined)[]): JobType | undefined {
  const values = raws.filter((r): r is string => typeof r === "string" && r.trim().length > 0).map((r) => r.replace(/_/g, " "));
  if (values.length === 0) return undefined;
  if (values.some((v) => INTERN.test(v))) return "internship";
  if (values.some((v) => APPRENTICE.test(v))) return "apprenticeship";
  if (values.some((v) => FREELANCE.test(v))) return "freelance";
  if (values.some((v) => PART_TIME.test(v))) return "part_time";
  if (values.some((v) => CONTRACT.test(v))) return "contract";
  if (values.some((v) => TEMPORARY.test(v))) return "temporary";
  if (values.some((v) => FULL_TIME.test(v))) return "full_time";
  return undefined;
}

/** Workplace labels ("Remote", "TELECOMMUTE", "ORA_HYBRID", "On-site", "Flexible") → WorkMode. */
export function mapWorkMode(raw: string | null | undefined): WorkMode | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/^ORA_/i, "").replace(/_/g, " ").toLowerCase();
  if (/\bhybrid\b|\bflexible\b|\bflex\b/.test(s)) return "hybrid";
  if (/\bremote\b|\btelecommute\b|\bwork from home\b|\bwfh\b|\bvirtual\b|\bhome[\s-]?based\b|\banywhere\b|\bfully remote\b/.test(s)) return "remote";
  if (/\bon[\s-]?site\b|\bonsite\b|\bin[\s-]?office\b|\boffice\b|\bon[\s-]?premises?\b/.test(s)) return "onsite";
  return undefined;
}

/**
 * Only *structured* worker-type labels map to a level hint ("Intern (Fixed Term)",
 * "New College Graduate", "University Graduate", "Early Career"). Titles are left to the normalizer.
 */
export function levelFromWorkerType(raw: string | null | undefined): ExperienceLevel | undefined {
  if (!raw) return undefined;
  if (INTERN.test(raw)) return "intern";
  if (/\b(?:new (?:college )?grad(?:uate)?s?|recent graduate|university (?:graduate|hire)|campus|early career|graduate program(?:me)?|fresher|entry[\s-]level graduate)\b/i.test(raw)) return "fresher";
  return undefined;
}

/** ISO 3166-1 alpha-2 ↔ English region name via ICU, plus common aliases. */
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ["United States", "United States of America", "USA", "U.S.", "U.S.A."],
  GB: ["United Kingdom", "UK", "Great Britain", "England", "Scotland", "Wales"],
  KR: ["Korea", "South Korea", "Republic of Korea", "Korea, Republic of"],
  AE: ["United Arab Emirates", "UAE"],
  CZ: ["Czechia", "Czech Republic"],
  TW: ["Taiwan"],
  HK: ["Hong Kong", "Hong Kong SAR"],
  IN: ["India", "Bharat"],
};

export function countryNames(codeOrName: string): { code: string | null; names: string[] } {
  const input = codeOrName.trim();
  const upper = input.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    let name: string | undefined;
    try {
      name = regionNames.of(upper);
    } catch {
      name = undefined;
    }
    const names = new Set<string>([...(COUNTRY_ALIASES[upper] ?? []), ...(name && name !== upper ? [name] : [])]);
    return { code: upper, names: [...names] };
  }
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === input.toLowerCase())) return { code, names: aliases };
  }
  return { code: null, names: [input] };
}

/** Exact (case-insensitive) match of a facet label against a country, e.g. "India" or "IN". */
export function isCountryLabel(label: string, country: { code: string | null; names: string[] }): boolean {
  const l = label.trim().toLowerCase();
  if (country.code && l === country.code.toLowerCase()) return true;
  return country.names.some((n) => n.toLowerCase() === l);
}

/** Word-boundary containment ("Bangalore, India", "India - Pune", "Remote India", "IND-Bangalore"). */
export function mentionsCountry(label: string, country: { code: string | null; names: string[] }): boolean {
  const escaped = country.names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length > 0 && new RegExp(`(?:^|[^a-z])(?:${escaped.join("|")})(?:$|[^a-z])`, "i").test(label)) return true;
  if (country.code === "IN" && /(?:^|[^a-z])IND(?:$|[^a-z])/.test(label)) return true;
  return false;
}

/** Trim, drop empties and case-insensitive duplicates, keep order. */
export function uniqStrings(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = cleanText(v ?? "");
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Remove undefined values (keeps nulls, which are meaningful in RawJob). */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

/** Placeholder location strings that carry no place ("3 Locations", "Multiple Locations"). */
export function isPlaceholderLocation(s: string): boolean {
  return /^\s*(?:\d+\s+locations?|multiple locations?|various locations?|several locations?)\s*$/i.test(s);
}

/**
 * Internal test requisitions some tenants publish ("DO NOT APPLY - TEST REQ", "SA TEST OCT 15").
 * Deliberately narrow: real titles like "Test Engineer" or "QA Testing Analyst" must pass.
 */
const TEST_POSTING = /\bdo not apply\b|\bplease ignore\b|\b(?:test|dummy)[\s_-]+(?:req|reqs|requisition|posting)\b|\btest\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\bsourcing agent test\b|^\s*(?:sa\s+)?test\s*\d*\s*$/i;
export const isTestPosting = (title: string): boolean => TEST_POSTING.test(title);
