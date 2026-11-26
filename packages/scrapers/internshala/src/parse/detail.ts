import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { Sel } from "./dom";
import type { DetailPage, DetailSection, JobPostingLd, SectionKind } from "../types";
import { cleanBlock, fragmentText } from "./html";
import { extractJobPosting } from "./jsonld";
import { locationsOf, toKind } from "./listing";
import { absoluteUrl, cleanText, firstInt, stripListNumber, textOrNull, uniqueCi } from "./text";

export const WOMEN_RESTART_RE = /women\s+wanting\s+to\s+start\s*\/?\s*restart\s+their\s+career/i;
const WHO_CAN_APPLY_INTRO_RE = /^only those candidates can apply who:?$/i;

/** Classify a section heading ("About the work from home job/internship", "Skill(s) required", …). */
export function sectionKind(heading: string): SectionKind {
  const h = cleanText(heading).toLowerCase();
  if (/^about (the )?(internship|job|program|programme|role|work from home|opportunity)/.test(h)) return "about";
  if (/skill/.test(h)) return "skills";
  if (/who can apply|eligibility/.test(h)) return "who_can_apply";
  if (/other requirement/.test(h)) return "other_requirements";
  if (/^(salary|stipend|ctc|compensation)/.test(h)) return "salary";
  if (/perk/.test(h)) return "perks";
  if (/reward|incentive/.test(h)) return "rewards";
  if (/additional information/.test(h)) return "additional";
  if (/number of openings|openings/.test(h)) return "openings";
  if (/^about\b/.test(h)) return "company";
  return "other";
}

function scriptVar(html: string, name: string): string | null {
  const m = html.match(new RegExp(`\\b${name}\\s*=\\s*["']?([\\w-]+)["']?\\s*;`));
  return m?.[1] ?? null;
}

/** Lines of a "who can apply"-style block: one per <p> or <li>, list numbers stripped. */
function linesOf($: CheerioAPI, body: Sel): string[] {
  const nodes = body.find("li").length > 0 ? body.find("li") : body.find("p");
  const lines =
    nodes.length > 0
      ? nodes.toArray().map((el) => cleanText($(el).text()))
      : fragmentText(body.toArray().map((el) => $.html(el)).join("")).split("\n");
  return lines.map(stripListNumber).filter(Boolean);
}

function parseSections($: CheerioAPI): DetailSection[] {
  const details = $(".internship_details").first();
  const sections: DetailSection[] = [];
  details.find(".section_heading").each((_, el) => {
    const headingEl = $(el);
    const heading = cleanText(headingEl.text());
    if (!heading) return;
    const kind = sectionKind(heading);
    const body = headingEl
      .nextUntil(".section_heading")
      .not(".training_skills_container, .activity_section, .buttons_container, .modal, script, style, input");
    let items: string[] = [];
    if (kind === "skills" || kind === "perks") {
      items = uniqueCi(body.find(".round_tabs").toArray().map((t) => $(t).text()));
      if (items.length === 0) items = uniqueCi(cleanText(body.text()).split(/,|\n/));
    } else if (kind === "salary") {
      items = body
        .filter(".salary_container")
        .add(body.find(".salary_container"))
        .find("p")
        .toArray()
        .map((p) => cleanText($(p).text()))
        .filter(Boolean);
    } else if (kind === "who_can_apply" || kind === "other_requirements" || kind === "additional" || kind === "rewards") {
      items = linesOf($, body);
    }
    const contentHtml =
      kind === "company"
        ? body.filter(".about_company_text_container").add(body.find(".about_company_text_container")).html() ?? ""
        : body
            .not(".probation-salary-container")
            .toArray()
            .map((n) => $.html(n))
            .join("");
    sections.push({ heading, kind, html: cleanBlock(contentHtml), text: fragmentText(contentHtml), items });
  });
  return sections;
}

function parseProbation($: CheerioAPI): DetailPage["probation"] {
  const box = $(".probation-salary-container").first();
  if (box.length === 0 || /display\s*:\s*none/i.test(box.attr("style") ?? "")) return null;
  const texts = box.find(".probation-text").toArray().map((el) => cleanText($(el).text()));
  const duration = textOrNull(texts.find((t) => /^duration/i.test(t))?.replace(/^duration\s*:?\s*/i, ""));
  const salary = textOrNull(texts.find((t) => /^salary during probation/i.test(t))?.replace(/^salary during probation\s*:?\s*/i, ""));
  return duration || salary ? { duration, salary } : null;
}

/** Split the JSON-LD description ("<p>About the internship:</p>…<p>Who can apply:</p>…") into known sections. */
const LD_HEADINGS =
  /<p>\s*(About the [^<:]{2,40}|About Company|Who can apply|Stipend|Salary|Experience|Deadline|Other perks|Perks|Skills required|Other Requirements|Additional information|Rewards and incentives|Number of openings|Probation)\s*:\s*<\/p>/gi;

export function splitLdDescription(html: string | null | undefined): { heading: string; html: string }[] {
  if (!html) return [];
  const marks = [...html.matchAll(LD_HEADINGS)];
  return marks.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? (marks[i + 1]?.index ?? html.length) : html.length;
    return { heading: cleanText(m[1]), html: html.slice(start, end).trim() };
  });
}

function ldWhoCanApply(ld: JobPostingLd | null): string[] {
  const part = splitLdDescription(ld?.descriptionHtml).find((s) => /^who can apply$/i.test(s.heading));
  if (!part) return [];
  const $ = cheerio.load(`<div id="__r">${part.html}</div>`, null, false);
  return $("#__r li")
    .toArray()
    .map((el) => stripListNumber(cleanText($(el).text())))
    .filter(Boolean);
}

/** Header "other_detail_item" blocks: Start Date, Duration, Stipend / CTC (ANNUAL), Experience, Apply By. */
function headerItems($: CheerioAPI): Map<string, ReturnType<CheerioAPI>> {
  const out = new Map<string, ReturnType<CheerioAPI>>();
  $(".detail_view .other_detail_item").each((_, el) => {
    const item = $(el);
    const label = cleanText(item.find(".item_heading").first().text()).toLowerCase();
    if (label && !out.has(label)) out.set(label, item);
  });
  return out;
}

function itemBodyText(item: ReturnType<CheerioAPI> | undefined, prefer: string[] = []): string | null {
  if (!item) return null;
  for (const sel of prefer) {
    const t = textOrNull(item.find(sel).first().text());
    if (t) return t;
  }
  return textOrNull(item.find(".item_body").first().text());
}

/**
 * Parse an Internshala detail page (/internship/detail/… or /job/detail/…).
 * Returns null when the page has neither the detail markup nor a JobPosting (e.g. an error page).
 */
export function parseDetailPage(html: string): DetailPage | null {
  const $ = cheerio.load(html);
  const jsonLd = extractJobPosting($('script[type="application/ld+json"]').toArray().map((el) => $(el).html() ?? ""));
  const root = $(".detail_view").first();
  if (root.length === 0 && !jsonLd) return null;

  const card = root.find(".individual_internship").first();
  const id = textOrNull(card.attr("internshipid")) ?? scriptVar(html, "internship_id");
  const kind =
    toKind(scriptVar(html, "employment_type")) ??
    (root.find(".individual_internship_job").length > 0 ? "job" : root.find(".individual_internship_internship").length > 0 ? "internship" : null);

  const companyLink = root.find(".company_name a").first();
  const company = textOrNull(companyLink.text()) ?? textOrNull(root.find(".company_name").first().text()) ?? jsonLd?.organization.name ?? null;
  const logoSrc = root.find(".internship_logo img").first().attr("src");

  const loc = locationsOf($, root);
  const isWfh = loc.isWfh || /telecommute/i.test(jsonLd?.jobLocationType ?? "");

  const items = headerItems($);
  const find = (re: RegExp): ReturnType<CheerioAPI> | undefined => [...items.entries()].find(([k]) => re.test(k))?.[1];
  const startItem = find(/start date/);
  const startDesktop = textOrNull(startItem?.find(".start_immediately_desktop").first().text());
  const startText = startDesktop ?? textOrNull(itemBodyText(startItem)?.replace(/^starts\s*/i, ""));

  const labels: string[] = [];
  let postedText: string | null = null;
  root.find(".tags_container_outer .status").each((_, el) => {
    const node = $(el);
    const t = cleanText(node.text());
    if (!t) return;
    if (node.find("i.ic-16-reschedule").length > 0 || /^posted\b/i.test(t)) postedText = t.replace(/^posted\s+/i, "");
    else labels.push(t);
  });
  const appText = cleanText(root.find(".applications_message").first().text());

  const sections = parseSections($);
  const byKind = (k: SectionKind): DetailSection | undefined => sections.find((s) => s.kind === k);
  const htmlWho = byKind("who_can_apply")?.items.filter((l) => !WHO_CAN_APPLY_INTRO_RE.test(l)) ?? [];
  const ldWho = ldWhoCanApply(jsonLd).filter((l) => !WHO_CAN_APPLY_INTRO_RE.test(l));
  const whoCanApply = (ldWho.length > htmlWho.length ? ldWho : htmlWho).map((l) => l.replace(/^\*\s*/, ""));
  const companySection = byKind("company");
  const website = $(".internship_details .website_link a").first().attr("href") ?? null;
  const openingsText = byKind("openings")?.text;

  return {
    id,
    kind,
    status: textOrNull($("#status").attr("value")),
    title: textOrNull(root.find(".profile").first().text()),
    company,
    companyPageUrl: absoluteUrl(companyLink.attr("href")),
    logoUrl: logoSrc && !/placeholder/i.test(logoSrc) ? absoluteUrl(logoSrc, { keepQuery: true }) : jsonLd?.organization.logo ?? null,
    locations: loc.locations,
    isWfh,
    isHybrid: loc.isHybrid,
    hybridNote: loc.hybridNote,
    startDateText: startText,
    durationText: itemBodyText(find(/^duration/)),
    salaryText: itemBodyText(find(/stipend|ctc|salary/), [".stipend", "span.mobile"]),
    experienceText: itemBodyText(find(/experience/), [".desktop-text"]),
    applyByText: itemBodyText(find(/apply by/)),
    postedText,
    labels: uniqueCi(labels),
    applicants: /applicant/i.test(appText) && !/early applicant/i.test(appText) ? firstInt(appText) : null,
    activelyHiring: root.find(".actively_hiring_badge").length > 0,
    earlyApplicant: /early applicant/i.test(appText),
    sections,
    skills: byKind("skills")?.items ?? jsonLd?.skills ?? [],
    perks: byKind("perks")?.items ?? [],
    whoCanApply,
    otherRequirements: byKind("other_requirements")?.items ?? [],
    openings: (openingsText ? firstInt(openingsText) : null) ?? jsonLd?.totalJobOpenings ?? null,
    salaryLines: byKind("salary")?.items ?? [],
    probation: parseProbation($),
    aboutCompany: textOrNull(companySection?.text),
    companyWebsite: absoluteUrl(website, { keepQuery: true }),
    companyActivity: root.length > 0 ? $(".activity_section .activity .text").toArray().map((el) => cleanText($(el).text())).filter(Boolean) : [],
    womenCanApply: whoCanApply.some((l) => WOMEN_RESTART_RE.test(l)) || WOMEN_RESTART_RE.test(jsonLd?.descriptionHtml ?? ""),
    jsonLd,
  };
}
