/** Tolerant "Label: value" extraction from tables, <strong>Label:</strong> lines, plain lines and <br>-split paragraphs. */
import type { ContentModel, Line, LinkRef } from "./dom";
import { foldText, normalizeSpace } from "../util/text";

export type FieldKey =
  | "company" | "role" | "location" | "qualification" | "batch" | "experience" | "salary" | "jobType" | "workMode"
  | "lastDate" | "skills" | "department" | "duration" | "startDate" | "vacancies" | "applyLink" | "website" | "venue"
  | "interviewDate";

export interface KeyValue {
  /** Original label text. */
  label: string;
  key: FieldKey | null;
  value: string;
  /** Links that sit in the value part. */
  links: LinkRef[];
  line: Line;
  source: "table" | "line";
}

/** Matched against the folded label (lowercase, punctuation → spaces). Order matters: first match wins. */
const FIELD_PATTERNS: [FieldKey, RegExp][] = [
  ["applyLink", /^(?:official\s+)?(?:job\s+|direct\s+|online\s+)?(?:apply|application|registration|register)\s*(?:link|url|here|now|online)(?:\s+for\b.*)?$|^(?:link to apply|apply|how to apply link|apply link\s+\w+.*)$/],
  ["website", /^(?:.*\s)?official\s+(?:.*\s)?(?:website|site|career(?:s)? (?:page|portal|site|website)|portal|notification)$|^(?:career(?:s)?|official) (?:page|portal|site|website)$|^website$/],
  ["company", /^(?:company(?: name)?|name of (?:the )?company|organi[sz]ation(?: name)?|employer(?: name)?|hiring (?:company|organi[sz]ation|firm)|recruit(?:er|ing (?:company|organi[sz]ation))|firm(?: name)?|bank(?: name)?|institution(?: name)?|institute(?: name)?|conducting (?:body|organi[sz]ation)|brand|company organi[sz]ation)$/],
  ["role", /^(?:job |internship |post |position |profile |vacancy )?(?:role|title|designation|position|post|profile|name)(?: title| name| offered| applied| s)?$|^(?:job role|role title|post name|name of (?:the )?post|internship (?:name|role|title|profile|position)|program(?:me)? name|job (?:title|profile|position|designation)|opening|position (?:title|name)|role (?:name|offered)|trainee role)$/],
  ["vacancies", /^(?:vacanc(?:y|ies)|openings?|no of (?:posts|vacancies|openings|positions)|number of (?:posts|vacancies|openings|positions)|total (?:posts|vacancies|openings)|seats|positions|vacancy count|seat count)$/],
  ["location", /^(?:(?:job|work|internship|posting|office|base|training|drive)\s+)?locations?(?: s)?(?: city)?$|^(?:place of posting|posting|city|cities|job city|work place|workplace|location s|office location s)$/],
  ["venue", /^(?:(?:interview |walk ?in |drive )?venue(?: address)?|address|interview location|reporting (?:venue|address))$/],
  ["interviewDate", /^(?:(?:interview|walk ?in|drive)(?: date| dates| date time| time| timings| schedule)|date (?:and|&) time|date time|timings?)$/],
  ["qualification", /^(?:qualifications?(?: required)?|education(?:al)?(?: qualification| background| criteria| requirement| required)?|eligibility(?: criteria)?|eligible (?:degrees?|streams?|courses?|branch(?:es)?|qualifications?|candidates)|degree(?: required| s)?|courses?|branch(?:es)?|streams?|academic (?:qualification|requirement|background)s?|who can apply|eligible stream|required qualification|target (?:applicants|audience|candidates))$/],
  ["batch", /^(?:(?:eligible |graduation |passing |passout |pass out )?batch(?:es)?(?: eligible)?|yop|year of (?:passing|graduation)|graduating (?:batch|year)|passing (?:out )?year|pass ?out(?: year)?|graduation year|eligible years?|academic year)$/],
  ["experience", /^(?:experience(?: required| level| criteria)?|work experience|exp|years of experience|min(?:imum)? experience|required experience)$/],
  ["salary", /^(?:(?:expected|offered|official|monthly|annual|fixed)\s+)?(?:salary|stipend|ctc|package|pay|compensation|remuneration|pay scale)(?: package| range| offered| details| ctc| amount| per month| month| benefits)?$|^(?:salary ctc|offered salary ctc|stipend amount|ctc offered|monthly stipend|annual package|salary stipend|stipend salary)$/],
  ["jobType", /^(?:(?:job|employment|internship|work|position|engagement|program(?:me)?|role)\s+type|type of (?:job|employment|internship)|nature of (?:job|employment|work)|employment|program(?:me)? track|position type)$/],
  ["workMode", /^(?:(?:work|working|internship|job)\s+)?mode(?: of (?:work|internship|job))?$|^(?:work (?:model|type|arrangement|setup|from)|remote|work location type)$/],
  ["lastDate", /^(?:(?:last|closing|end|final|due)\s+date(?: to apply| of application| for application| to register| of registration| for registration| for applying)?|apply (?:by|before)|application (?:deadline|end date|last date|closing date|window closes)|deadline(?: to apply| for application)?|registration (?:deadline|last date|end date|closes)|last date of (?:registration|application)|(?:.*\s)?registration last date|(?:.*\s)?last date)$/],
  ["skills", /^(?:(?:key|required|technical|core|mandatory|preferred|desired)\s+)?skills?(?: required| set| needed)?$|^(?:skill set|tech stack|technologies|tools)$/],
  ["department", /^(?:department|team|function|division|business unit|domain|practice|vertical|role focus|focus area|internship (?:domain|area|track|focus)|area of work|work area)$/],
  ["duration", /^(?:(?:internship|program(?:me)?|training|apprenticeship)\s+)?duration$|^(?:tenure|period|program(?:me)? duration)$/],
  ["startDate", /^(?:(?:internship|joining|program(?:me)?)\s+)?start(?: date)?$|^(?:joining date|date of joining|commencement)$/],
];

const NOT_AVAILABLE = /^(?:n\/?a|na|nil|none|-+|—|not (?:publicly )?(?:mentioned|specified|disclosed|available|announced|revealed|stated|applicable|known|shared)\b.*|to be (?:announced|updated)|will be (?:updated|announced)|tba|tbd|not given|not provided|unknown|undisclosed)$/i;

/** Prose meaning "unknown" anywhere in a value ("EA does not publicly disclose exact seat numbers…"). */
const NOT_AVAILABLE_LOOSE = /\b(?:not (?:publicly |officially |yet )?(?:mentioned|specified|disclosed|available|announced|revealed|stated|shared|confirmed)|(?:does|do|did) not (?:publicly |officially )?(?:disclose|specify|mention|reveal|state)|no (?:specific|fixed|official) (?:number|count|date|deadline|stipend|salary)|undisclosed)\b/i;

/** `loose` also treats explanatory prose ("… not publicly disclosed …") as unavailable — for counts/pay/dates. */
export function isNotAvailable(value: string, loose = false): boolean {
  const v = value.trim().replace(/[.!]+$/, "");
  return NOT_AVAILABLE.test(v) || (loose && NOT_AVAILABLE_LOOSE.test(v));
}

/** Fields whose values are only useful when concrete. */
export const LOOSE_NA_FIELDS: ReadonlySet<FieldKey> = new Set(["vacancies", "salary", "lastDate", "batch", "experience", "duration", "startDate", "interviewDate"]);

export function labelToField(label: string): FieldKey | null {
  const folded = foldText(label.replace(/\(s\)/gi, "s"));
  if (!folded || folded.split(" ").length > 8) return null;
  for (const [key, re] of FIELD_PATTERNS) if (re.test(folded)) return key;
  return null;
}

const LINE_KV = /^\s*(?:[-–•*▪►✓✔➤➢→·]\s*)?(?:\d{1,2}[.)]\s+)?([A-Za-z][A-Za-z0-9 /&().,'’+-]{0,60}?)\s*(?::-|:|：|=>)\s*(.*)$/;
const DASH_KV = /^\s*(?:[-–•*▪►✓✔➤➢→·]\s*)?([A-Za-z][A-Za-z0-9 /&().'’+-]{1,70}?)\s+[–—-]\s+(.+)$/;
const HEADER_CELL = /^(?:features?|particulars?|details?|official details|description|information|item|key|value|event|status|parameter|program feature|highlights?|category|field|aspect|criteria)(?:\s*\/.*)?$/i;

/** All key/value pairs of a post, in document order (FAQ blocks excluded). */
export function extractKeyValues(model: ContentModel): KeyValue[] {
  const out: KeyValue[] = [];
  for (const line of model.lines) {
    if (line.inFaq || line.headingLevel > 0) continue;
    if (line.cells) {
      if (line.cells.length !== 2) continue;
      const [a, b] = line.cells as [NonNullable<Line["cells"]>[number], NonNullable<Line["cells"]>[number]];
      const label = a.text.replace(/[:：]\s*$/, "").trim();
      if (!label || (HEADER_CELL.test(label) && HEADER_CELL.test(b.text))) continue;
      out.push({ label, key: labelToField(label), value: b.text, links: b.links, line, source: "table" });
      continue;
    }
    const m = LINE_KV.exec(line.text);
    if (m) {
      const label = normalizeSpace(m[1] ?? "");
      const value = normalizeSpace(m[2] ?? "");
      if (label.split(" ").length <= 8) {
        const key = labelToField(label);
        const valueStart = line.text.length - value.length;
        const links = line.links.filter((l) => l.before.length >= Math.max(0, valueStart - 2) || key === "applyLink" || key === "website");
        if (key || value) out.push({ label, key, value, links, line, source: "line" });
        continue;
      }
    }
    const d = DASH_KV.exec(line.text);
    if (d) {
      const label = normalizeSpace(d[1] ?? "");
      const key = labelToField(label);
      if (key) out.push({ label, key, value: normalizeSpace(d[2] ?? ""), links: line.links, line, source: "line" });
    }
  }
  return out;
}

/** First usable value per field (table/summary values come first in these templates). */
export function firstValues(kvs: KeyValue[]): Partial<Record<FieldKey, KeyValue>> {
  const out: Partial<Record<FieldKey, KeyValue>> = {};
  for (const kv of kvs) {
    if (!kv.key || out[kv.key]) continue;
    if (kv.key !== "applyLink" && kv.key !== "website" && (!kv.value || isNotAvailable(kv.value, LOOSE_NA_FIELDS.has(kv.key)))) continue;
    out[kv.key] = kv;
  }
  return out;
}
