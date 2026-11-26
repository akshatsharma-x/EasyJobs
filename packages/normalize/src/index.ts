/**
 * @easyjobs/normalize — RawJob → JobInput.
 * Everything here is pure, synchronous and deterministic (given `now`), with no network calls —
 * except the optional, async enrichWithLLM.
 */
export { normalizeJob, NORMALIZER_VERSION, type NormalizeOptions, type NormalizeMeta } from "./normalize";

export { classifyLevel, classifyLevelDetailed, levelFromTitle, levelFromYears, type Confidence, type LevelInput, type LevelResult } from "./level";
export { parseExperience, type ExperienceRange, type ParseExperienceOptions } from "./experience";
export { detectJobType, detectJobTypeDetailed, jobTypeFromEmploymentType, jobTypeFromTitle, type JobTypeInput, type JobTypeResult } from "./job-type";
export { parseSalary, toInrYearly, cleanSalaryHint, detectCurrency, type InrYearly, type ParseSalaryOptions } from "./salary";
export { INR_PER_UNIT, FX_RATES_AS_OF, HOURS_PER_YEAR } from "./data/fx";
export {
  normalizeLocations,
  detectWorkMode,
  parseLocation,
  lookupCity,
  dedupeLocations,
  isLocationOnly,
  workModeFromText,
  currencyForCountry,
  countryName,
  CITY_COUNTS,
  type CityRecord,
  type NormalizedLocations,
  type ParsedLocation,
  type WorkModeInput,
  type WorkModeResult,
} from "./locations";
export { extractSkills, extractSkillsDetailed, canonicalizeSkill, cleanSkillList, skillGroupOf, SKILL_COUNT, MAX_SKILLS, type SkillMatch, type SkillInput, type SkillGroup } from "./skills";
export { extractBatches, cleanBatches, type BatchOptions } from "./batches";
export { extractDegrees, cleanDegreeList, DEGREES, type Degree } from "./degrees";
export { categorize, categorizeDetailed, type CategoryInput, type CategoryResult } from "./category";
export { cleanTitle, titleKey, type CleanTitleOptions } from "./title";
export { cleanCompanyName, resolveCompany, companyKey, companyLogoUrl, cleanDomain, deriveCompanyDomain, COMPANY_ALIAS_COUNT, type LogoOptions } from "./company";
export {
  canonicalJobKey,
  canonicalUrl,
  isAtsJobKey,
  isJobSpecificUrl,
  isOfficialHost,
  isAtsHost,
  isJobBoardHost,
  isNonOfficialHost,
  parseHttpUrl,
  normalizeHttpUrl,
  registrableDomain,
  companyDomainFromUrl,
  stripTracking,
} from "./url";
export { fingerprint, fingerprintDetailed, sha1, type FingerprintInput, type FingerprintResult } from "./fingerprint";
export { sanitizeDescription, htmlToText, summarize, textToHtml, type SanitizeOptions } from "./html";
export { parsePostedAt, parseDate, type ParseDateOptions } from "./posted-at";
export { detectTags, detectScamSignals, type TagInput, type Suspicion } from "./tags";
export { qualityScore, type QualityInput } from "./quality";
export {
  enrichWithLLM,
  enrichManyWithLLM,
  needsEnrichment,
  validateFields,
  applyFields,
  resetLlmState,
  ENRICH_TOOL,
  DEFAULT_LLM_MODEL,
  type EnrichOptions,
  type LlmClient,
  type LlmFields,
} from "./llm";
