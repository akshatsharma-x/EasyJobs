import { parseRetryAfter } from "./backoff";
import type { BlockKind } from "./state";

export interface BlockSignal {
  kind: Extract<BlockKind, "rate_limited" | "denied" | "challenge">;
  status: number | null;
  detail: string;
  retryAfterMs: number | null;
}

/** The parts of an HTTP response (fetch or headless browser) that block detection needs. */
export interface ResponseLike {
  status: number;
  /** Final URL after redirects. */
  url: string;
  body: string;
  headers?: { get(name: string): string | null } | null;
}

/** Redirect targets that mean "log in / prove you're human" rather than a public page. */
const CHALLENGE_PATH = /\/(authwall|checkpoint|uas\/login|login|signup|captcha|_sec\/cp_challenge)(\/|\?|$)/i;

/** <title> of edge-denial, bot-check and login pages (LinkedIn, Akamai, Cloudflare, generic CAPTCHA). */
const BLOCK_TITLE =
  /<title[^>]*>\s*([^<]*?(access denied|request rejected|security verification|security check|just a moment|attention required|are you a robot|captcha|pardon our interruption|log in or sign up|sign up \| linkedin|linkedin login)[^<]*)<\/title>/i;

const DENIED_TITLE = /access denied|request rejected/i;

/** Distinctive markers of challenge pages. Deliberately narrow: job descriptions can mention "captcha". */
const BODY_MARKERS: readonly (readonly [RegExp, string])[] = [
  [/errors\.edgesuite\.net/i, "Akamai edge 'Access Denied' page"],
  [/\/_sec\/cp_challenge\//i, "Akamai bot-manager challenge"],
  [/www\.google\.com\/recaptcha\/|www\.recaptcha\.net\/recaptcha\//i, "reCAPTCHA challenge"],
  [/hcaptcha\.com\/1\/api\.js/i, "hCaptcha challenge"],
  [/challenges\.cloudflare\.com\/|__cf_chl_/i, "Cloudflare challenge"],
  [/id="captcha-internal"/i, "LinkedIn CAPTCHA page"],
];

/** Challenge/denial pages are small and put their markers up front; job pages can be large. */
const SCAN_BYTES = 20_000;

/**
 * Classifies a response as a block (→ back off for hours and stop the run) or not (null).
 * 429 → rate_limited · 401/403/999 → denied · auth-wall redirect, bot-check page → challenge.
 */
export function detectBlock(res: ResponseLike, now: number = Date.now()): BlockSignal | null {
  const retryAfterMs = parseRetryAfter(res.headers?.get("retry-after"), now);
  const head = res.body.slice(0, SCAN_BYTES);
  if (res.status === 429) return { kind: "rate_limited", status: 429, detail: "HTTP 429 Too Many Requests", retryAfterMs };
  if (res.status === 999) return { kind: "denied", status: 999, detail: "HTTP 999 (LinkedIn anti-bot 'request denied')", retryAfterMs };
  if (res.status === 401 || res.status === 403) {
    return { kind: "denied", status: res.status, detail: `HTTP ${res.status}${describeDenialPage(head)}`, retryAfterMs };
  }
  let path = "";
  try {
    path = new URL(res.url).pathname;
  } catch {
    /* relative or empty URL — no redirect information */
  }
  if (CHALLENGE_PATH.test(path)) return { kind: "challenge", status: res.status, detail: `redirected to ${path} (login/auth wall)`, retryAfterMs };
  const title = BLOCK_TITLE.exec(head);
  if (title) {
    const text = decodeEntities(title[1] ?? "").trim();
    return { kind: DENIED_TITLE.test(text) ? "denied" : "challenge", status: res.status, detail: `page title "${text}"${describeDenialPage(head)}`, retryAfterMs };
  }
  for (const [re, label] of BODY_MARKERS) {
    if (re.test(head)) return { kind: "challenge", status: res.status, detail: label, retryAfterMs };
  }
  return null;
}

/** " — Akamai edge 'Access Denied' (Reference #18.9fdc55b8.1795643750.e9278252)" when recognisable. */
export function describeDenialPage(html: string): string {
  if (!/edgesuite\.net|AkamaiGHost|<title>\s*Access Denied/i.test(html)) return "";
  const ref = /Reference\s*#\s*([\w.]+)/i.exec(decodeEntities(html));
  return ` — Akamai edge 'Access Denied'${ref ? ` (Reference #${ref[1]})` : ""}`;
}

/** Decodes numeric (&#46; &#x2e;) and the few named entities edge pages use. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
