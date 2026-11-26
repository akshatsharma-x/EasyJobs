import { compactName, coreName, normalizeName } from "../../src/normalize";

const TOKEN_RE = /^[a-z0-9][a-z0-9-]*$/;

/** The domain's first label: "zeptonow.com" → "zeptonow" (slugVariants also tries it without get/try/join prefixes). */
export function domainStem(domain: string | null): string | null {
  if (!domain) return null;
  const first = domain.replace(/^www\./, "").split(".")[0] ?? "";
  return first || null;
}

export interface Variants {
  /** Most likely tokens first: name, hyphenated name, domain stem, core name. */
  base: string[];
  /** Suffixed forms (namehq, nameinc, name-india, nameindia). */
  suffixed: string[];
}

/** ATS slug variants to probe for a company (prompts.md P04 §3). */
export function slugVariants(c: { name: string; domain: string | null }): Variants {
  const base: string[] = [];
  const add = (list: string[], s: string | null | undefined): void => {
    if (!s) return;
    const v = s.toLowerCase();
    if (v.length >= 2 && v.length <= 60 && TOKEN_RE.test(v) && !base.includes(v) && !list.includes(v)) list.push(v);
  };
  const compact = compactName(c.name);
  const hyphen = normalizeName(c.name).replace(/ /g, "-");
  const stem = domainStem(c.domain);
  const core = coreName(c.name).replace(/ /g, "");
  add(base, compact);
  add(base, hyphen);
  add(base, stem);
  if (stem) {
    const bare = stem.replace(/^(?:get|try|join|use|go|with|hello|my)(?=[a-z]{3,})/, "");
    if (bare !== stem) add(base, bare);
  }
  if (core.length >= 4) add(base, core);
  const suffixed: string[] = [];
  const root = compact || stem || "";
  if (root) {
    add(suffixed, `${root}hq`);
    add(suffixed, `${root}inc`);
    add(suffixed, `${hyphen || root}-india`);
    add(suffixed, `${root}india`);
  }
  return { base, suffixed };
}
