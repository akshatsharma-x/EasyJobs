import { isoFromEpochOrDate } from "../shared/relative-time";
import { absoluteUrl, cleanText, uniqueCi } from "../shared/text";
import { asArray, asRecord, bool, labels, num, str } from "./json";
import { parseSalaryDetail, type NaukriSalary } from "./parse-search";

/** The job-detail API response a Naukri job page receives. Job data only — recruiter contact details are ignored. */
export interface NaukriDetail {
  jobId: string | null;
  title: string | null;
  companyName: string | null;
  companyWebsite: string | null;
  descriptionHtml: string | null;
  /** "Full Time, Permanent" */
  employmentType: string | null;
  roleCategory: string | null;
  role: string | null;
  industry: string | null;
  /** functionalArea / department — "Engineering - Software & QA" */
  department: string | null;
  education: { ug: string[]; pg: string[]; doctorate: string[] };
  skills: string[];
  experienceMin: number | null;
  experienceMax: number | null;
  salary: NaukriSalary | null;
  salaryLabel: string | null;
  locations: string[];
  /** "Apply on company site" target, when the job redirects off Naukri */
  applyRedirectUrl: string | null;
  createdAt: string | null;
  walkIn: boolean;
}

export function parseNaukriDetail(payload: unknown): NaukriDetail | null {
  const root = asRecord(payload);
  const d = asRecord(root?.jobDetails) ?? (root && "jobId" in root ? root : null);
  if (!d) return null;
  const company = asRecord(d.companyDetail);
  const education = asRecord(d.education);
  const keySkills = asRecord(d.keySkills);
  const salaryDetail = asRecord(d.salaryDetail);
  const apply = absoluteUrl(str(d.applyRedirectUrl) ?? str(d.companyApplyUrl));
  const description = str(d.description);

  return {
    jobId: str(d.jobId),
    title: cleanText(str(d.title)),
    companyName: cleanText(str(company?.name) ?? str(d.companyName)),
    companyWebsite: absoluteUrl(str(company?.websiteUrl)),
    descriptionHtml: description,
    employmentType: cleanText(str(d.employmentType)),
    roleCategory: cleanText(str(d.roleCategory)),
    role: cleanText(str(d.jobRole) ?? str(d.role)),
    industry: cleanText(str(d.industry) ?? str(d.industryType)),
    department: cleanText(str(d.functionalArea) ?? str(d.department)),
    education: {
      ug: educationList(education?.ug),
      pg: educationList(education?.pg),
      doctorate: educationList(education?.ppg ?? education?.doctorate),
    },
    skills: uniqueCi([...labels(keySkills?.preferred), ...labels(keySkills?.other)]),
    experienceMin: num(d.minimumExperience),
    experienceMax: num(d.maximumExperience),
    salary: parseSalaryDetail(salaryDetail),
    salaryLabel: cleanText(str(salaryDetail?.label)),
    locations: uniqueCi(asArray(d.locations).map((l) => cleanText(str(asRecord(l)?.label) ?? str(l))).filter((l): l is string => l !== null)),
    applyRedirectUrl: apply && !/(^|\.)naukri\.com$/.test(new URL(apply).hostname) ? apply : null,
    createdAt: isoFromEpochOrDate(d.createdDate),
    walkIn: bool(d.walkIn) || bool(d.isWalkIn) || asRecord(d.walkInVenue) !== null,
  };
}

/** Education arrives as ["B.Tech/B.E. in Any Specialization"] or "B.Tech/B.E. in Any Specialization, MCA". */
function educationList(v: unknown): string[] {
  if (typeof v === "string") return uniqueCi(v.split(/,(?![^()]*\))/).map((s) => s.trim()).filter(Boolean));
  return uniqueCi(asArray(v).map((x) => cleanText(str(x) ?? str(asRecord(x)?.label))).filter((x): x is string => x !== null));
}

/**
 * The job page shows Role / Industry / Department / Employment type / Education under the description;
 * keep them with it (as the page does) so the normalizer can read degrees and category from one place.
 */
export function descriptionWithFacts(detail: NaukriDetail): string | null {
  const facts: [string, string | null][] = [
    ["Role", detail.role],
    ["Industry Type", detail.industry],
    ["Department", detail.department],
    ["Employment Type", detail.employmentType],
    ["Role Category", detail.roleCategory],
    ["Education (UG)", detail.education.ug.join(", ") || null],
    ["Education (PG)", detail.education.pg.join(", ") || null],
    ["Education (Doctorate)", detail.education.doctorate.join(", ") || null],
  ];
  const rows = facts.filter((f): f is [string, string] => f[1] !== null).map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`);
  if (!detail.descriptionHtml && rows.length === 0) return null;
  return [detail.descriptionHtml ?? "", rows.length > 0 ? `<ul>${rows.join("")}</ul>` : ""].filter(Boolean).join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
