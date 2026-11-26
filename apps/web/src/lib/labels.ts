import { LABELS } from "@easyjobs/contract";

/** Display labels for well-known job tags (KNOWN_TAGS in the contract); unknown tags fall back to a humanised form. */
export const TAG_LABELS: Record<string, string> = {
  "off-campus": "Off-campus drive",
  "walk-in": "Walk-in",
  wfh: "Work from home",
  women: "Women candidates",
  diversity: "Diversity hiring",
  pwd: "PwD friendly",
  urgent: "Urgent",
  suspicious: "Unverified",
  // contract 1.1
  "part-time": "Part-time",
  ppo: "Pre-placement offer",
  unpaid: "Unpaid",
  "visa-sponsorship": "Visa sponsorship",
  "test-posting": "Test posting",
  "general-application": "General application",
};

/** Tags never shown as badges (moderation / internal). */
export const HIDDEN_TAGS = new Set(["suspicious", "test-posting", "general-application"]);

/** The tags offered as filters in the sidebar, in display order. */
export const FILTER_TAGS = ["off-campus", "walk-in", "wfh", "women"] as const;

export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? humanize(tag);
}

export function companyTagLabel(tag: string): string {
  return (LABELS.companyTag as Record<string, string>)[tag] ?? humanize(tag);
}

/** "off_campus" / "off-campus" → "Off campus" */
export function humanize(value: string): string {
  const s = value.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
