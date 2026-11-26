/** Lightweight location helpers (the normalizer canonicalizes; we only split and spot places). */
import { normalizeSpace } from "../util/text";

export const INDIAN_CITIES = [
  "Bengaluru", "Bangalore", "Hyderabad", "Secunderabad", "Chennai", "Madras", "Pune", "Mumbai", "Bombay", "Navi Mumbai", "Thane",
  "Delhi", "New Delhi", "Delhi NCR", "NCR", "Gurugram", "Gurgaon", "Noida", "Greater Noida", "Ghaziabad", "Faridabad",
  "Kolkata", "Calcutta", "Ahmedabad", "Gandhinagar", "Jaipur", "Kochi", "Cochin", "Thiruvananthapuram", "Trivandrum",
  "Coimbatore", "Chandigarh", "Mohali", "Panchkula", "Indore", "Bhopal", "Nagpur", "Lucknow", "Mysore", "Mysuru",
  "Mangalore", "Mangaluru", "Vadodara", "Baroda", "Surat", "Rajkot", "Bhubaneswar", "Visakhapatnam", "Vizag", "Vijayawada",
  "Madurai", "Trichy", "Tiruchirappalli", "Salem", "Vellore", "Hosur", "Nashik", "Aurangabad", "Kolhapur", "Goa", "Panaji",
  "Dehradun", "Patna", "Ranchi", "Jamshedpur", "Guwahati", "Kanpur", "Varanasi", "Agra", "Ludhiana", "Amritsar", "Raipur",
  "Hubli", "Belgaum", "Belagavi", "Tirupati", "Warangal", "Udaipur", "Jodhpur", "Kota", "Prayagraj", "Allahabad", "Meerut",
  "Sonipat", "Manesar", "Pondicherry", "Puducherry", "Kozhikode", "Calicut", "Thrissur", "Gwalior", "Jabalpur", "Siliguri",
  "Durgapur", "Cuttack", "Shimla", "Jammu", "Srinagar", "Bareilly", "Aligarh", "Moradabad", "Gorakhpur", "Kanchipuram",
  "Chengalpattu", "Sriperumbudur", "Tirunelveli", "Erode", "Tiruppur", "Davanagere", "Shimoga", "Udupi", "Manipal",
];

export const REGION_PHRASES = [
  "Remote", "Work From Home", "WFH", "Pan India", "PAN India", "Pan-India", "All India", "Across India", "Anywhere in India",
  "Multiple Locations", "Multiple Location", "Various Locations", "India", "Hybrid",
];

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Orissa", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh", "India", "IN",
];

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
export const CITY_RE = new RegExp(`\\b(?:${[...INDIAN_CITIES].sort((a, b) => b.length - a.length).map(escape).join("|")})\\b`, "i");
const CITY_RE_G = new RegExp(CITY_RE.source, "gi");
const STATE_RE = new RegExp(`^(?:${STATES.map(escape).join("|")})$`, "i");
const CITY_EXACT = new RegExp(`^(?:${INDIAN_CITIES.map(escape).join("|")})$`, "i");
const REGION_RE = new RegExp(`\\b(?:${REGION_PHRASES.map(escape).join("|")})\\b`, "i");

/** Cities mentioned in a string, in order, deduped (canonical spelling as written). */
export function citiesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CITY_RE_G)) {
    const v = normalizeSpace(m[0]);
    if (!out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

/**
 * Split a location value into raw location strings without breaking "City, State, Country":
 * "Noida, Hyderabad, Bengaluru" → 3 · "Hyderabad, Telangana, India" → 1 · "Pune / Mysore" → 2.
 */
export function splitLocations(value: string): string[] {
  let v = normalizeSpace(value)
    .replace(/\((?:[^)]*\b(?:listing|titled|tentative|subject|as per|likely|expected|preferred|residents?|all areas|only|candidates|may|will|based on)\b[^)]*)\)/gi, " ")
    .replace(/\b(?:locations?|cities)\s*:/gi, " ")
    .replace(/\.$/, "");
  if (!v) return [];
  // "Multiple Cities Across India (Delhi NCR / Mumbai / Bengaluru)" → the cities inside.
  const paren = /\(([^)]*)\)/.exec(v);
  if (paren && citiesIn(paren[1] ?? "").length >= 2) v = paren[1] ?? v;
  // Remaining parentheticals are qualifiers/addresses ("(In-office)", "(RMZ Infinity, Tower B)").
  v = v.replace(/\s*\([^)]*\)?/g, " ").replace(/\s{2,}/g, " ").trim();
  if (/^(?:multiple|various|several)\s+(?:locations?|cities)(?:\s+across\s+india)?$/i.test(v) || /^pan[\s-]?india$/i.test(v)) return [v];
  v = v.replace(/\s+(?:and|&|or)\s+/gi, ", ").replace(/\s*[/|;•]\s*/g, ", ");
  const parts = v.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    // "Hyderabad, Telangana, India" stays one location; "Bengaluru, Delhi" (Delhi is also a city) does not merge.
    const prev = out[out.length - 1];
    const sameCity = prev !== undefined && prev.toLowerCase().includes(p.toLowerCase()); // "New Delhi, Delhi"
    if (prev !== undefined && STATE_RE.test(p) && (!CITY_EXACT.test(p) || sameCity)) {
      out[out.length - 1] = `${out[out.length - 1]}, ${p}`;
      continue;
    }
    out.push(p);
  }
  return out
    .map((p) => p.replace(/^(?:in|at)\s+/i, "").trim())
    .filter((p) => p.length >= 2 && p.length <= 80 && (CITY_RE.test(p) || REGION_RE.test(p) || /^[A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)*$/.test(p)));
}

export function isRemoteText(text: string): boolean {
  return /\b(?:remote|work from home|wfh|work-from-home|anywhere in india|virtual internship|online internship)\b/i.test(text);
}
