import { asString, asStringList, bag, validNow } from "./text";

export interface BatchOptions {
  /** Reference date for the plausible-year window (default: now). */
  now?: Date;
}

/** A year list: "2024/2025/2026", "2025 & 2026", "2023-2025", "2025/26", "2024, 2025 and 2026". */
const YEAR_LIST =
  /\b((?:19|20)\d{2})((?:\s*(?:\/|,|&|\band\b|\bor\b|-|–|—|\bto\b|\|)\s*(?:(?:19|20)\d{2}|\d{2})\b){0,10})/gi;

const BATCH_WORDS =
  /\b(?:batch(?:es)?|pass[\s-]?outs?|passed[\s-]?out|passing[\s-]?out|pass(?:ing)?[\s-]?(?:out\s+)?year|year\s+of\s+(?:passing|graduation|pass[\s-]?out|completion)|yop|y\.o\.p|graduat(?:ing|ion|es?|ed)|grads?|class\s+of|graduation\s+year|completing\s+(?:their\s+)?(?:degree|graduation)|degree\s+completion|freshers?|final[\s-]year)\b/i;
const DATE_BEFORE =
  /(?:\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s*(?:\d{1,2}(?:st|nd|rd|th)?,?\s*)?|\b\d{1,2}[/.-]\d{1,2}[/.-])$/i;
const NOT_BATCH_BEFORE =
  /\b(?:since|founded|established|estd|incorporated|copyright|©|fy|financial\s+year|fiscal|q[1-4]|revenue|raised|award\w*|ranked|top|best|fortune|recruitment|drive|hiring|internship|summer|winter|edition|season|deadline|last\s+date|apply\s+(?:by|before)|before|till|until|posted|updated|dob|born|session|by|in\s+business|report|survey)\s*[:\-–]?\s*$/i;
const STRONG_AFTER = /^\s*[)\]]?\s*(?:batch(?:es)?|pass[\s-]?outs?|passed[\s-]?out|graduat\w*|grads?)\b/i;
const GRAD_WORDS = /\b(?:graduat\w*|pass(?:ing)?[\s-]?out|passed[\s-]?out|class\s+of|completing|completion|yop|year\s+of\s+passing)\b/i;

function expandList(first: string, rest: string): { years: number[]; isRange: boolean } {
  const years: number[] = [Number(first)];
  let isRange = false;
  const re = /\s*(\/|,|&|\band\b|\bor\b|-|–|—|\bto\b|\|)\s*((?:19|20)\d{2}|\d{2})\b/gi;
  for (const m of rest.matchAll(re)) {
    const sep = (m[1] as string).toLowerCase();
    const tok = m[2] as string;
    const prev = years[years.length - 1] as number;
    let year: number;
    if (tok.length === 2) {
      // "2025/26" continues the century; "2025, 30" (a count) is not a year.
      if (!["/", "-", "–", "—"].includes(sep)) break;
      year = Math.floor(prev / 100) * 100 + Number(tok);
      if (year <= prev || year - prev > 6) break;
    } else year = Number(tok);
    if (["-", "–", "—", "to"].includes(sep)) isRange = true;
    years.push(year);
  }
  return { years, isRange };
}

/**
 * Eligible graduation years. "2024/2025/2026 batch" → [2024,2025,2026] · "Batch: 2025 & 2026" → [2025,2026] ·
 * "graduating in 2026" → [2026] · "2025 passouts" → [2025] · "YOP 2024" → [2024]. Years without batch/graduation
 * context ("since 2005", "Off Campus Drive 2026", "Last date: 12 Nov 2025") are ignored.
 * A span of 3+ years ("B.Tech 2021-2025 batch") is a course duration → only the graduation year.
 */
export function extractBatches(input: unknown, opts: BatchOptions = {}): number[] {
  const texts = typeof input === "string" ? [input] : Array.isArray(input) ? asStringList(input) : [asString(input)];
  const nowYear = validNow(bag(opts).now).getUTCFullYear();
  const lo = nowYear - 8;
  const hi = nowYear + 6;
  const found = new Set<number>();
  for (const raw of texts) {
    const text = raw.length > 30_000 ? raw.slice(0, 30_000) : raw;
    if (!/(?:19|20)\d{2}/.test(text)) continue;
    YEAR_LIST.lastIndex = 0;
    let n = 0;
    for (let m = YEAR_LIST.exec(text); m !== null && n < 60; m = YEAR_LIST.exec(text)) {
      n++;
      const start = m.index;
      const end = start + m[0].length;
      const beforeFull = text.slice(Math.max(0, start - 40), start);
      const before = beforeFull.split(/[.;!?\n]\s|\n/).pop() ?? "";
      const after = (text.slice(end, end + 30).split(/[.;!?\n]\s|\n/)[0] ?? "").replace(/^\s*\)/, "");
      const ctxBefore = before.slice(-32);
      const ctxAfter = after.slice(0, 24);
      const hasBatchWord = BATCH_WORDS.test(ctxBefore) || BATCH_WORDS.test(ctxAfter);
      if (!hasBatchWord) continue;
      // "Recruitment 2025 for freshers" / "Drive 2026": after headline words only an adjacent batch word counts.
      if (NOT_BATCH_BEFORE.test(before) && !STRONG_AFTER.test(after)) continue;
      if (DATE_BEFORE.test(before) && !GRAD_WORDS.test(before)) continue;
      const { years, isRange } = expandList(m[1] as string, m[2] ?? "");
      let list = years;
      if (isRange && years.length === 2) {
        const [a, b] = years as [number, number];
        const span = b - a;
        if (span >= 3 && span <= 5) list = [b];
        else if (span > 0 && span <= 2) list = Array.from({ length: span + 1 }, (_, i) => a + i);
        else if (span <= 0) list = [a];
        else list = [];
      }
      for (const y of list) if (y >= lo && y <= hi) found.add(y);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** Validate scraper-provided batches: integers in a plausible window, deduped and sorted. */
export function cleanBatches(input: unknown, opts: BatchOptions = {}): number[] {
  if (!Array.isArray(input)) return [];
  const nowYear = validNow(bag(opts).now).getUTCFullYear();
  const out = new Set<number>();
  for (const v of input) {
    const n = typeof v === "string" ? Number(v.trim()) : v;
    if (typeof n === "number" && Number.isInteger(n) && n >= nowYear - 15 && n <= nowYear + 8) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}
