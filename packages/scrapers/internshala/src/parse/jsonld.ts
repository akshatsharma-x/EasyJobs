import type { JobPostingLd } from "../types";
import { cleanText, textOrNull } from "./text";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const isObject = (v: Json | undefined): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: Json | undefined): string | null {
  if (typeof v === "string") return textOrNull(v);
  if (typeof v === "number") return String(v);
  return null;
}

function num(v: Json | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseLenient(raw: string): Json | undefined {
  try {
    return JSON.parse(raw) as Json;
  } catch {
    try {
      // Unescaped control characters inside strings are the usual culprit.
      return JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ")) as Json;
    } catch {
      return undefined;
    }
  }
}

function* walk(node: Json | undefined): Generator<JsonObject> {
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item);
  } else if (isObject(node)) {
    yield node;
    if (node["@graph"] !== undefined) yield* walk(node["@graph"]);
  }
}

function hasType(node: JsonObject, type: string): boolean {
  const t = node["@type"];
  return t === type || (Array.isArray(t) && t.includes(type));
}

/** Extract the first schema.org JobPosting from the raw contents of `<script type="application/ld+json">` blocks. */
export function extractJobPosting(scripts: string[]): JobPostingLd | null {
  for (const raw of scripts) {
    for (const node of walk(parseLenient(raw.trim()))) {
      if (hasType(node, "JobPosting")) return toJobPosting(node);
    }
  }
  return null;
}

function toJobPosting(node: JsonObject): JobPostingLd {
  const org = isObject(node.hiringOrganization) ? node.hiringOrganization : {};
  const sameAs = Array.isArray(org.sameAs) ? org.sameAs[0] : org.sameAs;
  const exp = isObject(node.experienceRequirements) ? node.experienceRequirements : {};
  const applicant = Array.isArray(node.applicantLocationRequirements)
    ? node.applicantLocationRequirements[0]
    : node.applicantLocationRequirements;
  const identifier = isObject(node.identifier) ? node.identifier.value : node.identifier;
  const skills = typeof node.skills === "string" ? node.skills.split(",").map((s) => cleanText(s)).filter(Boolean) : [];
  return {
    title: str(node.title),
    descriptionHtml: typeof node.description === "string" ? node.description : null,
    datePosted: str(node.datePosted),
    validThrough: str(node.validThrough),
    employmentType: Array.isArray(node.employmentType)
      ? node.employmentType.map((v) => str(v)).filter(Boolean).join(", ") || null
      : str(node.employmentType),
    industry: str(node.industry),
    occupationalCategory: str(node.occupationalCategory),
    totalJobOpenings: num(node.totalJobOpenings),
    skills,
    jobLocationType: str(node.jobLocationType),
    applicantCountry: isObject(applicant) ? str(applicant.name) : str(applicant),
    locations: [...walk(node.jobLocation)]
      .map((place) => (isObject(place.address) ? place.address : null))
      .filter((a): a is JsonObject => a !== null)
      .map((a) => ({
        locality: str(a.addressLocality),
        region: str(a.addressRegion),
        country: isObject(a.addressCountry) ? str(a.addressCountry.name) : str(a.addressCountry),
      })),
    organization: { name: str(org.name), sameAs: str(sameAs), logo: str(isObject(org.logo) ? org.logo.url : org.logo) },
    baseSalary: toBaseSalary(node.baseSalary),
    monthsOfExperience: num(exp.monthsOfExperience),
    identifier: str(identifier),
  };
}

/** MonetaryAmount{currency, value: QuantitativeValue{minValue,maxValue|value, unitText}} (Internshala's shape), or a bare QuantitativeValue. */
function toBaseSalary(v: Json | undefined): JobPostingLd["baseSalary"] {
  if (!isObject(v)) return null;
  const qv = isObject(v.value) ? v.value : v;
  const min = num(qv.minValue) ?? num(qv.value);
  const max = num(qv.maxValue) ?? num(qv.value);
  if (min === null && max === null) return null;
  return { currency: str(v.currency) ?? str(qv.currency), min, max, unit: str(qv.unitText) ?? str(v.unitText) };
}
