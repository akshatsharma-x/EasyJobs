import { describe, expect, it } from "vitest";
import type { JobLocation } from "@easyjobs/contract";
import { detectScamSignals, detectTags, qualityScore, type QualityInput } from "../src/index";

describe("detectTags", () => {
  const cases: [Parameters<typeof detectTags>[0], string[], string[]][] = [
    [{ title: "TCS Off Campus Drive 2026" }, ["off-campus"], []],
    [{ title: "Walk-in Interview for Customer Support" }, ["walk-in"], []],
    [{ description: "Walkin drive on Saturday at Guindy" }, ["walk-in"], []],
    [{ title: "Content Writer", locations: ["Work from home"] }, ["wfh"], []],
    [{ title: "Engineer", isRemote: true }, ["wfh"], []],
    [{ description: "This drive is only for women candidates." }, ["women"], []],
    [{ description: "Women returners programme — career restart for women." }, ["women"], []],
    [{ description: "Diversity hiring drive for 2026 graduates." }, ["diversity"], []],
    [{ description: "PwD candidates are encouraged to apply." }, ["pwd"], []],
    [{ description: "Reserved for PwBD candidates (40% disability)." }, ["pwd"], []],
    [{ description: "Opportunity for persons with disabilities hiring." }, ["pwd"], []],
    [{ title: "Urgent Hiring: Java Developer" }, ["urgent"], []],
    [{ description: "Immediate joiners preferred." }, ["urgent"], []],
    [{ hints: ["Off Campus", "walkin", "Women Only", "Remote", "fintech!!"] }, ["off-campus", "walk-in", "women", "wfh", "fintech"], []],
    // EEO boilerplate must not create women/pwd tags.
    [
      { description: "We are an equal opportunity employer. Women, minorities, individuals with disabilities and protected veterans are encouraged to apply." },
      [],
      ["women", "pwd", "suspicious"],
    ],
    [{ description: "Let's walk in the park and go for a walk." }, [], ["walk-in"]],
    [{ title: "DO NOT APPLY - TEST REQ - Sr Manager, Market Development" }, ["test-posting"], []],
    [{ description: "Female candidates preferred for this role." }, ["women"], []],
    [{ description: "Prefers women candidates." }, ["women"], []],
    [{ description: "Women wanting to start/restart their career can also apply." }, ["women"], []],
    [{ description: "Women candidates are encouraged to apply." }, [], ["women"]],
    [{ description: "Female applicants, people of Aboriginal descent and people with disability are encouraged to apply." }, [], ["women", "pwd"]],
    [{ description: "Female candidates must wear formal attire." }, [], ["women"]],
    [{ description: "Assistive devices are provided to support differently abled individuals at work." }, [], ["pwd"]],
    [{ description: "In compliance with the Rights of Persons with Disabilities Act, 2016, we provide equal opportunity." }, [], ["pwd"]],
    [{ description: "Differently abled candidates can apply." }, ["pwd"], []],
  ];
  it.each(cases)("%j → +%j -%j", (input, include, exclude) => {
    const tags = detectTags(input);
    for (const t of include) expect(tags).toContain(t);
    for (const t of exclude) expect(tags).not.toContain(t);
  });
});

describe("scam signals → suspicious", () => {
  const suspicious: [string, Parameters<typeof detectScamSignals>[0], string][] = [
    ["registration fee", { description: "Pay a registration fee of Rs. 999 to confirm your seat." }, "fee"],
    ["security deposit", { description: "A refundable security deposit of ₹5,000 is required." }, "fee"],
    ["pay to apply", { description: "You need to pay to apply." }, "fee"],
    ["training fee", { description: "Training fee: ₹2,500 (one-time)." }, "fee"],
    ["whatsapp number", { description: "WhatsApp your resume to +91 98765 43210" }, "messenger-contact"],
    ["telegram contact", { description: "Contact HR on Telegram @hr_jobs_india for joining." }, "messenger-contact"],
    ["messenger apply link", { applyUrl: "https://wa.me/919876543210" }, "messenger-apply-link"],
    ["gmail recruiter", { description: "Send CV to hr.globalplacements@gmail.com" }, "free-email-recruiter"],
    ["yahoo recruiter", { description: "Mail resume: careers_hr@yahoo.co.in" }, "free-email-recruiter"],
    ["earn per day", { description: "Earn ₹5000 per day working from home!" }, "too-good-to-be-true"],
    ["paid training with job guarantee", { description: "100% job guarantee after training. Pay ₹15,000 for the course." }, "too-good-to-be-true"],
    ["fresher pay", { level: "fresher", sourceKind: "aggregator", salaryInrYearlyMax: 9_000_000 }, "unrealistic-pay"],
    ["intern pay", { level: "intern", sourceKind: "job_board", salaryInrYearlyMax: 6_000_000 }, "unrealistic-pay"],
  ];
  it.each(suspicious)("%s", (_name, input, reason) => {
    const s = detectScamSignals(input);
    expect(s.suspicious).toBe(true);
    expect(s.reasons).toContain(reason);
    expect(detectTags(input)).toContain("suspicious");
  });

  const clean: [string, Parameters<typeof detectScamSignals>[0]][] = [
    ["fee disclaimer", { description: "TCS does not charge any fee at any stage of the recruitment process." }],
    ["never asks for money", { description: "We never ask for a registration fee. Beware of fraud." }],
    ["telegram promo", { description: "Join our Telegram channel for daily job updates." }],
    ["company email", { description: "Questions? Write to careers@razorpay.com" }],
    ["official high pay", { level: "fresher", sourceKind: "ats", salaryInrYearlyMax: 9_000_000 }],
    ["normal pay", { level: "fresher", sourceKind: "aggregator", salaryInrYearlyMax: 1_200_000 }],
    ["US new-grad pay", { level: "fresher", sourceKind: "aggregator", salaryCurrency: "USD", salaryInrYearlyMax: 12_000_000 }],
    ["course promo", { description: "Internshala Trainings: placement guarantee courses that come with a job guarantee." }],
    ["weekly payments perk", { description: "What we offer: competitive rates, weekly payments, flexible hours." }],
    ["unpaid, no guaranteed income", { description: "It is unpaid, with no fixed stipend or guaranteed income. Earn 20% commission per sale." }],
    ["finance jargon", { description: "Model daily interest accruals, processing fee (PF) yields and loan losses." }],
    ["fee disclaimer FREE (₹0)", { description: "Application Fee ₹0 (FREE). Apply on the official portal." }],
    ["none mention a fee", { description: "None of the three drives mentions an online test or registration fee." }],
    ["service bond", { description: "If you leave before completing 12 months, you are liable to pay ₹50,000 to the company." }],
    ["whatsapp for questions with official apply link", { description: "Questions? Ping us on WhatsApp: +91-8058331557", officialApply: true }],
  ];
  it.each(clean)("%s is not suspicious", (_name, input) => {
    expect(detectScamSignals(input).suspicious).toBe(false);
  });
});

describe("qualityScore", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  const loc: JobLocation[] = [{ raw: "Bangalore", city: "Bengaluru", state: "Karnataka", country: "IN" }];
  const base: QualityInput = {
    sourceKind: "ats",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/123",
    sourceUrl: "https://boards.greenhouse.io/acme/jobs/123",
    descriptionText: "x".repeat(2000),
    salary: { min: 1, max: 2, currency: "INR", period: "year", raw: null },
    locations: loc,
    isRemote: false,
    postedAt: "2026-11-25T00:00:00Z",
    tags: [],
    now,
  };
  it("scores a complete fresh official posting at 100", () => {
    expect(qualityScore(base)).toBe(100);
  });
  it("awards each component", () => {
    expect(qualityScore({ ...base, sourceKind: "aggregator" })).toBe(75);
    expect(qualityScore({ ...base, salary: null })).toBe(90);
    expect(qualityScore({ ...base, locations: [] })).toBe(90);
    expect(qualityScore({ ...base, locations: [], isRemote: true })).toBe(100);
    expect(qualityScore({ ...base, descriptionText: "x".repeat(400) })).toBe(90);
    expect(qualityScore({ ...base, descriptionText: null })).toBe(80);
    expect(qualityScore({ ...base, postedAt: "2026-11-10T00:00:00Z" })).toBe(91);
    expect(qualityScore({ ...base, postedAt: "2025-01-01T00:00:00Z" })).toBe(85);
    expect(qualityScore({ ...base, applyUrl: "https://careers.acme.com/" })).toBe(92);
    expect(qualityScore({ ...base, sourceKind: "job_board", applyUrl: "https://www.linkedin.com/jobs/view/1", sourceUrl: "https://www.linkedin.com/jobs/view/1" })).toBe(59);
  });
  it("penalizes suspicious postings and clamps to 0–100", () => {
    expect(qualityScore({ ...base, tags: ["suspicious"] })).toBe(60);
    expect(qualityScore({ ...base, tags: ["test-posting"] })).toBe(20);
    expect(qualityScore({ ...base, sourceKind: "aggregator", applyUrl: null, descriptionText: null, salary: null, locations: [], postedAt: "2020-01-01T00:00:00Z", tags: ["suspicious"] })).toBe(0);
  });
});
