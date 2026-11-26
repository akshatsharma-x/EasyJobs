/**
 * Compact candidate format — one company per line, `|`-separated:
 *
 *   name | domain | tags | hq | flags | hints | aka
 *
 * - domain: bare host ("razorpay.com") or "-"
 * - tags:   space-separated COMPANY_TAGS ("unicorn fintech product")
 * - hq:     "Bengaluru, IN" or "-"
 * - flags:  "in" (India presence) · "remote" (hires remotely incl. India) · "p1|p2|p3" (priority override) · "slug=x"
 * - hints:  known boards, verified later: gh:<token> lv:<token> ab:<token> sr:<id> wk:<acct> rc:<sub> bh:<sub>
 *           ps:<sub> bz:<sub> tt:<sub> ft:<sub> zr:<sub> kk:<sub> db:<sub> wd:<url> or:<url> ef:<host>,<domain>
 *           sf:<url> ph:<url> ic:<url> av:<url> tl:<url> jl:<url> cu:<url> · url:<careers page>
 * - aka:    "; "-separated other names (legal entity, former names) used to match ATS board names
 *
 * Lines starting with # are comments. Invalid tags/tokens throw at load time.
 */
import { COMPANY_TAGS, slugify, type AtsType, type CompanyTag } from "@easyjobs/contract";
import { detectAtsFromUrl, isValidToken } from "../../src/ats";

export interface Candidate {
  slug: string;
  name: string;
  domain: string | null;
  careersUrl: string | null;
  tags: CompanyTag[];
  hq: string | null;
  indiaPresence: boolean;
  remote: boolean;
  priority: 1 | 2 | 3 | null;
  hints: { ats: AtsType; token: string }[];
  aka: string[];
  segment: string;
}

const HINT_CODES: Record<string, AtsType> = {
  gh: "greenhouse", lv: "lever", ab: "ashby", sr: "smartrecruiters", wk: "workable", rc: "recruitee", bh: "bamboohr",
  ps: "personio", bz: "breezy", tt: "teamtailor", ft: "freshteam", zr: "zoho_recruit", kk: "keka", db: "darwinbox",
  wd: "workday", or: "oracle", ef: "eightfold", sf: "successfactors", ph: "phenom", ic: "icims", av: "avature",
  tl: "taleo", jl: "jsonld", cu: "custom",
};

function dash(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" || s === "-" ? null : s;
}

export function parseCandidates(segment: string, text: string): Candidate[] {
  const out: Candidate[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const where = `${segment}:${i + 1} "${line.slice(0, 60)}"`;
    const [name, domain, tags, hq, flags, hints, aka] = line.split("|").map((s) => s.trim());
    if (!name) throw new Error(`candidate without name at ${where}`);
    if (!dash(domain) && !dash(hints)) throw new Error(`placeholder candidate (needs a domain or a hint) at ${where}`);
    const c: Candidate = {
      slug: slugify(name),
      name,
      domain: dash(domain)?.toLowerCase().replace(/^www\./, "") ?? null,
      careersUrl: null,
      tags: [],
      hq: dash(hq),
      indiaPresence: false,
      remote: false,
      priority: null,
      hints: [],
      aka: (dash(aka) ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      segment,
    };
    for (const t of (dash(tags) ?? "").split(/\s+/).filter(Boolean)) {
      if (!(COMPANY_TAGS as readonly string[]).includes(t)) throw new Error(`unknown tag "${t}" at ${where}`);
      if (!c.tags.includes(t as CompanyTag)) c.tags.push(t as CompanyTag);
    }
    for (const f of (dash(flags) ?? "").split(/\s+/).filter(Boolean)) {
      if (f === "in") c.indiaPresence = true;
      else if (f === "remote") c.remote = true;
      else if (/^p[123]$/.test(f)) c.priority = Number(f[1]) as 1 | 2 | 3;
      else if (f.startsWith("slug=")) c.slug = f.slice(5);
      else throw new Error(`unknown flag "${f}" at ${where}`);
    }
    for (const h of (dash(hints) ?? "").split(/\s+/).filter(Boolean)) {
      const idx = h.indexOf(":");
      const code = h.slice(0, idx);
      let value = h.slice(idx + 1);
      if (idx < 0 || !value) throw new Error(`bad hint "${h}" at ${where}`);
      if (code === "url") {
        c.careersUrl = value;
        continue;
      }
      const ats = HINT_CODES[code];
      if (!ats) throw new Error(`unknown hint code "${code}" at ${where}`);
      if (ats === "eightfold") {
        const [host, dom] = value.split(",");
        value = `${host!.startsWith("http") ? host : `https://${host}`}|${dom}`;
      }
      if ((ats === "workday" || ats === "oracle") && !isValidToken(ats, value)) {
        const canon = detectAtsFromUrl(value); // e.g. wd3.myworkdaysite.com/recruiting/<t>/<site> → <t>.wd3.myworkdayjobs.com/<site>
        if (canon?.ats === ats) value = canon.token;
      }
      if (!isValidToken(ats, value)) throw new Error(`invalid ${ats} token "${value}" at ${where}`);
      c.hints.push({ ats, token: value });
    }
    if (c.careersUrl && !/^https:\/\//.test(c.careersUrl)) throw new Error(`careers url must be https at ${where}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)) throw new Error(`bad slug "${c.slug}" at ${where}`);
    out.push(c);
  });
  return out;
}
