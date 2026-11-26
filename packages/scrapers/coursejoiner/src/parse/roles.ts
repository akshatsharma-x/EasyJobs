/** Multi-role detection: role tables, role-naming apply anchors, and per-location apply links. */
import type { ContentModel, Line } from "./dom";
import type { ApplyCandidate } from "./apply";
import { linkKey, MIN_APPLY_SCORE } from "./apply";
import { labelToField, type FieldKey } from "./labels";
import { cleanRole, looksLikeRole, roleFromAnchor } from "./role";
import { citiesIn, splitLocations } from "./geo";
import { foldText } from "../util/text";

export interface RoleSpec {
  title: string;
  /** Role-specific apply URL (null → use the post's best apply link). */
  applyUrl: string | null;
  locations?: string[];
  /** Row-specific values (qualification, salary, experience, batch, …). */
  fields?: Partial<Record<FieldKey, string>>;
  source: "table" | "anchors" | "location-links";
}

const ROLE_HEADER = /\b(?:role|roles|post|posts|position|positions|designation|job title|title|profile|vacancy|job|opening|internship|program(?:me)?)\b/i;
const LOCATION_HEADER = /\b(?:location|locations|city|cities|venue|drive|place|office|centre|center)\b/i;
const ID_IN_TEXT = /\b(?:req(?:uisition)?|job\s*id|id|naukri|jr|r)\s*[:#]?\s*([A-Z]{0,3}[-_]?\d{5,}[\w-]*)\b|\b(\d{6,})\b/gi;

function significantWords(s: string): string[] {
  return foldText(s).split(" ").filter((w) => w.length >= 4 && !/^(?:with|from|that|this|role|apply|intern|india|online|portal|official|listing)$/.test(w));
}

function idsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ID_IN_TEXT)) {
    const id = (m[1] ?? m[2] ?? "").replace(/^[-_]/, "");
    if (id) out.push(id.toLowerCase());
  }
  return out;
}

function tableRoles(model: ContentModel, cands: ApplyCandidate[], company: string | null): RoleSpec[] | null {
  const byTable = new Map<number, Line[]>();
  for (const line of model.lines) {
    if (line.cells && line.tableIdx !== undefined && !line.inFaq) {
      const rows = byTable.get(line.tableIdx) ?? [];
      rows.push(line);
      byTable.set(line.tableIdx, rows);
    }
  }
  const usable = cands.filter((c) => c.score >= MIN_APPLY_SCORE - 10);
  for (const rows of byTable.values()) {
    if (rows.length < 3) continue;
    const header = rows[0]!;
    const cols = header.cells!.map((c) => c.text);
    if (cols.length < 2) continue;
    const roleCol = cols.findIndex((h) => ROLE_HEADER.test(h) && !/\b(?:no|number|count|total)\b/i.test(h) && h.length <= 40);
    if (roleCol < 0) continue;
    const dataRows = rows.slice(1).filter((r) => (r.cells?.length ?? 0) === cols.length);
    if (dataRows.length < 2) continue;
    // A 2-column KV table ("Role Title | X") is not a role table.
    if (cols.length === 2 && roleCol === 0 && !dataRows.every((r) => looksLikeRole(r.cells![0]!.text))) continue;
    const locCol = cols.findIndex((h, i) => i !== roleCol && LOCATION_HEADER.test(h));
    const roles: RoleSpec[] = [];
    for (const row of dataRows) {
      const cells = row.cells!;
      const roleText = cells[roleCol]?.text ?? "";
      if (!looksLikeRole(roleText)) continue;
      const title = cleanRole(roleText.replace(/\s*\|\s*/g, " "), company);
      if (!looksLikeRole(title)) continue;
      // Row link → id-matched link → name-matched link.
      let applyUrl: string | null = null;
      const rowLink = row.links.map((l) => usable.find((c) => c.occurrences.includes(l))).find(Boolean);
      if (rowLink) applyUrl = rowLink.url;
      if (!applyUrl) {
        const ids = idsIn(row.text);
        const byId = usable.find((c) => ids.some((id) => c.url.toLowerCase().includes(id) || c.occurrences.some((o) => o.text.toLowerCase().includes(id))));
        if (byId) applyUrl = byId.url;
      }
      if (!applyUrl) {
        const words = significantWords(roleText);
        const byName = usable.find((c) => {
          const anchorWords = significantWords(c.link.text);
          return anchorWords.length > 0 && anchorWords.filter((w) => words.includes(w)).length >= Math.min(2, anchorWords.length);
        });
        if (byName) applyUrl = byName.url;
      }
      const fields: Partial<Record<FieldKey, string>> = {};
      cols.forEach((h, i) => {
        if (i === roleCol) return;
        const key = labelToField(h);
        const v = cells[i]?.text;
        if (key && v) fields[key] = v;
      });
      const locText = locCol >= 0 ? cells[locCol]?.text ?? "" : "";
      const locations = locText ? (citiesIn(locText).length > 0 ? citiesIn(locText) : splitLocations(locText)) : undefined;
      roles.push({ title, applyUrl, locations: locations && locations.length > 0 ? locations : undefined, fields, source: "table" });
    }
    if (roles.length >= 2) return roles;
  }
  return null;
}

function anchorRoles(cands: ApplyCandidate[], company: string | null): RoleSpec[] | null {
  const roles: RoleSpec[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const ordered = [...cands].filter((c) => c.score >= MIN_APPLY_SCORE).sort((a, b) => a.link.order - b.link.order);
  for (const c of ordered) {
    if (c.kind === "other" || c.kind === "pdf") continue;
    let title: string | null = null;
    for (const occ of c.occurrences) {
      // Card-style anchors: the first block part is the role, the rest is metadata ("Job ID … · Apply").
      title = roleFromAnchor(occ.parts.length > 1 ? occ.parts[0]! : occ.text, company);
      if (title) break;
    }
    if (!title) continue;
    // "Analyst L1 · Chennai" → title + location
    let locations: string[] | undefined;
    const dot = /^(.+?)\s*[·•|]\s*([^·•|]+)$/.exec(title);
    if (dot && citiesIn(dot[2] ?? "").length > 0) {
      title = dot[1]!.trim();
      locations = citiesIn(dot[2] ?? "");
    }
    const tkey = foldText(`${title} ${locations?.join(" ") ?? ""}`);
    const ukey = linkKey(c.url);
    if (seenUrls.has(ukey) || seenTitles.has(tkey)) continue;
    seenUrls.add(ukey);
    seenTitles.add(tkey);
    roles.push({ title, applyUrl: c.url, ...(locations ? { locations } : {}), source: "anchors" });
  }
  return roles.length >= 2 ? roles : null;
}

/** "Apply Link : Click Here(Pune-Link1), Click Here(Pune- Link2), Click Here(Mysore)" → one role per location link. */
function locationLinkRoles(model: ContentModel, cands: ApplyCandidate[], title: string): RoleSpec[] | null {
  for (const line of model.lines) {
    if (line.links.length < 2) continue;
    const linkCands = line.links
      .map((l) => ({ l, c: cands.find((c) => c.occurrences.includes(l)) }))
      .filter((x): x is { l: (typeof line.links)[number]; c: ApplyCandidate } => !!x.c && x.c.score >= MIN_APPLY_SCORE);
    const distinct = new Set(linkCands.map((x) => linkKey(x.c.url)));
    if (distinct.size < 2) continue;
    const generic = linkCands.every((x) => /^(?:click here|apply(?: here| now)?|link\s*\d*|here)$/i.test(x.l.text.trim()));
    if (!generic) continue;
    const roles: RoleSpec[] = [];
    const seen = new Set<string>();
    for (const { l, c } of linkCands) {
      const k = linkKey(c.url);
      if (seen.has(k)) continue;
      seen.add(k);
      const annotation = /^\s*\(([^)]{2,40})\)/.exec(l.after)?.[1] ?? /^\s*[-–:]\s*([^,;]{2,30})/.exec(l.after)?.[1] ?? "";
      const cities = citiesIn(annotation);
      roles.push({ title, applyUrl: c.url, locations: cities.length > 0 ? cities : undefined, source: "location-links" });
    }
    if (roles.length >= 2 && roles.some((r) => r.locations)) return roles;
  }
  return null;
}

/** Returns ≥ 2 roles when the post clearly lists several, else null (single role). */
export function detectRoles(model: ContentModel, cands: ApplyCandidate[], company: string | null, singleTitle: string | null): RoleSpec[] | null {
  return tableRoles(model, cands, company) ?? anchorRoles(cands, company) ?? (singleTitle ? locationLinkRoles(model, cands, singleTitle) : null);
}
