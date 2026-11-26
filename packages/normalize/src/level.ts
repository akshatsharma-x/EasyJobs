import { EXPERIENCE_LEVELS, type ExperienceLevel, type JobType } from "@easyjobs/contract";
import { asString, bag } from "./text";

export type Confidence = "high" | "medium" | "low";

export interface LevelInput {
  title?: string | null;
  description?: string | null;
  jobType?: JobType | null;
  /** RawJob.experienceLevel (structured hint from the source) */
  hint?: unknown;
  experienceMin?: number | null;
  experienceMax?: number | null;
  /** Where the years came from; description-derived years are less trustworthy. */
  experienceSource?: "hint" | "raw" | "title" | "description" | null;
  batches?: readonly number[];
  tags?: readonly string[];
}

export interface LevelResult {
  level: ExperienceLevel;
  confidence: Confidence;
  source: "job_type" | "years" | "hint" | "title" | "description" | "default";
}

/* ─────────────────────────── Title vocabulary ─────────────────────────── */

const T_INTERN =
  /\b(?:intern(?:ship)?s?|summer\s+(?:analyst|associate|intern(?:ship)?|trainee)|winter\s+intern(?:ship)?|co[\s-]?op(?:\s+student)?|industrial\s+trainee|intern[\s-]+trainee|trainee[\s-]+intern|campus\s+ambassador|student\s+ambassador|student\s+(?:developer|researcher|assistant)|working\s+student|werkstudent)\b/i;

const T_EXEC =
  /\b(?:chief\s+[a-z&]+(?:\s+[a-z&]+){0,2}\s+officer|chief\s+of\s+staff|c[a-z]?o\s*\/\s*founder|vice[\s-]+president|(?<!associate\s|assistant\s)vp\b|svp|evp|(?:managing|executive|associate|senior|group)\s+director|director|head\s+(?:of\b|[-–—,:])|general\s+manager|president|co[\s-]?founder|(?:managing|senior|equity|associate)\s+partner)/i;
const T_CXO = /(?<!\bto\s(?:the\s)?)\b(?:ceo|cto|cfo|coo|cmo|cio|ciso|chro|cpo|cro|cdo|cxo)\b/i;
const T_DEPT_HEAD =
  /\b(?:department|dept|team|branch|regional|zonal|cluster|business|unit|sales|marketing|hr|finance|engineering|product|design|operations|ops|growth|tech|technology|it|qa|delivery|program|project|category|brand|content|legal|admin|procurement|plant|site|country|practice|vertical)\s+head\b/i;

const T_LEAD_GEN = /\blead\s*(?:gen(?:eration)?|qualification|management|nurtur\w*)\b|\bleads\b/i;
const T_LEAD =
  /\b(?:senior\s+staff|staff\s+(?:software|engineer|data|machine|ml|research|product|designer|frontend|front[\s-]end|backend|back[\s-]end|full[\s-]?stack|site|security|developer|scientist|applied|platform|infrastructure|systems|ai|ux|ui|analyst|technical|tech|architect|sre|devops|cloud|mobile|ios|android|qa|test)|principal|distinguished|fellow|architect|lead|avp|assistant\s+vice\s+president|associate\s+vice\s+president|group\s+product\s+manager)\b/i;
const T_MANAGER = /\bmanager\b|\bmgr\b/i;
const T_MANAGER_MID = /\b(?:assistant|asst\.?|deputy|associate)\s+manager\b|\bam\s*[-–]/i;
const T_MANAGER_ENTRY = /\b(?:associate|junior|jr\.?)\s+product\s+manager\b|\bapm\b/i;
const T_MANAGER_FUNC =
  /\b(?:product|program|programme|project|account|accounts|relationship|territory|area|sales|social\s+media|community|content|brand|campaign|store|office|customer\s+success|client\s+success|key\s+account|category|marketing|digital\s+marketing|seo|partnership|partnerships|partner|business\s+development|bd|event|events|operations|ops|audit|branch|channel|alliance|growth|performance\s+marketing|e-?commerce|merchandising|procurement|purchase|purchasing|admin|administrative|facility|facilities|hr|talent|recruitment|payroll|accounts\s+payable|credit|collections?|retail|showroom|restaurant|hotel|floor|shift|warehouse|logistics|supply\s+chain|inventory|quality|safety|compliance|risk|tax|treasury|finance|fp&a|pricing|insights?|research|training|learning|delivery|release|service|support|technical\s+support|it|network|data|analytics|engineering\s+project|construction|site|production|plant|maintenance)\s+manager\b/i;

const T_SENIOR = /\b(?:senior|sr\.?|snr\.?)(?=\s|$|[-–—,(/])/i;
const T_MID = /\b(?:mid[\s-]?(?:level|senior|weight)|intermediate|experienced\s+(?:hire|professional))\b/i;
const T_ENTRY = /\b(?:junior|jr\.?|entry[\s-]?level|associate)\b/i;

const T_NUMERAL =
  /\b(?:sde|swe|sdet|sre|software\s+(?:development\s+)?engineer|engineer|developer|analyst|scientist|consultant|associate|programmer|designer|specialist|technician|administrator|member\s+of\s+technical\s+staff|mts|smts|sde\s*\/\s*swe)\s*[-–,]?\s*(iv|v|i{1,3}|[1-5])(?![\w.])/i;
const T_L_LEVEL = /(?:^|[\s,(\[/|-])l\s*[-–]?\s*([3-7])(?![\w.])/i;
const T_SUPPORT_TIER =
  /\b(?:support|helpdesk|help\s+desk|service\s+desk|desktop|noc|soc|operations|resolver|technician|network|l1|l2|tier|customer|technical\s+support|it\s+support)\b/i;

const T_FRESHER_STRONG =
  /\b(?:freshers?|new\s+grad(?:uate)?s?|recent\s+grad(?:uate)?s?|graduate\s+engineer(?:ing)?\s+trainee|graduate\s+trainee|management\s+trainee|engineer(?:ing)?\s+trainee|trainee|apprentice(?:ship)?|university\s+(?:graduate|grad|hire|hiring)|early[\s-]?careers?|graduate\s+(?:program(?:me)?|scheme|hire|role|analyst|associate|engineer|software\s+engineer|developer|consultant)|20\d{2}\s*(?:batch|grad(?:uate)?s?|pass[\s-]?outs?)|batch\s*(?:of\s*)?20\d{2})\b/i;
const T_GET = /\bGET\b/;
const T_CAMPUS = /\b(?:campus|off[\s-]?campus|on[\s-]?campus|university\s+program|college\s+(?:hire|hiring|graduates?))\b/i;
const T_CAMPUS_HR =
  /\b(?:campus|university|college)\s+(?:recruit(?:er|ing|ment)?|relations|relationship|engagement|talent|hiring\s+(?:manager|lead|partner|specialist|coordinator|executive))/i;

const D_FRESHER =
  /\b(?:freshers?\s+(?:can|may|are|who)\s+(?:also\s+)?(?:apply|welcome|eligible|encouraged)|freshers?\s+(?:welcome|only|preferred|eligible|hiring|drive|recruitment)|(?:only|for|hiring)\s+freshers|new\s+grad(?:uate)?s?\b|recent\s+grad(?:uate)?s?|(?:final|pre-?final)[\s-]year\s+students|graduating\s+(?:in|by|class|batch)|20\d{2}\s*(?:batch|pass[\s-]?outs?|graduates)|batch\s*(?:of\s*)?20\d{2}|campus\s+(?:hire|hiring|drive|recruitment|placement)|off[\s-]?campus\s+(?:drive|hiring|recruitment)|graduate\s+engineer\s+trainee|no\s+(?:prior\s+)?(?:work\s+)?experience\s+(?:is\s+)?(?:required|needed|necessary))/i;
const D_ENTRY = /\bentry[\s-]level\s+(?:role|position|job|opportunity|candidates?)\b/i;

const NUMERAL_LEVEL: Record<string, ExperienceLevel> = {
  i: "entry", "1": "entry", ii: "mid", "2": "mid", iii: "senior", "3": "senior", iv: "lead", "4": "lead", v: "lead", "5": "lead",
};
const L_LEVEL: Record<string, ExperienceLevel> = { "3": "entry", "4": "mid", "5": "senior", "6": "lead", "7": "lead" };

export interface TitleLevel {
  level: ExperienceLevel | null;
  strength: "strong" | "weak" | "none";
  fresherWords: boolean;
}

/** Level implied by the title alone (no years, no hints). */
export function levelFromTitle(titleInput: unknown): TitleLevel {
  const title = asString(titleInput).slice(0, 1000);
  if (!title.trim()) return { level: null, strength: "none", fresherWords: false };
  const campus = T_CAMPUS.test(title) && !T_CAMPUS_HR.test(title);
  const fresherStrong = T_FRESHER_STRONG.test(title) || T_GET.test(title);
  const fresherWords = fresherStrong || campus;

  if (T_INTERN.test(title)) return { level: "intern", strength: "strong", fresherWords };
  if ((T_EXEC.test(title) && !/\bfounder'?s?\s+office\b/i.test(title)) || T_CXO.test(title) || T_DEPT_HEAD.test(title)) {
    return { level: "executive", strength: "strong", fresherWords };
  }
  const lead = T_LEAD.test(title) && !(T_LEAD_GEN.test(title) && !/\b(?:team|tech|technical)\s+lead\b/i.test(title));
  if (lead) return { level: fresherStrong ? "fresher" : "lead", strength: "strong", fresherWords };
  if (T_MANAGER.test(title)) {
    if (fresherStrong) return { level: "fresher", strength: "strong", fresherWords };
    if (T_MANAGER_ENTRY.test(title)) return { level: "entry", strength: "strong", fresherWords };
    if (T_MANAGER_MID.test(title)) return { level: "mid", strength: "strong", fresherWords };
    if (T_SENIOR.test(title)) return { level: T_MANAGER_FUNC.test(title) ? "senior" : "lead", strength: "strong", fresherWords };
    if (T_MANAGER_FUNC.test(title)) return { level: "mid", strength: "weak", fresherWords };
    return { level: "lead", strength: "weak", fresherWords };
  }
  if (T_SENIOR.test(title)) return { level: fresherStrong ? "fresher" : "senior", strength: "strong", fresherWords };

  const numeral = T_NUMERAL.exec(title);
  const numeralLevel = numeral ? (NUMERAL_LEVEL[(numeral[1] as string).toLowerCase()] ?? null) : null;
  const lMatch = T_L_LEVEL.exec(title);
  const lLevel = lMatch && !T_SUPPORT_TIER.test(title) ? (L_LEVEL[lMatch[1] as string] ?? null) : null;
  const explicit = numeralLevel ?? lLevel;
  if (explicit && explicit !== "entry") return { level: explicit, strength: "strong", fresherWords };
  if (fresherWords) return { level: "fresher", strength: fresherStrong ? "strong" : "weak", fresherWords };
  if (explicit) return { level: explicit, strength: "strong", fresherWords };
  if (T_MID.test(title)) return { level: "mid", strength: "strong", fresherWords };
  if (T_ENTRY.test(title)) return { level: "entry", strength: "strong", fresherWords };
  return { level: null, strength: "none", fresherWords };
}

/** Level implied only by years of experience (§0.4). */
export function levelFromYears(min: number | null | undefined, max: number | null | undefined, fresherWords = false): ExperienceLevel | null {
  const lo = typeof min === "number" && Number.isFinite(min) ? min : null;
  const hi = typeof max === "number" && Number.isFinite(max) ? max : null;
  if (lo === null && hi === null) return null;
  const top = hi ?? lo ?? 0;
  if (fresherWords && top <= 2) return "fresher";
  if (hi !== null) {
    if (hi <= 1) return "fresher";
    if (hi <= 2) return "entry";
    if (hi <= 5) return "mid";
    if (hi <= 8) return "senior";
    return "lead";
  }
  const from = lo ?? 0;
  if (from === 0) return fresherWords ? "fresher" : "entry";
  if (from < 2) return "entry";
  if (from < 5) return "mid";
  if (from < 8) return "senior";
  return "lead";
}

function isLevel(v: unknown): v is ExperienceLevel {
  return typeof v === "string" && (EXPERIENCE_LEVELS as readonly string[]).includes(v);
}

/**
 * Precedence (prompts.md §0.4): internship job type → explicit years range → structured hint →
 * title keywords → description keywords → default "entry" (low confidence).
 */
export function classifyLevelDetailed(levelInput: LevelInput): LevelResult {
  const input = bag(levelInput);
  const title = levelFromTitle(input.title);
  const description = asString(input.description);
  const descSample = description.length > 20_000 ? description.slice(0, 20_000) : description;
  const descLower = descSample.toLowerCase();
  const descFresher =
    descSample !== "" &&
    /fresher|grad|final|batch|campus|trainee|no\s+(?:prior\s+|previous\s+)?(?:work\s+)?experience|20\d\d/.test(descLower) &&
    D_FRESHER.test(descSample);
  const batches = Array.isArray(input.batches) ? input.batches : [];
  const tags = Array.isArray(input.tags) ? input.tags : [];
  const fresherWords = title.fresherWords || descFresher || batches.length > 0 || tags.includes("off-campus");

  if (input.jobType === "internship") return { level: "intern", confidence: "high", source: "job_type" };

  const fromYears = levelFromYears(input.experienceMin, input.experienceMax, fresherWords);
  const yearsFromDescription = input.experienceSource === "description";
  // Years can never say "executive": a Director/VP/Head title with ≥5 years stays executive.
  const execOverride = title.level === "executive" && (fromYears === "lead" || fromYears === "senior");

  // 1. Explicit years from a structured field, experienceRaw or the title.
  if (fromYears && !yearsFromDescription) {
    if (execOverride) return { level: "executive", confidence: "high", source: "title" };
    return { level: fromYears, confidence: "high", source: "years" };
  }
  // 2. Structured hint from the source.
  if (isLevel(input.hint)) return { level: input.hint, confidence: "high", source: "hint" };
  // 3. Years found only in the description: trusted unless a strong title disagrees
  //    ("Senior Software Engineer" + "2+ years with React" stays senior).
  if (fromYears) {
    if (execOverride) return { level: "executive", confidence: "high", source: "title" };
    if (title.strength === "strong" && title.level && title.level !== fromYears) {
      return { level: title.level, confidence: "medium", source: "title" };
    }
    return { level: fromYears, confidence: "medium", source: "years" };
  }
  // 4. Title keywords.
  if (title.level) return { level: title.level, confidence: title.strength === "strong" ? "high" : "medium", source: "title" };

  if (input.jobType === "apprenticeship") return { level: "fresher", confidence: "medium", source: "job_type" };
  if (descFresher || batches.length > 0) return { level: "fresher", confidence: "medium", source: "description" };
  if (descLower.includes("entry") && D_ENTRY.test(descSample)) return { level: "entry", confidence: "medium", source: "description" };

  return { level: "entry", confidence: "low", source: "default" };
}

export function classifyLevel(input: LevelInput): ExperienceLevel {
  return classifyLevelDetailed(input).level;
}
