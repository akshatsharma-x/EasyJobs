/**
 * We collect job-posting data only, never personal data. Some ATS custom fields carry recruiter or
 * hiring-manager details (e.g. a Greenhouse "Backfill ID" holding an employee email) — never kept.
 */

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE = /\+?\d[\d\s().-]{8,}\d/;
const PERSON_FIELD = /\b(recruiter|hiring\s*manager|manager\s*name|owner|contact|e-?mail|phone|mobile|backfill|employee\s*(name|id)|referr(er|al)|creator|coordinator|sourcer|interviewer)\b/i;

/** True when a value looks like an email address or phone number. */
export const looksPersonal = (value: string): boolean => EMAIL.test(value) || PHONE.test(value);

/** True when a custom field (by label or value) may hold personal data and must be dropped. */
export const isPersonalField = (label: string, value: string): boolean => PERSON_FIELD.test(label) || looksPersonal(value);
