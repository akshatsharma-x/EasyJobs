import type { ExperienceLevel, SourceKind } from "@easyjobs/contract";
import { hostOf } from "./url";
import { asString, asStringList, bag, cleanLine } from "./text";

export interface TagInput {
  title?: string | null;
  description?: string | null;
  locations?: readonly string[] | null;
  /** RawJob.tags (free-form hints from the scraper) */
  hints?: unknown;
  isRemote?: boolean;
  level?: ExperienceLevel | null;
  sourceKind?: SourceKind | null;
  applyUrl?: string | null;
  /** The apply link is an official, job-specific URL (then a WhatsApp number is not "WhatsApp-only"). */
  officialApply?: boolean;
  salaryCurrency?: string | null;
  salaryInrYearlyMin?: number | null;
  salaryInrYearlyMax?: number | null;
}

const T_OFF_CAMPUS = /\boff[\s-]?campus\b/i;
const T_WALK_IN = /\bwalk-ins?\b|\bwalkins?\b|\bwalk\s+in\s+(?:interviews?|drives?|recruitment|hiring|venue|date|timings?)\b/i;
const T_WFH = /\bwork[\s-]+from[\s-]+home\b|\bwfh\b/i;
/** Hiring intent only — EEO lines ("Female applicants … are encouraged") and dress codes don't count. */
const T_WOMEN =
  /\b(?:only|exclusively|specially)\s+(?:for\s+)?(?:women|females?)\b|\b(?:women|females?)\s+(?:only|candidates?\s+(?:only|preferred)|preferred|hiring|drive|returners?|in\s+(?:tech|technology|engineering))\b|\b(?:prefers?|preference\s+(?:to|for)|priority\s+(?:to|for))\s+(?:women|females?)\b|\bwomen'?s?\s+(?:hiring|drive|program(?:me)?|initiative)\b|\breturnship\b|\b(?:women|mothers?)\b[^.\n]{0,40}\bre-?start\s+(?:their\s+)?careers?\b|\bcareer\s+re-?start(?:ers?)?\b|\bshe[\s-]?(?:codes|leads|hires)\b|\bvaga\s+afirmativa\s+para\s+mulheres\b/i;
const T_DIVERSITY = /\bdiversity\s+(?:hiring|drive|program(?:me)?|candidates?|recruitment|initiative)\b|\bd\s?&\s?i\s+hiring\b/i;
/** Hiring intent only — inclusion boilerplate ("support differently abled individuals", the RPwD Act) doesn't count. */
const T_PWD =
  /\b(?:pwd|pwbd)\s+(?:candidates?|applicants?|only|hiring|drive|preferred|friendly|reservation|quota|category|can\s+apply|are\s+(?:encouraged|welcome|eligible))\b|\b(?:for|reserved\s+for|open\s+to)\s+(?:pwd|pwbd)\b|\bpersons?\s+with\s+(?:benchmark\s+)?disabilit(?:y|ies)\s+(?:hiring|candidates?|only|drive|are\s+(?:encouraged|eligible|welcome))\b|\b(?:differently|specially)[\s-]abled\s+(?:candidates?|applicants?|hiring|drive|only|friendly|can\s+apply)\b|\bdivyang\w*\s+(?:candidates?|hiring|drive|only)\b|\bdisability\s+(?:hiring|drive)\b/i;
/** ATS test requisitions that leak into public feeds ("DO NOT APPLY - TEST REQ"). */
const TEST_POSTING = /\b(?:do\s+not\s+apply|test\s+(?:req|requisition|job|posting|position)|dummy\s+(?:job|posting|requisition)|please\s+ignore)\b/i;
const T_URGENT = /\burgent(?:ly)?\b|\bimmediate\s+(?:joiners?|joining|hiring|start|requirement|opening)\b|\bjoin\s+immediately\b|\basap\b/i;

/* Scam signals */
const FEE =
  /\b(?:registration|training|security|processing|joining|application|enrol?ment|onboarding|document(?:ation)?|verification|interview|kit|caution|placement)\s+(?:fee|fees|charges?|deposit|amount)\b|\bpay\s+(?:a\s+)?(?:fee|deposit)\b|\bpay\s+(?:rs\.?|inr|₹)\s*\d|\bpay\s+to\s+apply\b|\bsecurity\s+deposit\b|\brefundable\s+(?:deposit|amount|fee)\b/i;
/** A fee only counts when the sentence asks for money: an amount, or "pay". */
const PAY_CONTEXT = /(?:₹|\brs\.?|\binr|\$)\s*[1-9]|\b[1-9][\d,]*\s*\/-|\bpay(?:ing|able)?\b|\bpaid\b|\btransfer\b/i;
const NEGATION =
  /\b(?:no|not|none|never|don'?t|doesn'?t|does\s+not|do\s+not|without|free|zero|nil|won'?t|will\s+not|beware|fraud\w*|scam\w*|fake|cannot|nor)\b|(?:₹|\brs\.?|\binr)\s*0(?![\d,.])/i;
/** Service-bond clauses ("liable to pay ₹50,000 if you leave before 12 months") are not scams. */
const BOND_CONTEXT = /\b(?:bond|service\s+agreement|liable|penalty|if\s+you\s+(?:leave|resign|quit)|before\s+completing|notice\s+period|lending|loans?|interest|yields?|insurance)\b/i;
const MESSENGER = /\b(?:whats\s?app|telegram)\b/i;
const MESSENGER_CONTACT =
  /\b(?:whats\s?app|telegram)\b[^.\n]{0,40}?(?:\+?\d[\d\s-]{8,}\d|@[a-z0-9_]{4,})|\b(?:send|share|forward|drop|submit)\s+(?:your\s+)?(?:cv|resume|details|profile)\s+(?:on|via|to|at|through)\s+(?:our\s+)?(?:whats\s?app|telegram)\b|\b(?:contact|message|ping|dm|text|reach)\s+(?:us|hr|me)?\s*(?:on|via|through|at)\s+(?:whats\s?app|telegram)\b|\bapply\s+(?:on|via|through)\s+(?:whats\s?app|telegram)\b/i;
const MESSENGER_PROMO = /\bjoin\s+(?:our|the)\s+(?:whats\s?app|telegram)\s+(?:channel|group|community)\b/i;
const FREE_EMAIL =
  /(?<![a-z0-9._%+-])[a-z0-9._%+-]{1,64}@(?:gmail|googlemail|yahoo|ymail|hotmail|outlook|live|rediffmail|rediff|aol|protonmail|proton|yandex|icloud|zohomail)\.(?:com|in|co\.in|co\.uk|me)\b/i;
const TOO_GOOD =
  /\bearn\s+(?:up\s*to\s+)?(?:₹|rs\.?|inr)?\s*\d[\d,]{0,12}\s*(?:k|\+)?\s*(?:per|\/|a|every)\s*(?:day|week)\b|\bwork\s+from\s+home\s+and\s+earn\b|\bno\s+interview\s+(?:required|needed)\b|\bearn\s+(?:money|income)\s+from\s+home\b/i;
/** "Guaranteed job/placement" is a scam signal only when the posting also asks for money. */
const GUARANTEE = /\b(?:100\s*%|guaranteed)\s+(?:job|placement|selection|income)\b|\b(?:job|placement)\s+guarantee\b/i;
const MESSENGER_HOSTS = /^(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|web\.whatsapp\.com|whatsapp\.com|t\.me|telegram\.me|telegram\.dog)$/;

/** Inflated pay for freshers/interns from a non-official source (INR/year). */
const FRESHER_PAY_CAP = 4_000_000;
const INTERN_PAY_CAP = 3_000_000;

const HINT_SYNONYMS: Readonly<Record<string, string>> = {
  offcampus: "off-campus", "off campus": "off-campus", "off-campus-drive": "off-campus", walkin: "walk-in",
  "walk in": "walk-in", "walk-in-drive": "walk-in", "work from home": "wfh", "work-from-home": "wfh", remote: "wfh",
  "women only": "women", "women-only": "women", female: "women", "diversity hiring": "diversity", pwbd: "pwd",
  "urgent hiring": "urgent",
};

function cleanHintTag(t: string): string | null {
  const s = cleanLine(t).toLowerCase();
  if (!s || s.length > 40) return null;
  const mapped = HINT_SYNONYMS[s] ?? s;
  const kebab = mapped.replace(/[^a-z0-9+#]+/g, "-").replace(/^-+|-+$/g, "");
  return kebab.length >= 2 && kebab.length <= 30 ? kebab : null;
}

/** Literal triggers; each family's regex runs only when one of its words occurs (one lower-cased copy, fast includes). */
const KEYWORDS: readonly string[] = [
  "campus", "walk", "women", "female", "mulheres", "returnship", "restart", "re-start", "she-", "she ", "diversity", "d&i",
  "d & i", "pwd", "pwbd", "disabilit", "abled", "divyang", "urgent", "immediate", "asap", "fee", "deposit", "pay",
  "charge", "whats", "telegram", "@", "earn", "guarantee", "100%", "100 %", "no interview", "home",
];

const KEYWORD_RE = new RegExp(KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");

/** One literal-alternation regex pass (much faster than many includes() on two-byte strings). */
function keywordsIn(text: string): Set<string> {
  const out = new Set<string>();
  KEYWORD_RE.lastIndex = 0;
  for (let m = KEYWORD_RE.exec(text); m !== null; m = KEYWORD_RE.exec(text)) out.add(m[0].toLowerCase());
  return out;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/);
}

export interface Suspicion {
  suspicious: boolean;
  reasons: string[];
}

/** Scam heuristics: fees, messenger-only contact, free-mail recruiter, unrealistic pay or promises. */
export function detectScamSignals(tagInput: TagInput, precomputed?: { text: string; keywords: Set<string> }): Suspicion {
  const input = bag(tagInput);
  const reasons: string[] = [];
  const text = precomputed?.text ?? `${asString(input.title)}\n${asString(input.description).slice(0, 12_000)}`;
  const kw = precomputed?.keywords ?? keywordsIn(text);
  const sents = (): string[] => (sentenceCache ??= sentences(text));
  let sentenceCache: string[] | undefined;
  if ((kw.has("fee") || kw.has("deposit") || kw.has("charge") || kw.has("pay")) && FEE.test(text)) {
    const bad = sents().some((s) => FEE.test(s) && PAY_CONTEXT.test(s) && !NEGATION.test(s) && !BOND_CONTEXT.test(s));
    if (bad) reasons.push("fee");
  }
  const applyHost = hostOf(asString(input.applyUrl));
  if (applyHost && MESSENGER_HOSTS.test(applyHost)) reasons.push("messenger-apply-link");
  else if (!input.officialApply && (kw.has("whats") || kw.has("telegram")) && MESSENGER.test(text) && MESSENGER_CONTACT.test(text.replace(MESSENGER_PROMO, " "))) {
    reasons.push("messenger-contact");
  }
  if (kw.has("@") && FREE_EMAIL.test(text)) reasons.push("free-email-recruiter");
  if ((kw.has("earn") || kw.has("no interview")) && sents().some((s) => TOO_GOOD.test(s) && !NEGATION.test(s))) reasons.push("too-good-to-be-true");
  else if ((kw.has("guarantee") || kw.has("100%") || kw.has("100 %")) && GUARANTEE.test(text) && PAY_CONTEXT.test(text) && sents().some((s) => GUARANTEE.test(s) && !NEGATION.test(s))) {
    reasons.push("too-good-to-be-true");
  }
  const official = input.sourceKind === "ats" || input.sourceKind === "career_site";
  const top = Math.max(input.salaryInrYearlyMin ?? 0, input.salaryInrYearlyMax ?? 0);
  const inrPay = !input.salaryCurrency || input.salaryCurrency === "INR";
  if (!official && inrPay && ((input.level === "fresher" && top > FRESHER_PAY_CAP) || (input.level === "intern" && top > INTERN_PAY_CAP))) {
    reasons.push("unrealistic-pay");
  }
  return { suspicious: reasons.length > 0, reasons };
}

/**
 * Known tags: off-campus, walk-in, wfh, women, diversity, pwd, urgent, suspicious — plus cleaned scraper hints.
 * EEO boilerplate ("women, minorities … are encouraged to apply") does not produce "women"/"pwd".
 */
export function detectTags(tagInput: TagInput): string[] {
  const input = bag(tagInput);
  const tags = new Set<string>();
  for (const h of asStringList(input.hints)) {
    const t = cleanHintTag(h);
    if (t) tags.add(t);
  }
  const title = asString(input.title);
  const description = asString(input.description).slice(0, 12_000);
  const locs = asStringList(input.locations).join(" | ");
  const all = `${title}\n${locs}\n${description}`;
  const found = keywordsIn(all);
  const has = (...needles: string[]): boolean => needles.some((n) => found.has(n));
  if (has("campus") && T_OFF_CAMPUS.test(all)) tags.add("off-campus");
  if (has("walk") && T_WALK_IN.test(all)) tags.add("walk-in");
  if (input.isRemote || T_WFH.test(`${title}\n${locs}`) || (has("home") && /\b(?:this\s+is\s+a\s+)?work[\s-]+from[\s-]+home\s+(?:job|role|position|internship|opportunity)\b/i.test(description))) {
    tags.add("wfh");
  }
  if (has("women", "female", "mulheres", "returnship", "restart", "re-start", "she-", "she ") && T_WOMEN.test(all)) tags.add("women");
  if (has("diversity", "d&i", "d & i") && T_DIVERSITY.test(all)) tags.add("diversity");
  if (has("pwd", "pwbd", "disabilit", "abled", "divyang") && T_PWD.test(all)) tags.add("pwd");
  if (has("urgent", "immediate", "asap") && (T_URGENT.test(title) || T_URGENT.test(description.slice(0, 4000)))) tags.add("urgent");
  if (detectScamSignals(input, { text: all, keywords: found }).suspicious) tags.add("suspicious");
  if (TEST_POSTING.test(title)) tags.add("test-posting");
  return [...tags].slice(0, 15);
}
