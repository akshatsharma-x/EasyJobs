import { isLocationOnly } from "./locations";
import { bag, cleanLine, escapeRegExp, fold, keyOf, titleCase, truncateWords } from "./text";

/** Acronyms kept upper-case when an ALL-CAPS title is title-cased. */
const ACRONYMS = new Set(
  (
    "SDE SWE SDET SRE QA QC UI UX AI ML NLP LLM AWS GCP SAP SQL PHP API APIs HR HRBP IT BPO KPO MBA BBA BCA MCA CA CS " +
    "CEO CTO CFO COO CMO CIO CISO VP AVP SVP EVP GM BI ETL DBA ERP CRM SEO SEM SMM PPC PR US UK NCR GET PMO TPM APM " +
    "I II III IV V L1 L2 L3 L4 L5 L6 L7 R&D B2B B2C SaaS iOS MTS SME KYC AML GST TDS MIS EHS HSE MEP HVAC PLC SCADA " +
    "CAD CAM CNC VLSI FPGA ASIC RTL PCB RF ECE EEE CSE ESG FP&A IoT AR VR DevOps DevSecOps MLOps NOC SOC IAM GRC " +
    "BDE BDM BDR SDR KAM ASM RSM TSM CSR CSE TL AM PM PO BA DA DE DS FE BE"
  ).split(" "),
);

const SEP = String.raw`\s*[-–—|:,]\s*`;

const ROLE_WORD =
  /\b(?:engineer|developer|analyst|intern(?:ship)?|trainee|associate|executive|manager|designer|consultant|specialist|scientist|architect|lead|officer|assistant|administrator|admin|tester|programmer|accountant|writer|editor|marketer|recruiter|coordinator|representative|agent|technician|operator|sde|swe|sdet|qa|hr|sales|support|apprentice|fellow|researcher|teacher|tutor|nurse|doctor|pharmacist|driver|clerk|cashier|graduate|staff|head|director|vp|president|partner|owner|strategist|planner|advisor|counsel|lawyer|auditor|banker|economist|actuary|surveyor|draftsman|supervisor|mechanic|electrician|fitter|welder|machinist|controller|buyer|merchandiser|photographer|animator|illustrator|artist|producer|journalist|reporter|anchor|moderator|annotator|translator|coach|trainer|mentor|instructor|lecturer|professor|faculty|receptionist|secretary|telecaller|caller|bde|bdm|sdr|bdr|expert|member|ambassador|scholar|cook|chef|steward|guard|picker|packer|engineering|development|marketing|finance|operations|design|analytics|security|testing|consulting)\b/i;

const NOISE_PART: readonly RegExp[] = [
  /^(?:apply\s*(?:now|here|today|online|fast|soon|asap|link)?|click\s+here(?:\s+to\s+apply)?|register\s+now|link\s+inside|details\s+inside|check\s+(?:now|eligibility|details)|official\s+notification|full\s+details|read\s+more|more\s+details|job\s+details|how\s+to\s+apply|apply\s+before\s+.*|last\s+date.*|deadline.*)[!.]*$/i,
  /^(?:urgent(?:ly)?(?:\s+(?:hiring|requirement|opening|required))?|immediate\s+(?:joiners?|joining|hiring)|hiring(?:\s+now)?|now\s+hiring|we(?:'re|\s+are)\s+hiring|hot\s+job|new|latest|job\s+alert|hiring\s+alert|mega\s+(?:hiring|drive)|bulk\s+hiring)[!.]*$/i,
  /^(?:for\s+)?(?:freshers?|experienced|freshers?\s*(?:&|and|\/|or)\s*experienced)(?:\s+can\s+apply)?[!.]*$/i,
  /^(?:for\s+)?(?:(?:19|20)\d{2}(?:\s*(?:\/|,|&|and|or|-|–)\s*(?:(?:19|20)?\d{2})){0,8})\s*(?:batch(?:es)?|pass[\s-]?outs?|graduates?|grads?)?(?:\s+freshers?)?$/i,
  /^batch(?:es)?\s*(?:of\s*)?[:\-]?\s*(?:19|20)\d{2}.*$/i,
  /^(?:(?:b\.?\s?e|b\.?\s?tech|m\.?\s?tech|m\.?\s?e|bca|mca|b\.?\s?sc|m\.?\s?sc|mba|bba|b\.?\s?com|diploma|any\s+graduates?|graduates?|ug|pg)\s*[/,&]?\s*)+(?:freshers?)?$/i,
  /^(?:ctc|salary|package|stipend)?\s*[:\-]?\s*(?:₹|rs\.?|inr|\$)?\s*\d+(?:[.,]\d+)?\s*(?:-|to)?\s*\d*(?:[.,]\d+)?\s*(?:lpa|lakhs?|lacs?|k|per\s+month|\/\s*month|pm|p\.a\.?)(?:\s*\+.*)?$/i,
  /^(?:exp(?:erience)?\s*[:\-]?\s*)?\d+(?:\.\d+)?\s*(?:\+|-|–|to)?\s*\d*\s*(?:yrs?|years?)(?:\s*(?:exp|experience))?$/i,
  /^(?:remote|hybrid|on[\s-]?site|onsite|wfh|work\s+from\s+home|work\s+from\s+office|in[\s-]office)$/i,
];

const HEADLINE_NOISE =
  /\b(?:off[\s-]?campus|on[\s-]?campus|campus)\s+(?:drive|hiring|recruitment|placement|placements)s?\b|\b(?:recruitment|hiring|careers?|walk[\s-]?in(?:\s+drive)?|mega\s+drive|job\s+fair|drive)\s+(?:19|20)\d{2}\b|\b(?:is|are)\s+hiring\b|\bhiring\s+(?:now|alert|freshers?)\b|\bnow\s+hiring\b|\bwe(?:'re|\s+are)\s+hiring\b|\bjobs?\s+(?:for|in)\s+freshers?\b|\bfreshers?\s+jobs?\b|\brecruitment\s+drive\b|\boff[\s-]?campus\b/i;

const LEADING_NOISE: readonly RegExp[] = [
  // Specific phrases first: "Hiring Freshers as …" must not be reduced to "Freshers as …".
  /^(?:urgent(?:ly)?\s+)?hiring\s+freshers?\s+(?:as|for)\s+(?:an?\s+)?/i,
  /^freshers?\s+(?:hiring|required|wanted|needed|jobs?)?\s*(?:as|for)\s+(?:an?\s+)?/i,
  /^(?:urgent(?:ly)?\s+)?(?:hiring|required|requirement|opening|vacancy|vacancies|wanted)\b\s*(?:alert)?\s*[!:\-–—]*\s*(?:for\s+(?:the\s+)?(?:(?:role|post|position)\s+of\s+)?)?(?:an?\s+)?/i,
  /^urgent(?:ly)?\b\s*[!:\-–—]*\s*/i,
  /^we(?:'re|\s+are)\s+hiring\b\s*[!:\-–—]*\s*(?:for\s+)?(?:an?\s+)?/i,
  /^(?:job|career)\s+(?:alert|opening|opportunity)\b\s*[!:\-–—]*\s*(?:for\s+)?(?:an?\s+)?/i,
  /^(?:new\s+)?openings?\s+for\s+(?:an?\s+)?/i,
  /^(?:immediate|mega|bulk|mass)\s+(?:hiring|requirement|openings?)\b\s*[!:\-–—]*\s*(?:for\s+)?/i,
  /^hot\s+job\b\s*[!:\-–—]*\s*/i,
  /^walk[\s-]?in\s+(?:interview|drive)s?\b\s*(?:for\s+)?(?:the\s+)?(?:(?:role|post|position)\s+of\s+)?/i,
  /^(?:off[\s-]?campus|campus)\s+(?:drive|hiring|recruitment)\b\s*(?:(?:19|20)\d{2})?\s*(?:for\s+)?/i,
  /^looking\s+for\s+(?:an?\s+)?/i,
  /^hiring\s+freshers?\s+(?:as|for)\s+(?:an?\s+)?/i,
  /^freshers?\s+(?:hiring|required|wanted|needed|jobs?)\s*(?:as|for)?\s*/i,
  /^(?:job|role|position|title|designation)\s*:\s*/i,
  /^new\s*[!:\-–—]+\s*/i,
];

const TRAILING_NOISE: readonly RegExp[] = [
  /\s*[-–—|,:]?\s*[([]?\s*(?:apply\s+(?:now|here|today|online|fast|soon|asap)|urgent(?:ly)?(?:\s+hiring|\s+required|\s+requirement)?|immediate\s+joiners?(?:\s+(?:only|preferred))?|hiring\s+now|now\s+hiring|freshers?(?:\s+can\s+apply)?|for\s+freshers?|freshers?\s*(?:&|and|\/)\s*experienced|walk[\s-]?in(?:\s+(?:interview|drive))?)\s*[)\]]?\s*[!.]*$/i,
  /\s*[-–—|,:]?\s*[([]?\s*(?:remote|hybrid|on[\s-]?site|onsite|wfh|work\s+from\s+home|work\s+from\s+office|in[\s-]office|100%\s+remote|fully\s+remote)\s*[)\]]?\s*$/i,
  /\s*[-–—|,]\s*(?:ctc|salary|package|stipend)?\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*\d+(?:\.\d+)?\s*(?:-|to)?\s*\d*(?:\.\d+)?\s*(?:lpa|lakhs?|lacs?|k\s*\/\s*month|k|per\s+month|\/\s*month)\s*$/i,
  /\s*[-–—|,]\s*\d+(?:\.\d+)?\s*(?:\+|-|–|to)?\s*\d*\s*(?:yrs?|years?)(?:\s*(?:exp|experience))?\s*$/i,
  /\s*[!]+\s*$/,
];

const BATCH_ANYWHERE_G =
  /\s*[-–—|(,]?\s*(?:for\s+)?(?:(?:19|20)\d{2}(?:\s*(?:\/|,|&|and|or|-|–)\s*(?:(?:19|20)?\d{2})){0,8})\s+(?:batch(?:es)?|pass[\s-]?outs?|graduates?|grads?)\b\s*\)?/gi;
const BATCH_LABEL_G = /\s*[-–—|(,]?\s*batch(?:es)?\s*(?:of\s*)?[:\-]?\s*(?:19|20)\d{2}(?:\s*(?:\/|,|&|and|-|–)\s*(?:(?:19|20)?\d{2}))*\s*\)?/gi;
const EXP_PAREN_G = /\s*[([]\s*\d+(?:\.\d+)?\s*(?:\+|-|–|to)?\s*\d*\s*(?:yrs?|years?)(?:\s*(?:of\s+)?(?:exp|experience))?\s*[)\]]/gi;
const BRACKET_G = /\s*[([{]\s*([^()[\]{}]{1,60})\s*[)\]}]/g;

const COMPANY_RE_CACHE = new Map<string, readonly [RegExp, RegExp]>();
function companyRegexes(company: string): readonly [RegExp, RegExp] {
  let hit = COMPANY_RE_CACHE.get(company);
  if (!hit) {
    const c = escapeRegExp(company);
    hit = [
      new RegExp(
        String.raw`^${c}\s+(?:is\s+|are\s+)?(?:hiring|recruiting|recruitment|careers?|jobs?|off[\s-]?campus(?:\s+drive)?|walk[\s-]?in(?:\s+drive)?|internship\s+drive|mega\s+drive)\b(?:\s+(?:drive|20\d{2}|for|freshers?|as|of|an?))*(?:${SEP})?`,
        "i",
      ),
      new RegExp(String.raw`\s+(?:at|@)\s+${c}\s*$`, "i"),
    ] as const;
    if (COMPANY_RE_CACHE.size >= 2000) COMPANY_RE_CACHE.clear();
    COMPANY_RE_CACHE.set(company, hit);
  }
  return hit;
}

const LEADING_TRIGGER =
  /^(?:urgent|hiring|we|job|career|new|openings?|immediate|mega|bulk|mass|hot|walk|off|campus|looking|fresher|role|position|title|designation|required|requirement|vacanc|wanted)/i;
const TRAILING_TRIGGER =
  /(?:now|here|today|online|fast|soon|asap|urgent\w*|hiring|required|requirement|joiners?|only|preferred|freshers?|apply|experienced|walk[\s-]?in|interview|drive|remote|hybrid|site|onsite|wfh|home|office|lpa|lakhs?|lacs?|month|k|yrs?|years?|exp|experience|!)[\s)\].!]*$/i;

function isNoisePart(part: string, companyKeys: ReadonlySet<string>): boolean {
  const p = part.trim().replace(/^[\s\-–—|:,.!]+|[\s\-–—|:,!]+$/g, "");
  if (!p) return true;
  if (NOISE_PART.some((re) => re.test(p))) return true;
  if (companyKeys.has(keyOf(p))) return true;
  if (HEADLINE_NOISE.test(p) && !ROLE_WORD.test(p.replace(HEADLINE_NOISE, " "))) return true;
  if (isLocationOnly(p)) return true;
  return false;
}

function stripRepeated(s: string, rules: readonly RegExp[]): string {
  let out = s;
  for (let i = 0; i < 4; i++) {
    const before = out;
    for (const re of rules) out = out.replace(re, "");
    out = out.trim();
    if (out === before) break;
  }
  return out;
}

export interface CleanTitleOptions {
  /** Company name(s): strips "<Company> is hiring …", "| <Company>", "at <Company>". */
  company?: string | readonly (string | null | undefined)[] | null;
}

/**
 * Display title without aggregator noise: "Hiring!!", "Urgent", "Off Campus Drive 2026", "| Apply Now",
 * batch/experience/salary/location/work-mode suffixes and emoji. Never returns an empty string for
 * non-empty input (falls back to the lightly cleaned original).
 */
export function cleanTitle(input: unknown, opts: CleanTitleOptions = {}): string {
  const original = cleanLine(input).slice(0, 1000);
  if (!original) return "";
  const companies = [...new Set((Array.isArray(opts.company) ? opts.company : [opts.company]).map((c) => cleanLine(c)).filter(Boolean))];
  const companyKeys = new Set(companies.map((c) => keyOf(c)));
  let t = original.replace(/[!?]{2,}/g, "!").replace(/\s*[|•·]\s*/g, " | ").replace(/\s+[-–—]\s+/g, " – ");

  // Bracketed noise: [Urgent], (Apply Now), (Remote), (2025 Batch), (0-2 yrs), (Bangalore)
  t = t.replace(BRACKET_G, (m, inner: string) => (isNoisePart(inner, companyKeys) || /^\d+(?:\.\d+)?\s*(?:\+|-|–|to)?\s*\d*\s*(?:yrs?|years?)/i.test(inner) ? " " : m));

  // Split on " | " / " – " and drop parts that are pure noise.
  const parts = t.split(/\s+\|\s+|\s+–\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const kept = parts.filter((p) => !isNoisePart(p, companyKeys));
    const withRole = kept.filter((p) => ROLE_WORD.test(p));
    t = (kept.length > 0 ? kept : withRole.length > 0 ? withRole : parts).join(" - ");
  }

  // "<Company> is hiring (for) …", "<Company> Off Campus Drive 2026 for …", "<Company> Hiring …"
  for (const company of companies) {
    if (!t.toLowerCase().includes(company.toLowerCase())) continue;
    const [prefixRe, suffixRe] = companyRegexes(company);
    t = t.replace(prefixRe, "").replace(suffixRe, "");
  }
  t = t.replace(/^\S+(?:\s+\S+){0,3}\s+(?:is|are)\s+hiring\b\s*(?:for\s+)?(?:the\s+)?(?:(?:role|post|position)\s+of\s+)?(?:an?\s+)?/i, "");
  if (LEADING_TRIGGER.test(t) && !/^hiring\s+(?:manager|lead|partner|specialist|coordinator|assistant|executive)\b/i.test(t)) {
    t = stripRepeated(t, LEADING_NOISE);
  }
  if (/(?:19|20)\d{2}/.test(t)) t = t.replace(BATCH_ANYWHERE_G, " ").replace(BATCH_LABEL_G, " ");
  if (/yrs?|years?/i.test(t)) t = t.replace(EXP_PAREN_G, " ");
  if (TRAILING_TRIGGER.test(t)) t = stripRepeated(t, TRAILING_NOISE);

  // Trailing "- Bangalore" / ", Pune" / " in Hyderabad".
  const loc = /^(.*\S)\s*(?:[-–—|,:]|\s(?:in|at)\s)\s*([^-–—|,:]+)$/i.exec(t);
  if (loc && ROLE_WORD.test(loc[1] as string) && isLocationOnly(loc[2] as string)) t = loc[1] as string;

  t = t
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—|:,.!]+|[\s\-–—|:,!]+$/g, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .trim();
  if (/[A-Z]/.test(t) && !/[a-z]/.test(t) && t.replace(/[^A-Z]/g, "").length >= 4) t = titleCase(t, ACRONYMS);
  if (t.length < 2) {
    t = original.replace(/^[\s\-–—|:,.!]+|[\s\-–—|:,!]+$/g, "");
    if (/[A-Z]/.test(t) && !/[a-z]/.test(t) && t.length >= 4) t = titleCase(t, ACRONYMS);
  }
  return truncateWords(t, 200);
}

const KEY_SYNONYMS: readonly (readonly [RegExp, string])[] = [
  [/\bsr\b|\bsnr\b/g, "senior"],
  [/\bjr\b/g, "junior"],
  [/\bsde\b/g, "software development engineer"],
  [/\bswe\b/g, "software engineer"],
  [/\bmgr\b/g, "manager"],
  [/\beng\b|\bengg\b/g, "engineer"],
  [/\bdev\b/g, "developer"],
  [/\bexec\b/g, "executive"],
  [/\bassoc\b/g, "associate"],
  [/\bfront\s+end\b/g, "frontend"],
  [/\bback\s+end\b/g, "backend"],
  [/\bfull\s+stack\b/g, "fullstack"],
  [/\b1\b/g, "i"],
  [/\b2\b/g, "ii"],
  [/\b3\b/g, "iii"],
  [/\binternship\b/g, "intern"],
];

/** Normalized title for dedupe keys: "Sr. Software Engineer - Backend (Remote)" → "senior software engineer backend". */
export function titleKey(title: unknown, opts: { alreadyClean?: boolean } = {}): string {
  let k = fold(bag(opts).alreadyClean === true ? cleanLine(title) : cleanTitle(title))
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
  for (const [re, rep] of KEY_SYNONYMS) k = k.replace(re, rep);
  return k.replace(/\s+/g, " ").trim();
}
