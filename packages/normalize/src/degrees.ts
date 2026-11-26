import { asString, asStringList, cleanLine } from "./text";

// Canonical degree labels (display order) live in the contract (1.1) so scrapers, normalize and the UI share them.
import { DEGREES, type Degree } from "@easyjobs/contract";
export { DEGREES, type Degree };

const DEG = String.raw`(?:B\.?\s?Tech|M\.?\s?Tech|BCA|MCA|B\.?\s?Sc|M\.?\s?Sc|MBA|BBA|B\.?\s?Com|M\.?\s?Com|Diploma|B\.\s?E|M\.\s?E|BE|ME)`;
const DEGREE_NEAR_BEFORE = new RegExp(String.raw`${DEG}\s*(?:\/|,|or|&)\s*$`, "i");
const DEGREE_NEAR_AFTER = new RegExp(String.raw`^\s*(?:\/|,|or|&)\s*${DEG}\b`, "i");
const STRONG_AFTER =
  /^\s*(?:in\s+(?:cs|cse|it|ece|eee|mech|civil|computer|electronics|electrical|mechanical|any|engineering|relevant|information)|degree|\(\s*(?:cs|cse|it|ece|eee|mech|civil|computer|any)|-\s*(?:cse|it|ece|eee|mech|civil)\b|graduates?|freshers?|students?|candidates?|pass[\s-]?outs?)/i;
const QUAL_BEFORE = /(?:qualifications?|eligib\w*|education(?:al)?(?:\s+qualification)?|degree|course)\s*[:\-–]?\s*$/i;

interface DegreeRule {
  degree: Degree;
  re: RegExp;
  /** Trigger keys (see triggerKey) that can produce this degree; the regex only runs when one was seen. */
  keys: readonly string[];
  /** Upper-case short forms that are also words ("BE", "ME", "MS", "BS", "BA") need degree context. */
  needsContext?: boolean;
}

const RULES: readonly DegreeRule[] = [
  { degree: "B.E/B.Tech", re: /\bB\.\s?E\b\.?|\bB\.?\s?Tech\b|\bBTech\b|\bbachelor(?:'s)?\s+(?:of|in)\s+(?:engineering|technology)\b|\bB[\s.-]?Tech\b/gi, keys: ["be", "btech", "bachelor"] },
  { degree: "B.E/B.Tech", re: /\bBE\b/g, needsContext: true, keys: ["be"] },
  { degree: "M.E/M.Tech", re: /\bM\.\s?E\b\.?|\bM\.?\s?Tech\b|\bMTech\b|\bmaster(?:'s)?\s+(?:of|in)\s+(?:engineering|technology)\b/gi, keys: ["me", "mtech", "master"] },
  { degree: "M.E/M.Tech", re: /\bME\b/g, needsContext: true, keys: ["me"] },
  { degree: "BCA", re: /\bBCA\b|\bbachelor(?:'s)?\s+(?:of|in)\s+computer\s+applications?\b/gi, keys: ["bca", "computerapplication"] },
  { degree: "MCA", re: /\bMCA\b|\bmaster(?:'s)?\s+(?:of|in)\s+computer\s+applications?\b/gi, keys: ["mca", "computerapplication"] },
  { degree: "B.Sc", re: /\bB\.?\s?Sc\b\.?|\bbachelor(?:'s)?\s+(?:of|in)\s+science\b|\bB\.S\.(?=\s|$|[,/])/gi, keys: ["bsc", "bs", "bachelor"] },
  { degree: "B.Sc", re: /\bBS\b(?=\s*(?:\/\s*MS|in\b|degree|,\s*MS|or\s+MS))/g, keys: ["bs"] },
  { degree: "M.Sc", re: /\bM\.?\s?Sc\b\.?|\bmaster(?:'s)?\s+(?:of|in)\s+science\b|\bM\.S\.(?=\s|$|[,/])/gi, keys: ["msc", "ms", "master"] },
  { degree: "M.Sc", re: /(?<=\bBS\s*\/\s*|\bB\.?Sc\s*\/\s*)MS\b|\bMS\b(?=\s+(?:in|degree)\b|\s*(?:\/|,|or)\s*(?:Ph\.?D|M\.?Tech))/g, keys: ["ms"] },
  { degree: "BBA", re: /\bBBA\b|\bBBM\b|\bbachelor(?:'s)?\s+(?:of|in)\s+business\s+(?:administration|management)\b/gi, keys: ["bba", "bbm", "bachelor", "businessadministration"] },
  { degree: "MBA", re: /\bMBA\b|\bPGDM\b|\bPGDBM\b|\bPGDBA\b|\bmaster(?:'s)?\s+(?:of|in)\s+business\s+administration\b|\bpost\s*graduate\s+diploma\s+in\s+management\b/gi, keys: ["mba", "pgdm", "pgdbm", "pgdba", "master", "businessadministration", "postgraduate"] },
  { degree: "B.Com", re: /\bB\.\s?(?:Com|COM|com)\b(?!\w)|\bB\s?(?:Com|COM)\b(?!\w)|\b[Bb]achelor(?:'s)?\s+(?:of|in)\s+[Cc]ommerce\b/g, keys: ["bcom", "bachelor", "commerce"] },
  { degree: "M.Com", re: /\bM\.\s?(?:Com|COM|com)\b(?!\w)|\bM\s?(?:Com|COM)\b(?!\w)|\b[Mm]aster(?:'s)?\s+(?:of|in)\s+[Cc]ommerce\b/g, keys: ["mcom", "master", "commerce"] },
  { degree: "BA", re: /\bB\.\s?A\b\.?(?!\w)|\bbachelor(?:'s)?\s+(?:of|in)\s+arts\b/gi, keys: ["ba", "bachelor"] },
  { degree: "BA", re: /\bBA\b(?=\s*(?:\/|,)\s*(?:B\.?\s?Com|BBA|B\.?\s?Sc|BCA))|(?<=(?:B\.?\s?Com|BBA|B\.?\s?Sc|BCA)\s*(?:\/|,)\s*)BA\b/g, keys: ["ba"] },
  { degree: "MA", re: /\bM\.\s?A\b\.?(?!\w)|\bmaster(?:'s)?\s+(?:of|in)\s+arts\b/gi, keys: ["ma", "master"] },
  { degree: "Diploma", re: /\bdiploma\b(?!\s+in\s+management)|\bpolytechnic\b/gi, keys: ["diploma", "polytechnic"] },
  { degree: "PhD", re: /\bPh\.?\s?D\b\.?|\bdoctorate\b|\bdoctoral\s+degree\b/gi, keys: ["phd", "doctor"] },
  { degree: "Any graduate", re: /\bany\s+(?:graduate|graduation|degree|bachelor'?s?(?:\s+degree)?|stream|discipline)\b|\bgraduates?\s+(?:from|of|in)\s+any\s+(?:stream|discipline|field|branch)\b|\bgraduation\s+in\s+any\b|\ball\s+(?:streams|graduates)\b|\bany\s+UG\b/gi, keys: ["any"] },
  { degree: "Any postgraduate", re: /\bany\s+(?:post\s*graduat\w*|pg|master'?s?(?:\s+degree)?)\b|\bpost\s*graduat\w*\s+in\s+any\b/gi, keys: ["any", "postgraduate", "pg", "master"] },
  { degree: "Bachelor's", re: /\bbachelor'?s?(?:\s+degree)?\b(?!\s+(?:of|in)\s+(?:engineering|technology|science|commerce|arts|computer|business))|\bundergraduate\s+degree\b|\bUG\s+degree\b/gi, keys: ["bachelor", "graduat", "ug"] },
  { degree: "Master's", re: /\bmaster'?s(?:\s+degree)?\b(?!\s+(?:of|in)\s+(?:engineering|technology|science|commerce|arts|computer|business))|\bpost\s*graduate\s+degree\b|\bPG\s+degree\b/gi, keys: ["master", "postgraduate", "pg", "graduat"] },
  { degree: "12th Pass", re: /\b(?:12th|xii)\s*(?:pass(?:ed)?|standard|std|grade|class)?\b|\b10\s*\+\s*2\b|\bHSC\b|\bhigher\s+secondary\b/gi, keys: ["12th", "xii", "10+2", "hsc", "highersecondary"] },
  { degree: "10th Pass", re: /\b10th\s*(?:pass(?:ed)?|standard|std|grade|class)\b|\bSSC\b|\bmatricu?lat(?:e|ion)\b/gi, keys: ["10th", "ssc", "matric"] },
  { degree: "ITI", re: /\bITI\b/g, keys: ["iti"] },
  { degree: "B.Pharm", re: /\bB\.?\s?Pharm(?:a|acy)?\b|\bbachelor\s+of\s+pharmacy\b/gi, keys: ["pharm", "bpharm"] },
  { degree: "M.Pharm", re: /\bM\.?\s?Pharm(?:a|acy)?\b|\bmaster\s+of\s+pharmacy\b/gi, keys: ["pharm", "mpharm"] },
  { degree: "MBBS", re: /\bMBBS\b/gi, keys: ["mbbs"] },
  { degree: "B.Arch", re: /\bB\.?\s?Arch\b/gi, keys: ["barch"] },
  { degree: "B.Des", re: /\bB\.?\s?Des\b/gi, keys: ["bdes"] },
  { degree: "LLB", re: /\bLL\.?\s?B\b|\bbachelor\s+of\s+laws?\b/gi, keys: ["llb"] },
  { degree: "LLM", re: /\bLL\.\s?M\b\.?|\bmaster\s+of\s+laws?\b|(?<=\bLL\.?\s?B\.?\s*(?:\/|,|or|and|&)\s*)LLM\b|\bLLM\b(?=\s*(?:\/|,|or|and|&)\s*LL\.?\s?B\b|\s+(?:degree|in\s+(?:law|corporate|international|tax)))/gi, keys: ["llm"] },
  { degree: "CA", re: /\bchartered\s+accountants?\b|\bCA\b(?=\s*(?:\/|,)\s*(?:CMA|CS|ICWA|CPA|ACCA|MBA)|\s+(?:[Ii]nter(?:mediate)?|INTER|[Ff]inal|FINAL|[Qq]ualified|[Aa]rticleship))|\bCA\s*-?\s*qualified\b/g, keys: ["ca", "chartered"] },
  { degree: "CFA", re: /\bCFA\b/g, keys: ["cfa"] },
];

/** "BE"/"ME" are also English words: accept them only in a degree list or a clear qualification context. */
function hasContext(text: string, index: number, length: number): boolean {
  const before = text.slice(Math.max(0, index - 30), index);
  const after = text.slice(index + length, index + length + 30);
  return DEGREE_NEAR_BEFORE.test(before) || DEGREE_NEAR_AFTER.test(after) || STRONG_AFTER.test(after) || QUAL_BEFORE.test(before);
}

/** One cheap pass that locates every possible degree mention; rules then run only on small windows around them. */
const TRIGGER =
  /\b[bm]\.\s?(?:e|tech|sc|com|a|s|arch|des|pharm)\b|\b(?:bca|mca|bba|bbm|mba|pgdm|pgdbm|pgdba|btech|mtech|bsc|msc|bcom|mcom|barch|bdes|bpharm|mpharm|phd|mbbs|llb|llm|hsc|ssc|xii)\b|\b[bm][\s-]tech\b|\b[bm]\s(?:sc|com|arch|des)\b|ph\.\s?d|bachelor|master|diploma|polytechnic|doctor|graduat|post\s*graduate|12th|10th|10\s*\+\s*2|matric|higher\s+secondary|\bll\.\s?[bm]|chartered|commerce|computer\s+applications?|business\s+administration|\bany\s+(?:graduat|degree|stream|discipline|bachelor|ug)|\ball\s+(?:streams|graduates)|\b(?:from|of|in)\s+any\b|\bpharm/gi;
/** Short forms that are also English words ("be", "me", "ms") trigger only in upper case. */
const TRIGGER_CASE = /\b(?:BE|ME|BS|MS|BA|CA|UG|PG|ITI|CFA|MCom|BCom|B Com|M Com)\b/g;
const WINDOW = 48;

/** "B. Tech" → "btech", "Bachelor's" → "bachelor", "graduates from any" → "any", "Computer Applications" → "computerapplication". */
function triggerKey(match: string): string {
  const k = match.toLowerCase().replace(/[\s.\-]+/g, "");
  if (/^(?:any|all|from|of|in)/.test(k) && k !== "in") return "any";
  if (k.startsWith("computerapplication")) return "computerapplication";
  if (k.startsWith("pharm")) return "pharm";
  if (k.startsWith("higher")) return "highersecondary";
  if (k.startsWith("post")) return "postgraduate";
  if (k.startsWith("matric")) return "matric";
  return k;
}

function candidates(text: string): { text: string; keys: Set<string> } {
  const keys = new Set<string>();
  const hits: [number, number][] = [];
  for (const re of [TRIGGER, TRIGGER_CASE]) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null && hits.length < 240; m = re.exec(text)) {
      keys.add(triggerKey(m[0]));
      hits.push([m.index, m.index + m[0].length]);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const spans: [number, number][] = [];
  for (const [start, end] of hits) {
    const a = Math.max(0, start - WINDOW);
    const b = Math.min(text.length, end + WINDOW);
    const last = spans[spans.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else if (spans.length < 60) spans.push([a, b]);
  }
  const first = spans[0];
  const whole = spans.length === 1 && first !== undefined && first[0] === 0 && first[1] === text.length;
  return { text: whole ? text : spans.map(([a, b]) => text.slice(a, b)).join(" \n "), keys };
}

/** B.E/B.Tech, M.E/M.Tech, BCA/MCA, B.Sc/M.Sc, BBA/MBA, B.Com, Diploma, PhD, Any graduate, … (canonical order). */
export function extractDegrees(input: unknown): Degree[] {
  const texts = typeof input === "string" ? [input] : Array.isArray(input) ? asStringList(input) : [asString(input)];
  const found = new Set<Degree>();
  for (const raw of texts) {
    const full = raw.length > 12_000 ? raw.slice(0, 12_000) : raw;
    if (!full.trim()) continue;
    const { text, keys } = candidates(full);
    if (keys.size === 0) continue;
    for (const rule of RULES) {
      if (found.has(rule.degree)) continue;
      if (!rule.keys.some((k) => keys.has(k))) continue;
      rule.re.lastIndex = 0;
      for (let m = rule.re.exec(text); m !== null; m = rule.re.exec(text)) {
        if (!rule.needsContext || hasContext(text, m.index, m[0].length)) {
          found.add(rule.degree);
          break;
        }
      }
    }
  }
  // A generic "Bachelor's" next to a specific bachelor's degree adds nothing.
  const specificUg: Degree[] = ["B.E/B.Tech", "BCA", "B.Sc", "BBA", "B.Com", "BA", "B.Pharm", "B.Arch", "B.Des", "LLB"];
  if (specificUg.some((d) => found.has(d))) found.delete("Bachelor's");
  const specificPg: Degree[] = ["M.E/M.Tech", "MCA", "M.Sc", "MBA", "M.Com", "MA", "M.Pharm", "LLM"];
  if (specificPg.some((d) => found.has(d))) found.delete("Master's");
  return DEGREES.filter((d) => found.has(d));
}

/** Bare hint labels scrapers send (P06/P10/P12 vocabularies) → canonical labels. Keys are lower-case, no dots/spaces. */
const HINT_ALIASES: Readonly<Record<string, Degree>> = {
  be: "B.E/B.Tech", btech: "B.E/B.Tech", "be/btech": "B.E/B.Tech", "btech/be": "B.E/B.Tech", me: "M.E/M.Tech", mtech: "M.E/M.Tech",
  "me/mtech": "M.E/M.Tech", bsc: "B.Sc", msc: "M.Sc", bcom: "B.Com", mcom: "M.Com", ba: "BA", ma: "MA", bca: "BCA", mca: "MCA",
  bba: "BBA", bbm: "BBA", mba: "MBA", pgdm: "MBA", phd: "PhD", diploma: "Diploma", iti: "ITI", mbbs: "MBBS", bpharm: "B.Pharm",
  mpharm: "M.Pharm", barch: "B.Arch", bdes: "B.Des", llb: "LLB", llm: "LLM", ca: "CA", cfa: "CFA", "12th": "12th Pass",
  "12thpass": "12th Pass", "10th": "10th Pass", "10thpass": "10th Pass", anygraduate: "Any graduate", graduate: "Any graduate",
  graduation: "Any graduate", anypostgraduate: "Any postgraduate", postgraduate: "Any postgraduate", ug: "Bachelor's",
  pg: "Master's", bachelors: "Bachelor's", masters: "Master's",
};

/** Clean scraper-provided degree hints:/** Clean scraper-provided degree hints: map known spellings to canonical labels, keep tidy unknown ones. */
export function cleanDegreeList(input: unknown): string[] {
  const out = new Set<string>();
  for (const item of asStringList(input).slice(0, 30)) {
    const s = cleanLine(item);
    if (!s || s.length > 60) continue;
    const alias = HINT_ALIASES[s.toLowerCase().replace(/['’.\s-]+/g, "")];
    if (alias) {
      out.add(alias);
      continue;
    }
    const mapped = extractDegrees(s.length <= 6 ? `Qualification: ${s} /` : s);
    if (mapped.length > 0) for (const d of mapped) out.add(d);
    else if (/^(?:any|all)\b/i.test(s)) out.add("Any graduate");
    else out.add(s);
  }
  return [...out].slice(0, 20);
}
