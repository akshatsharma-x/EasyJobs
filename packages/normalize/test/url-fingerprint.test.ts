import { describe, expect, it } from "vitest";
import type { JobLocation } from "@easyjobs/contract";
import { canonicalJobKey, canonicalUrl, fingerprint, fingerprintDetailed, isJobSpecificUrl, isOfficialHost, sha1, stripTracking } from "../src/index";

describe("canonicalUrl", () => {
  it.each([
    ["https://www.Example.com/Careers/Job/?utm_source=a&b=2&a=1#apply", "https://example.com/Careers/Job?a=1&b=2"],
    ["http://example.com/jobs/123/", "https://example.com/jobs/123"],
    ["https://example.com/jobs/123?gclid=x&fbclid=y&ref=linkedin&id=9", "https://example.com/jobs/123?id=9"],
    ["https://example.com:443/a//b;jsessionid=XYZ", "https://example.com/a/b"],
    ["www.example.com/jobs?jobId=5", "https://example.com/jobs?jobId=5"],
    ["https://example.com", "https://example.com"],
    ["https://jobs.example.com/#/job/123", "https://jobs.example.com#/job/123"],
    ["https://jobs.example.com/#!/job/456/", "https://jobs.example.com#!/job/456"],
    ["not a url", "not a url"],
  ])("%s → %s", (input, expected) => expect(canonicalUrl(input)).toBe(expected));
});

describe("canonicalJobKey — ATS-aware stable keys", () => {
  it.each([
    ["https://boards.greenhouse.io/stripe/jobs/4012345?gh_src=coursejoiner", "greenhouse:4012345"],
    ["https://job-boards.greenhouse.io/stripe/jobs/4012345", "greenhouse:4012345"],
    ["https://boards.eu.greenhouse.io/acme/jobs/4012345", "greenhouse:4012345"],
    ["https://stripe.com/jobs/search?gh_jid=4012345", "greenhouse:4012345"],
    ["https://boards.greenhouse.io/embed/job_app?for=stripe&token=4012345", "greenhouse:4012345"],
    ["https://boards-api.greenhouse.io/v1/boards/stripe/jobs/4012345", "greenhouse:4012345"],
    ["https://jobs.lever.co/palantir/5d2b4f1e-1234-4abc-9def-0123456789ab/apply?lever-source=LinkedIn", "lever:5d2b4f1e-1234-4abc-9def-0123456789ab"],
    ["https://jobs.eu.lever.co/acme/5D2B4F1E-1234-4ABC-9DEF-0123456789AB", "lever:5d2b4f1e-1234-4abc-9def-0123456789ab"],
    ["https://jobs.ashbyhq.com/openai/0b7c6e1a-2f3d-4e5f-8a9b-1c2d3e4f5a6b/application", "ashby:0b7c6e1a-2f3d-4e5f-8a9b-1c2d3e4f5a6b"],
    ["https://openai.com/careers/x?ashby_jid=0b7c6e1a-2f3d-4e5f-8a9b-1c2d3e4f5a6b", "ashby:0b7c6e1a-2f3d-4e5f-8a9b-1c2d3e4f5a6b"],
    ["https://jobs.smartrecruiters.com/Visa/743999912345678-software-engineer", "smartrecruiters:743999912345678"],
    ["https://apply.workable.com/acme/j/1A2B3C4D5E/", "workable:1A2B3C4D5E"],
    ["https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Senior-Software-Engineer_JR1993026?utm_source=x", "workday:nvidia:JR1993026"],
    ["https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/details/Senior-Software-Engineer_JR1993026-1", "workday:nvidia:JR1993026"],
    ["https://wd3.myworkdaysite.com/recruiting/walmart/WalmartExternal/job/Bangalore/Software-Engineer-III_R-1234567-1", "workday:walmart:R-1234567"],
    ["https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/250012345", "oracle:eeho:250012345"],
    ["https://careers.oracle.com/jobs/#en/sites/jobsearch/job/287654", "oracle:oracle:287654"],
    ["https://explore.jobs.netflix.net/careers/job/790298011234", "eightfold:explore.jobs.netflix.net:790298011234"],
    ["https://careers.qualcomm.com/careers?pid=446701234567&domain=qualcomm.com", "eightfold:qualcomm.com:446701234567"],
    ["https://www.amazon.jobs/en/jobs/2712345/software-development-engineer", "amazon:2712345"],
    ["https://www.google.com/about/careers/applications/jobs/results/123456789012345678-software-engineer", "google:123456789012345678"],
    ["https://jobs.careers.microsoft.com/global/en/job/1789123/Software-Engineer", "microsoft:1789123"],
    // The trailing digits are the repost time, not an id: a repost keeps the key.
    ["https://internshala.com/internship/detail/web-development-internship-in-bangalore-at-acme1730716428", "internshala:internship:web-development-internship-in-bangalore-at-acme"],
    ["https://internshala.com/internship/detail/web-development-internship-in-bangalore-at-acme1764100000?utm_source=x", "internshala:internship:web-development-internship-in-bangalore-at-acme"],
    ["https://internshala.com/job/detail/fresher-java-developer-job-at-acme1730000001", "internshala:job:fresher-java-developer-job-at-acme"],
    ["https://in.linkedin.com/jobs/view/software-engineer-at-google-3712345678?refId=abc&trackingId=xyz", "linkedin:3712345678"],
    ["https://www.linkedin.com/jobs/search/?currentJobId=3712345678", "linkedin:3712345678"],
    ["https://www.naukri.com/job-listings-software-engineer-acme-bengaluru-0-to-2-years-151124012345", "naukri:151124012345"],
    ["https://unstop.com/jobs/software-engineer-acme-1234567", "unstop:1234567"],
    ["https://acme.recruitee.com/o/backend-engineer", "recruitee:acme:backend-engineer"],
    ["https://acme.bamboohr.com/careers/123", "bamboohr:acme:123"],
    ["https://in.indeed.com/viewjob?jk=abc123def", "indeed:abc123def"],
    ["https://app.joinsuperset.com/join/#/signup/student/jobprofiles/f4c4bab5-5bb1-4e87-8c40-bbc000000001", "superset:f4c4bab5-5bb1-4e87-8c40-bbc000000001"],
    ["https://app.joinsuperset.com/join/#/signup/student?jp=451f5fb6-c3eb-4cee-9828-6f285fe9a131", "superset:451f5fb6-c3eb-4cee-9828-6f285fe9a131"],
    ["https://careers.acme.com/jobs/senior-backend-engineer?utm_campaign=x", "https://careers.acme.com/jobs/senior-backend-engineer"],
  ])("%s → %s", (url, key) => expect(canonicalJobKey(url)).toBe(key));

  it("never throws on garbage", () => {
    for (const v of [null, undefined, 42, {}, "", "javascript:alert(1)", "https://", "ftp://x.com/a"]) expect(typeof canonicalJobKey(v)).toBe("string");
  });
});

describe("official hosts and job-specific URLs", () => {
  it.each([
    ["https://boards.greenhouse.io/stripe/jobs/1", true],
    ["https://careers.razorpay.com/jobs/123", true],
    ["https://www.linkedin.com/jobs/view/123", false],
    ["https://www.naukri.com/job-listings-x-123456789012", false],
    ["https://coursejoiner.com/post", false],
    ["https://internshala.com/internship/detail/x1730716428", false],
    ["https://bit.ly/3abc", false],
    ["https://forms.gle/abc", false],
    ["https://wa.me/919876543210", false],
    ["https://t.me/jobs", false],
    ["https://www.google.com/url?q=https://x.com", false],
    ["https://unknown.invalid/x/1", false],
  ])("isOfficialHost(%s) = %s", (url, expected) => expect(isOfficialHost(url)).toBe(expected));

  it.each([
    ["https://boards.greenhouse.io/stripe/jobs/4012345", true],
    ["https://careers.acme.com/jobs/senior-backend-engineer", true],
    ["https://careers.acme.com/apply?jobId=77", true],
    ["https://careers.acme.com/job/REQ-1234", true],
    ["https://www.meesho.io/jobs/data-analyst-4321", true],
    ["https://nextstep.tcs.com/campus/", false],
    ["https://www.tcs.com/careers/india/tcs-off-campus-hiring", false],
    ["https://www.hdfcbank.com/personal/about-us/careers", false],
    ["https://acme.com/", false],
    ["https://acme.com/careers/2025/", false],
  ])("isJobSpecificUrl(%s) = %s", (url, expected) => expect(isJobSpecificUrl(url)).toBe(expected));

  it("stripTracking keeps ATS params but drops utm/gclid", () => {
    expect(stripTracking("https://x.com/jobs/1?gh_jid=1&utm_source=a&gclid=b")).toBe("https://x.com/jobs/1?gh_jid=1");
    expect(stripTracking("https://x.com/jobs/1?id=1")).toBe("https://x.com/jobs/1?id=1");
  });
});

describe("fingerprint (§0.4)", () => {
  const blr: JobLocation[] = [{ raw: "Bangalore", city: "Bengaluru", state: "Karnataka", country: "IN" }];

  it("rule 1: official apply URL → k: + sha1(canonicalJobKey)", () => {
    const r = fingerprintDetailed({ applyUrl: "https://boards.greenhouse.io/stripe/jobs/4012345", companySlug: "stripe", title: "SWE", jobType: "full_time" });
    expect(r).toEqual({ rule: "k", key: "greenhouse:4012345", fingerprint: `k:${sha1("greenhouse:4012345")}` });
  });
  it("an aggregator post linking to the official posting merges with the ATS record", () => {
    const ats = fingerprint({ applyUrl: "https://boards.greenhouse.io/razorpay/jobs/4012345", companySlug: "razorpay", title: "SDE 1", jobType: "full_time" });
    const blog = fingerprint({ applyUrl: "https://razorpay.com/jobs/?gh_jid=4012345&utm_source=coursejoiner", companySlug: "razorpay-software", title: "Razorpay Hiring SDE-1", jobType: "full_time" });
    expect(blog).toBe(ats);
  });
  it("rule 2: job boards, shorteners and generic careers pages → t: + sha1(company|title|city|type)", () => {
    for (const applyUrl of ["https://www.linkedin.com/jobs/view/3712345678", "https://bit.ly/x", "https://nextstep.tcs.com/campus/", null]) {
      const r = fingerprintDetailed({ applyUrl, companySlug: "tcs", title: "Assistant System Engineer", locations: blr, jobType: "full_time" });
      expect(r.rule).toBe("t");
      expect(r.key).toBe("tcs|assistant system engineer|bengaluru|full_time");
      expect(r.fingerprint).toBe(`t:${sha1(r.key)}`);
    }
  });
  it("rule 2 uses 'remote' for remote jobs and normalizes the title", () => {
    const a = fingerprint({ applyUrl: null, companySlug: "acme", title: "Sr. Backend Engineer (Remote)", isRemote: true, jobType: "full_time" });
    const b = fingerprint({ applyUrl: null, companySlug: "acme", title: "Senior Backend Engineer", isRemote: true, locations: blr, jobType: "full_time" });
    expect(a).toBe(b);
    expect(fingerprintDetailed({ applyUrl: null, companySlug: "acme", title: "X", isRemote: true, jobType: "internship" }).key).toBe("acme|x|remote|internship");
  });
  it("different job types or cities do not collide", () => {
    const base = { applyUrl: null, companySlug: "acme", title: "Analyst" } as const;
    expect(fingerprint({ ...base, jobType: "internship" })).not.toBe(fingerprint({ ...base, jobType: "full_time" }));
    expect(fingerprint({ ...base, jobType: "full_time", locations: blr })).not.toBe(fingerprint({ ...base, jobType: "full_time" }));
  });
});
