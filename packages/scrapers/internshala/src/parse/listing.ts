import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { Sel } from "./dom";
import type { InternshalaKind, ListingCard, ListingPage } from "../types";
import { absoluteUrl, cleanText, firstInt, textOrNull, uniqueCi } from "./text";

/** Detail pages that robots.txt allows: /internship/detail/… and /job/detail/… (NOT the plural /details/). */
export const DETAIL_PATH_RE = /^\/(internship|job)\/detail\/[^/?#,]+$/;

export function toKind(value: string | null | undefined): InternshalaKind | null {
  const v = cleanText(value).toLowerCase();
  return v === "internship" || v === "job" ? v : null;
}

/** Text of the `<span>` that follows an `<i class="ic-16-…">` icon inside a card's detail row. */
function iconValue($: CheerioAPI, scope: Sel, icon: string): string | null {
  const item = scope.find(`i.${icon}`).first().parent();
  if (item.length === 0) return null;
  // Jobs show "₹ 4,00,000 - 4,50,000" (desktop) and "₹ 4,00,000 - 4,50,000 /year" (mobile): prefer the complete one.
  const mobile = item.find("span.mobile").first();
  if (mobile.length > 0) return textOrNull(mobile.text());
  const span = item.find("span").first();
  return textOrNull(span.length > 0 ? span.text() : item.text());
}

export interface LocationInfo {
  locations: string[];
  isWfh: boolean;
  isHybrid: boolean;
  hybridNote: string | null;
}

/** The location row of a card (`.locations`) or detail page (`#location_names`). */
export function locationsOf($: CheerioAPI, scope: Sel): LocationInfo {
  const box = scope.find(".locations, #location_names").first();
  if (box.length === 0) return { locations: [], isWfh: false, isHybrid: false, hybridNote: null };
  // One <a> per city — or a single <a> holding "Dombivli, Mumbai, Virar".
  const anchors = box.find("a").toArray().flatMap((a) => $(a).text().split(","));
  const boxText = cleanText(box.text());
  const values = anchors.length > 0 ? anchors : boxText.replace(/\(hybrid\)/gi, "").split(",");
  const locations = uniqueCi(values.map((v) => v.replace(/\s*\(hybrid\)\s*$/i, "")));
  const isWfh = box.find("i.ic-16-home").length > 0 || locations.some((l) => /^(work from home|wfh|remote)$/i.test(l));
  const isHybrid = /\(hybrid\)/i.test(boxText);
  const hybridNote = isHybrid ? textOrNull(box.find("[data-popover_content]").first().attr("data-popover_content")) : null;
  return { locations, isWfh, isHybrid, hybridNote };
}

function logoOf(scope: Sel): string | null {
  const src = scope.find(".internship_logo img").first().attr("src");
  if (!src || /placeholder/i.test(src)) return null;
  return absoluteUrl(src, { keepQuery: true });
}

/** `.company_name` text without the "Actively hiring" badge it also contains. */
function companyFallback(card: Sel): string {
  const box = card.find(".company_name").first().clone();
  box.find(".actively-hiring-badge, .actively_hiring_badge, i, img").remove();
  return cleanText(box.text());
}

/** The comma-separated `pinned_internship_ids` script variable (promoted cards on page 1). */
function pinnedIds(html: string): Set<string> {
  const m = html.match(/pinned_internship_ids\s*=\s*["']([\d,\s]*)["']/);
  return new Set((m?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

function parseCard($: CheerioAPI, card: Sel, pinned: Set<string>): ListingCard | null {
  const id = cleanText(card.attr("internshipid"));
  const titleLink = card.find("a.job-title-href, .job-internship-name a").first();
  const href = card.attr("data-href") ?? titleLink.attr("href");
  const url = absoluteUrl(href);
  const kind = toKind(card.attr("employment_type")) ?? (url?.includes("/job/detail/") ? "job" : "internship");
  const title = cleanText(titleLink.text() || card.find(".job-internship-name").first().text());
  const company = cleanText(card.find(".company-name").first().text()) || companyFallback(card);
  if (!/^\d+$/.test(id) || !url || !title || !company) return null;

  const { locations, isWfh, isHybrid, hybridNote } = locationsOf($, card);
  const labels = card
    .find(".gray-labels .status-li span")
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter(Boolean);
  const ppo = card.find(".gray-labels .ppo_status").first();
  const snippet = textOrNull(card.find(".about_job .text").first().text());

  return {
    id,
    kind,
    path: new URL(url).pathname,
    url,
    title,
    company,
    logoUrl: logoOf(card),
    locations,
    isWfh,
    isHybrid,
    hybridNote,
    salaryText: iconValue($, card.find(".detail-row-1"), "ic-16-money"),
    durationText: iconValue($, card.find(".detail-row-1"), "ic-16-calendar"),
    experienceText: iconValue($, card.find(".detail-row-1"), "ic-16-briefcase"),
    postedText: textOrNull(card.find(".color-labels i.ic-16-reschedule").first().parent().text()),
    labels: uniqueCi(labels),
    ppoText: ppo.length > 0 ? textOrNull(ppo.text()) : null,
    activelyHiring: card.find(".actively-hiring-badge").length > 0,
    earlyApplicant: card.find(".early_applicant_wrapper").length > 0,
    skills: uniqueCi(card.find(".job_skills .job_skill").toArray().map((el) => $(el).text())),
    snippet,
    pinned: pinned.has(id),
  };
}

/** Parse an Internshala listing page (/internships/…, /jobs/…, /fresher-jobs/…, …-for-women/…). */
export function parseListingPage(html: string): ListingPage {
  const $ = cheerio.load(html);
  const pinned = pinnedIds(html);
  const container = $("#internship_list_container");
  const scope: Sel = container.length > 0 ? container : $.root();
  const nodes = scope.find(".individual_internship[internshipid]").toArray();

  const cards: ListingCard[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const node of nodes) {
    const card = parseCard($, $(node), pinned);
    if (!card) {
      skipped++;
      continue;
    }
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
  }

  const pagination = $("#pagination");
  const pageNumbers = pagination
    .find("[data-page]")
    .toArray()
    .map((el) => Number($(el).attr("data-page")))
    .filter((n) => Number.isInteger(n) && n > 0);
  const current = Number(pagination.find(".current_block").first().attr("data-page"));
  const page = Number.isInteger(current) && current > 0 ? current : null;
  const lastPage = pageNumbers.length > 0 ? Math.max(...pageNumbers) : page;
  const isLastPageFlag = cleanText($("#isLastPage").attr("value")) === "1";
  const isLastPage = isLastPageFlag || (page !== null && lastPage !== null && page >= lastPage) || cards.length === 0;

  return {
    kind: toKind(pagination.attr("data-employment-type")),
    cards,
    page,
    lastPage,
    isLastPage,
    totalCount: firstInt($("h1.page-heading, h1.heading").first().text()),
    skipped,
  };
}
