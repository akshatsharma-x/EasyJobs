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
  /** Company name: banks use "Vice President" as a corporate grade. */
  company?: string | null;
}

export interface LevelResult {
  level: ExperienceLevel;
  confidence: Confidence;
  source: "job_type" | "years" | "hint" | "title" | "description" | "default";
}

/* ─────────────────────────── Title vocabulary ─────────────────────────── */

const T_INTERN =
  /\b(?:intern(?:ship)?s?|summer\s+(?:analyst|associate|intern(?:ship)?|trainee)|winter\s+intern(?:ship)?|co[\s-]?op(?:\s+student)?|industrial\s+trainee|intern[\s-]+trainee|trainee[\s-]+intern|campus\s+ambassador|student\s+ambassador|student\s+(?:developer|researcher|assistant)|working\s+student|werkstudent(?:in)?|stagiaire|praktikum|praktikant(?:in)?|pflichtpraktikum|estágio|estagio|estagiári[oa]|estagiari[oa]|prácticas|practicas|becari[oa]|tirocinio|stagista|pasant(?:e|ía|ia)|stażysta|stażystka)\b/i;

const T_EXEC =
  /\b(?:chief\s+[a-z&]+(?:\s+[a-z&]+){0,2}\s+officer|chief\s+of\s+staff|c[a-z]?o\s*\/\s*founder|(?<!\b(?:assistant|associate|asst\.?)\s+)vice[\s-]+president|(?<!associate\s|assistant\s)vp\b|[rgcd]vp\b|svp|evp|diretora?|directeur|directrice|direttore|direktor(?:in)?|(?:managing|executive|associate|senior|group)\s+director(?:a|es|s)?\b|director(?:a|es|s)?\b|head\s+(?:of\b|[-–—,:])|general\s+manager|country\s+(?:leader|manager|director|lead)\b|(?<!vice[\s-]+)president|co[\s-]?founder|(?:managing|senior|equity|associate)\s+partner(?!\s+(?:sales|solutions?|success|development|engineer\w*|manager|marketing|ecosystem|alliances?|programs?|operations|enablement|accounts?|channel|integrations?|relations|technical|support|onboarding|network|experience|partnerships?)\b))/i;
const T_CXO = /(?<!\b(?:to|of|for|with)\s(?:the\s)?)\b(?:ceo|cto|cfo|coo|cmo|cio|ciso|chro|cpo|cro|cdo|cxo)\b(?!\s+(?:audiences?|personas?|buyers?|customers?|clients?|relations|engagement|events?|programs?|councils?|forums?|summits?|briefings?|marketing|advisory)\b)/i;
const T_DEPT_HEAD =
  /\b(?:department|dept|team|branch|region|regional|zone|zonal|area|city|state|circle|territory|location|cluster|business|unit|sales|marketing|hr|finance|engineering|product|design|operations|ops|growth|tech|technology|it|qa|delivery|program|project|category|brand|content|legal|admin|procurement|plant|site|country|practice|vertical)\s+head\b/i;

/**
 * Banks grade staff as "Vice President" (≈ 8+ years, not an executive): "Vice President, Full-Stack Engineer",
 * "Liquidity Controller, Vice President", "SVP, Principal Python Engineer". A (senior) VP paired with an individual
 * role is that grade → lead.
 */
const T_VP_GRADE = /(?<!\b(?:executive|assistant|associate|asst\.?|group|regional|area|corporate)\s+)\b(?:vice[\s-]+president|s?vp)\b(?!\s+(?:of|for)\b)/gi;
const T_IC_ROLE =
  /\b(?:engineer|developer|programmer|analyst|controller|architect|scientist|specialist|consultant|designer|administrator|auditor|accountant|officer|lead|manager|strategist|trader|underwriter|counsel|modell?er|quant|researcher)\b/i;
/** Banks and asset managers where "Vice President" is a corporate grade (≈ 6–12 years), not an executive. */
const VP_GRADE_COMPANY =
  /\b(?:bny|bank|banco|jp\s?morgan|j\.\s?p\.\s?morgan|chase|citi(?:group|bank)?|goldman\s+sachs|morgan\s+stanley|barclays|hsbc|ubs|nomura|deutsche|wells\s+fargo|state\s+street|northern\s+trust|blackrock|standard\s+chartered|icapital|jefferies|credit\s+suisse|mizuho|mufg|smbc|bnp\s+paribas|soci[ée]t[ée]\s+g[ée]n[ée]rale|natixis|macquarie|american\s+express|fidelity|invesco|franklin\s+templeton|nuveen|pimco|kotak|axis|icici|yes\s+bank|indusind|chubb)\b/i;
function isVpGrade(title: string, company = ""): boolean {
  const rest = title.replace(T_VP_GRADE, " ");
  if (rest === title) return false;
  if (VP_GRADE_COMPANY.test(company) && !T_EXEC.test(rest) && !T_CXO.test(rest) && !T_DEPT_HEAD.test(rest) && !/\bs?vp\b|vice[\s-]+president/i.test(rest)) return true;
  if (/(?<!\b(?:associate|assistant)\s+)\bgeneral\s+counsel\b/i.test(rest)) return false; // "VP & Deputy General Counsel"
  return T_IC_ROLE.test(rest) && !T_EXEC.test(rest) && !T_CXO.test(rest) && !T_DEPT_HEAD.test(rest);
}

/** Explicit individual-contributor grades (Oracle and others): "IC5 - Director, Federal Deployment Strategist", "[IC4]". */
const T_IC_GRADE = /(?:^|[\s[(,|/-])IC\s?([1-6])(?![\w.])/;
const IC_LEVEL: Record<string, ExperienceLevel> = { "1": "entry", "2": "mid", "3": "senior", "4": "lead", "5": "lead", "6": "lead" };
/** "Executive Assistant to VP, Cloud": supports an executive, isn't one. */
const T_ASSISTANT_TO = /\b(?:executive|personal|administrative|admin|office|chief\s+of\s+staff\s+and)\s+assistant\b|\bassistant\s+to\b|\b(?:ea|pa)\s+to\b/i;
/** "AMS Device Manager Product Engineer": "Manager" is part of a product name when another role follows it. */
const T_MANAGER_PRODUCT = /\bmanager\s+(?:product\s+)?(?=(?:engineer|developer|tester|analyst|administrator|consultant|architect|specialist)s?\b)/gi;

const T_LEAD_GEN = /\blead\s*(?:gen(?:eration)?|qualification|management|nurtur\w*)\b|\bleads\b/i;
const T_LEAD =
  /\b(?:senior\s+staff|principle\s+(?:[a-z&/-]+\s+){0,2}(?:engineer|developer|architect|scientist|consultant|designer|analyst|manager)|chief\s+(?:[a-z&/-]+\s+){0,3}(?:expert|engineer|architect|scientist|technologist)|team\s*leiter(?:in)?|staff\s+(?:[a-z&/-]+\s+){0,3}(?:engineer|designer|scientist|developer|architect|researcher)|staff\s+(?:software|engineer|data|machine|ml|research|product|designer|frontend|front[\s-]end|backend|back[\s-]end|full[\s-]?stack|site|security|developer|scientist|applied|platform|infrastructure|systems|ai|ux|ui|analyst|technical|tech|architect|sre|devops|cloud|mobile|ios|android|qa|test)|principal|distinguished|fellow|architects?|lead|avp|assistant\s+vice\s+president|associate\s+vice\s+president|group\s+product\s+manager)\b/i;
const T_MANAGER = /\bmanager\b|\bmgr\b|\bgerente\b/i;
/** Portuguese / Spanish functional managers ("Gerente de Projetos" = project manager). */
const T_GERENTE_FUNC =
  /\bgerente\s+de\s+(?:projetos?|proyectos?|produtos?|productos?|contas|cuentas|vendas|ventas|marketing|opera[cç](?:[õo]es|iones)|loja|tienda|tecnologia|ti)\b/i;
/** People managers of engineers / scientists: "Engineering Manager", "Manager, Software Engineering" (≈ 6+ years). */
const T_ENG_MANAGER =
  /(?<!\b(?:business|partner|sales|market|channel|product|corporate|brand|community|program(?:me)?|project)\s+)\b(?:engineering|software\s+(?:development|engineering)|software|data\s+science|machine\s+learning|ml|qa|quality\s+engineering|test\s+engineering|sre|devops)\s+manager\b|\bmanager,?\s+(?:of\s+)?(?:software\s+)?engineering\b/i;
const T_MANAGER_MID = /\b(?:assistant|asst\.?|deputy|associate)\s+manager\b|\bam\s*[-–]/i;
const T_MANAGER_ENTRY = /\b(?:associate|junior|jr\.?)\s+product\s+manager\b|\bapm\b/i;
const T_MANAGER_FUNC =
  /\b(?:product|program|programs|programme|project|partner\s+development|account|accounts|relationship|territory|area|sales|social\s+media|community|content|brand|campaign|store|office|customer\s+success|client\s+success|key\s+account|category|marketing|digital\s+marketing|seo|partnership|partnerships|partner|business\s+development|bd|event|events|operations|ops|audit|branch|channel|alliance|growth|performance\s+marketing|e-?commerce|merchandising|procurement|purchase|purchasing|admin|administrative|facility|facilities|hr|talent|recruitment|payroll|accounts\s+payable|credit|collections?|retail|showroom|restaurant|hotel|floor|shift|warehouse|logistics|supply\s+chain|inventory|quality|safety|compliance|grc|risk|tax|treasury|finance|fp&a|pricing|insights?|research|training|learning|delivery|release|service|support|technical\s+support|it|network|data|analytics|engineering\s+project|construction|site|production|plant|maintenance)\s+manager\b/i;

const T_SENIOR = /\b(?:senior|sr\.?|snr\.?)(?=\s|$|[-–—,(/])/i;
const T_MID = /\b(?:mid[\s-]?(?:level|senior|weight)|intermediate|experienced\s+(?:hire|professional))\b/i;
const T_ENTRY = /\b(?:junior|jr\.?|entry[\s-]?level|associate)\b/i;

const T_NUMERAL =
  /\b(?:sde|swe|sdet|sre|software\s+(?:development\s+)?engineer|engineer|developer|analyst|scientist|consultant|associate|programmer|designer|specialist|technician|administrator|member\s+of\s+technical\s+staff|mts|smts|sde\s*\/\s*swe)\s*[-–,]?\s*(iv|v|i{1,3}|[1-5])(?![\w.])/i;
/** "Field Service Technician - Level II" (a grade), not "Level 2 Support" (a support tier). */
const T_LEVEL_WORD =
  /\blevel\s*[-–]?\s*(iv|v|i{1,3}|[1-5])(?![\w.])(?!\s*(?:support|help\s*desk|helpdesk|service\s+desk|technical\s+support|noc|soc|it\s+support)\b)/i;
const T_L_LEVEL = /(?:^|[\s,(\[/|-])l\s*[-–]?\s*([3-7])(?![\w.])/i;
const T_SUPPORT_TIER =
  /\b(?:support|helpdesk|help\s+desk|service\s+desk|desktop|noc|soc|operations|resolver|technician|network|l1|l2|tier|customer|technical\s+support|it\s+support)\b/i;

const T_FRESHER_STRONG =
  /\b(?:freshers?|new\s+grad(?:uate)?s?|recent\s+grad(?:uate)?s?|graduate\s+engineer(?:ing)?\s+trainee|graduate\s+trainee|management\s+trainee|engineer(?:ing)?\s+trainee|trainee|apprentice(?:ship)?|university\s+(?:graduate|grad|hire|hiring)|early[\s-]?careers?|graduate\s+(?:program(?:me)?|scheme|hire|role|analyst|associate|engineer|software\s+engineer|developer|consultant)|20\d{2}\s*(?:batch|grad(?:uate)?s?|pass[\s-]?outs?)|batch\s*(?:of\s*)?20\d{2})\b/i;
const T_GET = /\bGET\b/;
const T_CAMPUS = /\b(?:campus|off[\s-]?campus|on[\s-]?campus|university\s+program|college\s+(?:hire|hiring|graduates?))\b/i;
const T_CAMPUS_HR =
  /\b(?:campus|university|college)\s+(?:recruit(?:er|ing|ment)?|relations|relationship|engagement|talent|hiring\s+(?:manager|lead|partner|specialist|coordinator|executive))/i;

const T_RECRUITING_ROLE =
  /\b(?:talent\s+acquisition|recruit(?:er|ers|ing|ment)|sourcer|sourcing\s+(?:specialist|partner|lead)|university\s+relations|campus\s+relations|employer\s+brand(?:ing)?|talent\s+partner|(?:early[\s-]?careers?|campus|university|graduate|emerging\s+talent)\s+program(?:me)?\s+(?:manager|lead|coordinator|specialist|partner))\b/i;

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

/** Employer boilerplate: "Whether you're an established professional … or a recent graduate, you'll find …" (Emerson). */
const WHETHER_YOU = /\bwhether\s+you(?:['’]re|\s+are)\b[^.!?]*[.!?]?/gi;
/** Negated fresher phrases: "we're not currently looking for new grad folks", "freshers need not apply". */
const NEGATED_FRESHER =
  /\b(?:not|n['’]t|no)\b[^.!?\n]{0,40}?\b(?:new\s+grad\w*|recent\s+grad\w*|freshers?|campus|graduates?)\b|\bfreshers?\s+(?:need\s+not|should\s+not|must\s+not|cannot|can['’]t|won['’]t|will\s+not|are\s+not)\b/gi;

/** Level implied by the title alone (no years, no hints). */
export function levelFromTitle(titleInput: unknown, opts: { company?: string | null } = {}): TitleLevel {
  // "Assistant Manager_Active Directory": "_" is a word character, so it would hide word boundaries.
  const title = asString(titleInput).slice(0, 1000).replace(/_/g, " ");
  if (!title.trim()) return { level: null, strength: "none", fresherWords: false };
  // "Talent Acquisition Specialist, Early Careers" recruits freshers; it isn't a fresher job.
  const recruiting = T_RECRUITING_ROLE.test(title);
  const campus = T_CAMPUS.test(title) && !T_CAMPUS_HR.test(title) && !recruiting;
  const fresherStrong = !recruiting && (T_FRESHER_STRONG.test(title) || T_GET.test(title));
  const fresherWords = fresherStrong || campus;

  if (T_INTERN.test(title)) return { level: "intern", strength: "strong", fresherWords };
  const icGrade = T_IC_GRADE.exec(title);
  if (icGrade) return { level: IC_LEVEL[icGrade[1] as string] ?? "senior", strength: "strong", fresherWords };
  if (isVpGrade(title, asString(opts.company))) return { level: "lead", strength: "strong", fresherWords };
  const assistant = T_ASSISTANT_TO.test(title);
  // "Art Director" is a senior creative role, not an executive (stated years decide).
  if (/\b(?:associate\s+)?art\s+director\b/i.test(title) && !/\b(?:executive|group|senior)\s+art\s+director\b|\bhead\b/i.test(title)) {
    return { level: /\bassociate\s+art\s+director\b/i.test(title) ? "mid" : "senior", strength: "weak", fresherWords };
  }
  if (!assistant && ((T_EXEC.test(title) && !/\bfounder'?s?\s+office\b/i.test(title)) || T_CXO.test(title) || T_DEPT_HEAD.test(title))) {
    return { level: "executive", strength: "strong", fresherWords };
  }
  const lead = T_LEAD.test(title) && !(T_LEAD_GEN.test(title) && !/\b(?:team|tech|technical)\s+lead\b/i.test(title));
  if (lead) {
    // "Solutions Architect" / "Commercial Outcomes Architect" span 3–15 years: weak unless qualified, so stated years decide.
    const architectOnly = /\barchitect\b/i.test(title) && !T_LEAD.test(title.replace(/\barchitect\b/gi, " "));
    const qualified = /\b(?:principal|chief|enterprise|senior|sr\.?|lead|staff|distinguished)\s+(?:[\w-]+\s+){0,2}architect\b/i.test(title);
    return { level: fresherStrong ? "fresher" : "lead", strength: architectOnly && !qualified ? "weak" : "strong", fresherWords };
  }
  if (T_MANAGER.test(title.replace(T_MANAGER_PRODUCT, " "))) {
    if (fresherStrong) return { level: "fresher", strength: "strong", fresherWords };
    if (T_MANAGER_ENTRY.test(title)) return { level: "entry", strength: "strong", fresherWords };
    if (T_ENG_MANAGER.test(title) && !T_MANAGER_MID.test(title) && !/\b(?:engineering\s+project|project|program(?:me)?|product)\s+manager\b/i.test(title)) {
      return { level: "lead", strength: "strong", fresherWords };
    }
    // "Deputy/Assistant Manager" spans 3–10 years in Indian corporate grades: weak, so stated years can decide.
    if (T_MANAGER_MID.test(title)) return { level: "mid", strength: "weak", fresherWords };
    const functional = T_MANAGER_FUNC.test(title) || T_GERENTE_FUNC.test(title);
    // "Senior Mortgage Closing Manager" names a function → senior; a bare "Senior Manager, Finance" is the grade above → lead.
    const seniorFunction = /\b(?:senior|sr\.?|snr\.?)\s+(?!manager\b)[\w&/-]+(?:\s+[\w&/-]+){0,3}\s+manager\b/i.test(title);
    if (T_SENIOR.test(title)) return { level: functional || seniorFunction ? "senior" : "lead", strength: "strong", fresherWords };
    if (functional) return { level: "mid", strength: "weak", fresherWords };
    return { level: "lead", strength: "weak", fresherWords };
  }
  // Consulting / Big-4 grade: "Senior Associate" is 2–5 years (mid), not senior.
  if (/\bsenior\s+associate\b(?!\s+(?:director|partner|principal|vice))/i.test(title)) return { level: "mid", strength: "weak", fresherWords };
  if (T_SENIOR.test(title)) return { level: fresherStrong ? "fresher" : "senior", strength: "strong", fresherWords };
  // SaaS sales ladder: Enterprise / Strategic / Major AEs carry the biggest accounts (≈ 5+ years); Mid-Market ≈ 3.
  if (/\b(?:enterprise|strategic|major|named|global)\s+(?:accounts?\s+executive|ae)\b/i.test(title)) return { level: "senior", strength: "weak", fresherWords };
  if (/\bmid[\s-]?market\s+(?:accounts?\s+executive|ae)\b/i.test(title)) return { level: "mid", strength: "weak", fresherWords };

  const numeral = T_NUMERAL.exec(title);
  const numeralLevel = numeral ? (NUMERAL_LEVEL[(numeral[1] as string).toLowerCase()] ?? null) : null;
  const lMatch = T_L_LEVEL.exec(title);
  const lLevel = lMatch && !T_SUPPORT_TIER.test(title) ? (L_LEVEL[lMatch[1] as string] ?? null) : null;
  const levelWord = T_LEVEL_WORD.exec(title);
  const levelWordLevel = levelWord ? (NUMERAL_LEVEL[(levelWord[1] as string).toLowerCase()] ?? null) : null;
  const explicit = numeralLevel ?? lLevel ?? levelWordLevel;
  if (explicit && explicit !== "entry") return { level: explicit, strength: "strong", fresherWords };
  if (fresherWords) return { level: "fresher", strength: fresherStrong ? "strong" : "weak", fresherWords };
  if (explicit) return { level: explicit, strength: "strong", fresherWords };
  if (T_MID.test(title)) return { level: "mid", strength: "strong", fresherWords };
  // "Associate" is ambiguous ("Associate Engineer" vs "Associate General Counsel"): weak, so stated years can decide.
  if (T_ENTRY.test(title)) {
    return { level: "entry", strength: /\b(?:junior|jr\.?|entry[\s-]?level)\b/i.test(title) ? "strong" : "weak", fresherWords };
  }
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
    // A wide band ("2-10 years", "2-6 years", "0-3 years") is classified by its middle, not its top.
    const band = lo !== null && hi - lo >= 3 ? (lo + hi) / 2 : hi;
    if (band <= 1) return (lo ?? 0) >= 1 ? "entry" : "fresher"; // "1 year of experience" (1–1) is not 0 yrs
    if (band <= 2) return "entry";
    if (band <= 5) return "mid";
    if (band <= 8) return "senior";
    return "lead";
  }
  const from = lo ?? 0;
  if (from === 0) return fresherWords ? "fresher" : "entry";
  if (from < 2) return "entry";
  if (from < 5) return "mid";
  if (from < 8) return "senior";
  return "lead";
}

const LADDER: readonly ExperienceLevel[] = ["intern", "fresher", "entry", "mid", "senior", "lead", "executive"];

function isLevel(v: unknown): v is ExperienceLevel {
  return typeof v === "string" && (EXPERIENCE_LEVELS as readonly string[]).includes(v);
}

/**
 * Precedence (prompts.md §0.4): internship job type → explicit years range → structured hint →
 * title keywords → description keywords → default "entry" (low confidence).
 */
export function classifyLevelDetailed(levelInput: LevelInput): LevelResult {
  const input = bag(levelInput);
  const title = levelFromTitle(input.title, { company: asString(input.company) });
  const description = asString(input.description);
  const descSample = description.length > 20_000 ? description.slice(0, 20_000) : description;
  const descLower = descSample.toLowerCase();
  const descFresher =
    descSample !== "" &&
    /fresher|grad|final|batch|campus|trainee|no\s+(?:prior\s+|previous\s+)?(?:work\s+)?experience|20\d\d/.test(descLower) &&
    D_FRESHER.test(descSample.replace(WHETHER_YOU, " ").replace(NEGATED_FRESHER, " "));
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
  //    Sources over-use "executive" ("Account Manager", "Retail Associate", "Process Engineer" on SmartRecruiters,
  //    Workable, Greenhouse custom fields): it counts only when the title agrees.
  //    Broad labels ("Mid-Senior level") arrive as "mid": stated years that point higher win unless the title agrees.
  const climbs =
    (input.hint === "mid" || input.hint === "senior") &&
    fromYears !== null &&
    LADDER.indexOf(fromYears) > LADDER.indexOf(input.hint) &&
    !(title.strength === "strong" && title.level === input.hint);
  if (isLevel(input.hint) && (input.hint !== "executive" || title.level === "executive") && !climbs) {
    return { level: input.hint, confidence: "high", source: "hint" };
  }
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
