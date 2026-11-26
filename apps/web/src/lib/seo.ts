import type { JobDetail, JobType } from "@easyjobs/contract";
import { SITE_URL } from "@/lib/env";

export const absoluteUrl = (path: string): string => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

type TermsSubject = { isOfficial: boolean; sources: { terms?: { noJobPostingSchema?: boolean; noThirdPartySyndication?: boolean } }[] };

/**
 * Contract 1.1 source terms: some feeds forbid JobPosting structured data / syndication (Remotive, Himalayas).
 * An official source (career site / ATS) lifts the restriction — the job is then listed from the company's own page.
 */
export function allowsJobPostingSchema(job: TermsSubject): boolean {
  return job.isOfficial || !job.sources.some((s) => s.terms?.noJobPostingSchema);
}

export function allowsSyndication(job: TermsSubject): boolean {
  return job.isOfficial || !job.sources.some((s) => s.terms?.noThirdPartySyndication);
}

const EMPLOYMENT_TYPE: Record<JobType, string> = {
  internship: "INTERN",
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  temporary: "TEMPORARY",
  apprenticeship: "OTHER",
  freelance: "CONTRACTOR",
};

const UNIT: Record<"hour" | "month" | "year", string> = { hour: "HOUR", month: "MONTH", year: "YEAR" };

/** Schema.org JobPosting for Google for Jobs. */
export function jobPostingJsonLd(job: JobDetail, url: string): Record<string, unknown> {
  const places = job.locations
    .filter((l) => !/^remote/i.test(l))
    .map((l) => {
      const [locality, country] = l.split(",").map((s) => s.trim());
      return {
        "@type": "Place",
        address: { "@type": "PostalAddress", addressLocality: locality, ...(country ? { addressCountry: country } : {}) },
      };
    });
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.descriptionHtml ?? job.summary ?? job.title,
    datePosted: job.postedAt,
    ...(job.validThrough ? { validThrough: job.validThrough } : {}),
    employmentType: EMPLOYMENT_TYPE[job.jobType],
    identifier: { "@type": "PropertyValue", name: job.company.name, value: job.id },
    hiringOrganization: {
      "@type": "Organization",
      name: job.company.name,
      ...(job.company.domain ? { sameAs: `https://${job.company.domain}` } : {}),
      ...(job.company.logoUrl ? { logo: job.company.logoUrl } : {}),
    },
    url,
    directApply: false,
  };
  if (places.length > 0) data.jobLocation = places.length === 1 ? places[0] : places;
  if (job.isRemote || job.workMode === "remote") {
    data.jobLocationType = "TELECOMMUTE";
    data.applicantLocationRequirements = { "@type": "Country", name: "India" };
  }
  if (job.salary && (job.salary.min !== null || job.salary.max !== null)) {
    data.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salary.currency,
      value: {
        "@type": "QuantitativeValue",
        ...(job.salary.min !== null ? { minValue: job.salary.min } : {}),
        ...(job.salary.max !== null ? { maxValue: job.salary.max } : {}),
        unitText: UNIT[job.salary.period],
      },
    };
  }
  if (job.experienceMin !== null) {
    data.experienceRequirements = {
      "@type": "OccupationalExperienceRequirements",
      monthsOfExperience: Math.round(job.experienceMin * 12),
    };
  } else if (job.experienceLevel === "intern" || job.experienceLevel === "fresher") {
    data.experienceRequirements = "no requirements";
  }
  if (job.degrees.length > 0) {
    data.educationRequirements = { "@type": "EducationalOccupationalCredential", credentialCategory: job.degrees.join(", ") };
  }
  if (job.skills.length > 0) data.skills = job.skills.join(", ");
  return data;
}

/** Safe for embedding in <script type="application/ld+json">. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
