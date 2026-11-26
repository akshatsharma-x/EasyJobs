import { JOB_TYPES, type JobType } from "@easyjobs/contract";
import { asString, asStringList, bag } from "./text";

export interface JobTypeInput {
  /** RawJob.jobType hint */
  hint?: unknown;
  employmentTypeRaw?: string | null;
  title?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
}

export interface JobTypeResult {
  jobType: JobType;
  source: "hint" | "employment_type" | "title" | "tags" | "description" | "default";
}

const E_INTERN = /\bintern(?:ship)?s?\b|\binternship\b|\bINTERN\b|\bco[\s_-]?op\b|\bstudent\b|\btrainee[\s_-]intern\b/i;
const E_APPRENTICE = /\bapprentice(?:ship)?s?\b/i;
const E_FULL = /\bfull[\s_-]?time\b|\bpermanent\b|\bregular\b|\bfte\b|\bsalaried\b/i;
const E_PART = /\bpart[\s_-]?time\b/i;
const E_CONTRACT = /\bcontract(?:or|ual|s)?\b|\bc2h\b|\bfixed[\s_-]?term\b|\bconsultant\b|\b1099\b|\bc2c\b|\bcorp[\s-]to[\s-]corp\b/i;
const E_FREELANCE = /\bfreelanc\w*|\bgig\b|\bself[\s_-]?employed\b/i;
const E_TEMP = /\btemp(?:orary)?\b|\bseasonal\b|\bcasual\b|\bper[\s_-]?diem\b/i;

const T_INTERN =
  /\b(?:intern(?:ship)?s?|summer\s+(?:analyst|associate|intern(?:ship)?|trainee)|winter\s+intern(?:ship)?|co[\s-]?op(?:\s+student)?|industrial\s+trainee|intern[\s-]+trainee|trainee[\s-]+intern|campus\s+ambassador|student\s+ambassador|working\s+student)\b/i;
const T_APPRENTICE = /\bapprentice(?:ship)?s?\b/i;
const T_PART = /\bpart[\s-]?time\b/i;
const T_CONTRACT = /\b(?:contract(?:ual)?|contractor|c2h|contract[\s-]to[\s-]hire|fixed[\s-]term|temp[\s-]to[\s-]perm)\b(?!\s*(?:manager|management|specialist|administrator|admin|analyst|negotiat\w*|lawyer|attorney|drafting|associate|executive|officer|coordinator|lifecycle|review|compliance))/i;
const T_FREELANCE = /\bfreelanc(?:e|er|ers|ing)\b/i;
const T_TEMP = /\b(?:temporary|temp|seasonal)\b(?!\s*(?:to|-)\s*perm)/i;

const D_INTERN =
  /\b(?:this\s+is\s+an?\s+(?:\d+[\s-]?(?:month|week)s?\s+)?(?:paid\s+|unpaid\s+|remote\s+|summer\s+|full[\s-]time\s+)?internship|internship\s+(?:duration|period|program(?:me)?|tenure)\b|duration\s+of\s+(?:the\s+)?internship|\d+[\s-]?months?\s+(?:paid\s+|unpaid\s+|full[\s-]time\s+)?internship|pre[\s-]placement\s+offer|\bppo\b\s+(?:opportunity|based|on\s+performance))/i;
const D_PART = /\b(?:this\s+is\s+a\s+part[\s-]time|part[\s-]time\s+(?:role|position|job|opportunity|basis|internship))\b/i;
const D_CONTRACT =
  /\b(?:this\s+is\s+a\s+(?:\d+[\s-]?months?\s+)?contract(?:ual)?\s+(?:role|position|job|assignment)|contract\s+(?:duration|period|length|tenure)\s*:|on\s+a\s+contract(?:ual)?\s+basis|contract[\s-]to[\s-]hire|\bc2h\b|fixed[\s-]term\s+contract)/i;
const D_FREELANCE = /\bfreelance\s+(?:role|position|project|basis|opportunity|assignment)\b/i;
const D_TEMP = /\btemporary\s+(?:role|position|job|basis|assignment|contract)\b/i;
const D_APPRENTICE = /\b(?:apprenticeship\s+(?:program(?:me)?|training|scheme)|under\s+the\s+apprentices?\s+act|\bnaps\b|\bnats\b|national\s+apprenticeship)\b/i;

function isJobType(v: unknown): v is JobType {
  return typeof v === "string" && (JOB_TYPES as readonly string[]).includes(v);
}

/** Maps schema.org / ATS employment types ("FULL_TIME", "Intern", "Contract to hire", "Part-time; Remote"). */
export function jobTypeFromEmploymentType(raw: unknown): JobType | null {
  const s = asString(raw).slice(0, 500);
  if (!s.trim()) return null;
  if (E_INTERN.test(s)) return "internship";
  if (E_APPRENTICE.test(s)) return "apprenticeship";
  if (E_FULL.test(s) && !/\bcontract[\s_-]?to[\s_-]?hire\b|\bc2h\b/i.test(s)) return "full_time";
  if (E_PART.test(s)) return "part_time";
  if (E_FREELANCE.test(s)) return "freelance";
  if (E_CONTRACT.test(s)) return "contract";
  if (E_TEMP.test(s)) return "temporary";
  return null;
}

/** Job type from the title alone ("Software Engineer Intern" → internship). */
export function jobTypeFromTitle(raw: unknown): JobType | null {
  const s = asString(raw).slice(0, 1000);
  if (!s.trim()) return null;
  if (T_INTERN.test(s)) return "internship";
  if (T_APPRENTICE.test(s)) return "apprenticeship";
  if (T_PART.test(s)) return "part_time";
  if (T_FREELANCE.test(s)) return "freelance";
  if (T_CONTRACT.test(s)) return "contract";
  if (T_TEMP.test(s)) return "temporary";
  return null;
}

/** Precedence: hint > employment type > title > tags > description phrases > full_time. */
export function detectJobTypeDetailed(jobTypeInput: JobTypeInput): JobTypeResult {
  const input = bag(jobTypeInput);
  if (isJobType(input.hint)) return { jobType: input.hint, source: "hint" };
  const fromEmployment = jobTypeFromEmploymentType(input.employmentTypeRaw);
  // A title saying "Intern" beats a generic "Full-time" employment type (many ATSs default to it).
  const fromTitle = jobTypeFromTitle(input.title);
  if (fromEmployment && !(fromEmployment === "full_time" && fromTitle && fromTitle !== "full_time")) {
    return { jobType: fromEmployment, source: "employment_type" };
  }
  if (fromTitle) return { jobType: fromTitle, source: "title" };
  const tags = asStringList(input.tags).map((t) => t.toLowerCase());
  for (const t of tags) {
    if (t === "internship" || t === "intern") return { jobType: "internship", source: "tags" };
    if (isJobType(t)) return { jobType: t, source: "tags" };
    if (t === "part-time") return { jobType: "part_time", source: "tags" };
  }
  const d = asString(input.description);
  if (d) {
    const sample = d.length > 20_000 ? d.slice(0, 20_000) : d;
    const lower = sample.toLowerCase();
    if ((lower.includes("intern") || lower.includes("ppo") || lower.includes("placement offer")) && D_INTERN.test(sample)) {
      return { jobType: "internship", source: "description" };
    }
    if ((lower.includes("apprentic") || lower.includes("naps") || lower.includes("nats")) && D_APPRENTICE.test(sample)) {
      return { jobType: "apprenticeship", source: "description" };
    }
    if ((lower.includes("part-time") || lower.includes("part time")) && D_PART.test(sample)) return { jobType: "part_time", source: "description" };
    if ((lower.includes("contract") || lower.includes("c2h") || lower.includes("fixed")) && D_CONTRACT.test(sample)) return { jobType: "contract", source: "description" };
    if (lower.includes("freelance") && D_FREELANCE.test(sample)) return { jobType: "freelance", source: "description" };
    if (lower.includes("temporary") && D_TEMP.test(sample)) return { jobType: "temporary", source: "description" };
  }
  return { jobType: fromEmployment ?? "full_time", source: fromEmployment ? "employment_type" : "default" };
}

export function detectJobType(input: JobTypeInput): JobType {
  return detectJobTypeDetailed(input).jobType;
}
