import { describe, expect, it } from "vitest";
import { buildContentModel } from "../src/parse/dom";
import { bestApplyLink, scoreApplyLinks } from "../src/parse/apply";
import { companyKey } from "../src/parse/company";
import { classifyUrl } from "../src/parse/hosts";
import { cleanHref, looksJobSpecific, stripTracking, unwrapWrapperUrl } from "../src/util/url";
import { BLOG_HOSTS } from "./helpers";

const POST = "https://coursejoiner.com/job/example-post/";

function best(html: string, company: string, resolve?: Record<string, string>): string | null {
  const model = buildContentModel(html, POST);
  const cands = scoreApplyLinks(model, {
    company: companyKey(company),
    selfHost: "coursejoiner.com",
    extraBlogHosts: BLOG_HOSTS,
    resolve: resolve ? (u) => resolve[u] ?? u : undefined,
  });
  return bestApplyLink(cands)?.url ?? null;
}

describe("apply-link selection", () => {
  it("prefers the company's own deep link over a careers landing page and over another company's posting", () => {
    const html = `
      <h2>How to Apply</h2>
      <p>Visit the portal (<a href="https://jobs.ea.com/en_US/careers/JobDetail/Software-Engineering-Intern/216554">ea.com/careers</a>)</p>
      <p><strong>Official EA Careers Portal</strong> – <a href="https://www.ea.com/en/careers/early-careers">https://www.ea.com/en/careers/early-careers</a></p>
      <p><strong>Submitted Reference Link</strong> – <a href="https://careers.cisco.com/global/en/job/CISCISGLOBAL2032859EXTERNALENGLOBAL/ASIC">https://careers.cisco.com/…</a></p>`;
    expect(best(html, "Electronic Arts (EA)")).toBe("https://jobs.ea.com/en_US/careers/JobDetail/Software-Engineering-Intern/216554");
  });

  it("picks the link labelled 'Apply Link' and ignores WhatsApp / Telegram / Instagram / other-blog links", () => {
    const html = `
      <p>Apply Link : <a href="https://app.joinsuperset.com/company/cognizant/AT-UG3-2026.html">Click Here</a></p>
      <p>Join our Official WhatsApp Group : <a href="https://www.whatsapp.com/channel/0029Va98">Click Here</a></p>
      <p>Join our Official Telegram Channel : <a href="https://telegram.me/fresheroffcampus">Click Here</a></p>
      <p>Join our Official Instagram : <a href="https://www.instagram.com/fresheroffcampus_official">Click Here</a></p>
      <p>Also on <a href="https://freshershunt.in/cognizant-off-campus/">FreshersHunt</a></p>`;
    expect(best(html, "Cognizant")).toBe("https://app.joinsuperset.com/company/cognizant/AT-UG3-2026.html");
  });

  it("prefers an ATS posting over a job-board listing of the same job", () => {
    const html = `
      <p>Also listed on <a href="https://www.naukri.com/job-listings-graduate-trainee-cgi-bangalore-0-to-1-years-221125008113">Naukri</a></p>
      <p><strong>More Details</strong> <a href="https://cgi.njoyn.com/corp/xweb/xweb.asp?clid=21001&page=jobdetails&jobid=J1126-2044">CGI Recruitment</a></p>`;
    expect(best(html, "CGI")).toBe("https://cgi.njoyn.com/corp/xweb/xweb.asp?clid=21001&page=jobdetails&jobid=J1126-2044");
  });

  it("never uses internal links, 'Read More' related posts, google.com/search wrappers or homepages", () => {
    const html = `
      <p><strong>Read More:</strong> <a href="https://coursejoiner.com/internship/meesho-internship-2027/">Meesho Internship 2027</a></p>
      <p><a href="https://www.google.com/search?q=https://coursejoiner.com/job/hcl-tech-mega-hiring/">HCL Tech Mega Hiring</a></p>
      <p>Visit <a href="https://www.infosys.com/">infosys.com</a></p>`;
    expect(best(html, "Infosys")).toBeNull();
  });

  it("rejects job-board search/company pages but accepts a specific job-board posting", () => {
    expect(best(`<p>More Details <a href="https://www.naukri.com/capgemini-jobs-careers-649?src=jddesktop">Capgemini Jobs</a></p>`, "Capgemini")).toBeNull();
    expect(best(`<p>Apply Link – <a href="https://www.linkedin.com/jobs/view/4440719751/?trackingId=abc&refId=x">Apply</a></p>`, "Air India")).toBe(
      "https://www.linkedin.com/jobs/view/4440719751/",
    );
  });

  it("uses resolved shortener destinations", () => {
    const html = `<p>Apply Link: <a href="https://tinyurl.com/v9r7mtwd">Click Here to Apply</a></p>`;
    expect(best(html, "HCLTech", { "https://tinyurl.com/v9r7mtwd": "https://www.naukri.com/job-listings-gcp-data-engineer-hcltech-noida-5-to-10-years-220926017640" })).toBe(
      "https://www.naukri.com/job-listings-gcp-data-engineer-hcltech-noida-5-to-10-years-220926017640",
    );
  });

  it("accepts a Google Form when it is the registration route", () => {
    const html = `<p>Registration Link: <a href="https://docs.google.com/forms/d/e/1FAIpQLSdp/viewform">Register here</a></p>`;
    expect(best(html, "Micron")).toBe("https://docs.google.com/forms/d/e/1FAIpQLSdp/viewform");
  });
});

describe("URL helpers", () => {
  it("classifies hosts", () => {
    const o = { selfHost: "coursejoiner.com" };
    expect(classifyUrl("https://boards.greenhouse.io/rubrik/jobs/8166523", o)).toBe("ats");
    expect(classifyUrl("https://statestreet.wd1.myworkdayjobs.com/Global/job/Hyderabad/X_R-1", o)).toBe("ats");
    expect(classifyUrl("https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/jobsearch/job/350359", o)).toBe("ats");
    expect(classifyUrl("https://www.naukri.com/job-listings-x-123456789", o)).toBe("job_board");
    expect(classifyUrl("https://www.linkedin.com/jobs/view/4440719751/", o)).toBe("job_board");
    expect(classifyUrl("https://www.linkedin.com/company/infosys/", o)).toBe("social");
    expect(classifyUrl("https://t.me/kickcharm", o)).toBe("messaging");
    expect(classifyUrl("https://chat.whatsapp.com/abc", o)).toBe("messaging");
    expect(classifyUrl("https://tinyurl.com/abc", o)).toBe("shortener");
    expect(classifyUrl("https://forms.gle/abc", o)).toBe("form");
    expect(classifyUrl("https://coursejoiner.com/job/x/", o)).toBe("self");
    expect(classifyUrl("https://freshersnow.com/x/", o)).toBe("blog");
    expect(classifyUrl("https://www.google.com/maps/dir//Wipro", o)).toBe("maps");
    expect(classifyUrl("https://coursejoiner.com/wp-content/uploads/2026/11/x.jpg", o)).toBe("self");
  });

  it("unwraps redirect wrappers", () => {
    expect(unwrapWrapperUrl("https://www.google.com/url?q=https://careers.example.com/job/1&sa=D")).toBe("https://careers.example.com/job/1");
    expect(unwrapWrapperUrl("https://redirect.viglink.com/?u=https%3A%2F%2Fwww.linkedin.com%2Fjobs%2Fview%2F123%2F&key=x")).toBe("https://www.linkedin.com/jobs/view/123/");
    expect(unwrapWrapperUrl("https://l.facebook.com/l.php?u=https%3A%2F%2Fjobs.lever.co%2Facme%2F1")).toBe("https://jobs.lever.co/acme/1");
    expect(unwrapWrapperUrl("https://careers.example.com/go/Engineering/123/")).toBe("https://careers.example.com/go/Engineering/123/");
  });

  it("strips tracking but keeps job identifiers", () => {
    expect(stripTracking("https://jobs.lever.co/acme/1?utm_source=coursejoiner&lever-source=x")).toBe("https://jobs.lever.co/acme/1");
    expect(stripTracking("https://boards.greenhouse.io/acme/jobs/1?gh_jid=1&gh_src=abc")).toBe("https://boards.greenhouse.io/acme/jobs/1?gh_jid=1");
    expect(stripTracking("https://www.naukri.com/job-listings-x-123?src=seo_srp&sid=1&xp=17&px=6")).toBe("https://www.naukri.com/job-listings-x-123");
    expect(stripTracking("https://career.infosys.com/jobdesc?jobReferenceCode=PROGEN-1&sourceId=41")).toBe("https://career.infosys.com/jobdesc?jobReferenceCode=PROGEN-1");
    expect(cleanHref("  https://x.com/a?b=1&amp;c=2 ", POST)).toBe("https://x.com/a?b=1&c=2");
    expect(cleanHref("mailto:hr@example.com", POST)).toBeNull();
  });

  it("detects job-specific URLs", () => {
    expect(looksJobSpecific("https://www.amazon.jobs/en/jobs/10454438/software-dev-engineer-i")).toBe(true);
    expect(looksJobSpecific("https://internshala.com/internship/detail/digital-marketing-internship-in-pune-at-firstcrycom1770891771")).toBe(true);
    expect(looksJobSpecific("https://higher.gs.com/roles/158687")).toBe(true);
    expect(looksJobSpecific("https://www.naukri.com/capgemini-jobs-careers-649")).toBe(false);
    expect(looksJobSpecific("https://www.infosys.com/careers/")).toBe(false);
  });
});
