import { JOB_CATEGORIES, type JobCategory } from "@easyjobs/contract";
import type { Confidence } from "./level";
import { skillGroupOf, type SkillGroup } from "./skills";
import { asString, asStringList, bag } from "./text";

export interface CategoryInput {
  title?: string | null;
  department?: string | null;
  skills?: readonly string[] | null;
}

export interface CategoryResult {
  category: JobCategory;
  confidence: Confidence;
  scores: Partial<Record<JobCategory, number>>;
}

type Rule = readonly [JobCategory, RegExp, number];

/** Title rules: specific phrases outweigh generic words ("Data Engineer" → data, not software). */
const TITLE_RULES: readonly Rule[] = [
  ["qa_testing", /\b(?:qa|quality\s+assurance|test(?:ing)?\s+(?:engineer|analyst|lead|automation|architect|manager)|tester|sdet|automation\s+test\w*|(?:software\s+)?(?:engineer|developer)\s+in\s+test|test\s+automation|manual\s+test\w*|qc\s+analyst|performance\s+test\w*)\b/i, 14],
  ["security", /\b(?:security|cyber\s*security|cyber|infosec|soc\s+analyst|penetration|pentest\w*|appsec|vapt|threat|malware|forensic\w*|grc|iam\s+(?:engineer|analyst)|ethical\s+hacker)\b/i, 13],
  ["data_ai", /\b(?:data\s+(?:scien\w+|analyst|analytics|engineer|engineering|architect|annotat\w+|labell?er|labell?ing|visuali[sz]ation|modeler|steward|governance|quality|specialist)|machine\s+learning|applied\s+ml|\bml\b|ml\s+(?:engineer|scientist|ops|researcher|intern)|ai\s*\/\s*ml|ml\s*\/\s*ai|ai\s+(?:engineer|scientist|researcher|developer|trainer|specialist|intern|tutor)|artificial\s+intelligence|deep\s+learning|nlp|computer\s+vision|llm|gen\s?ai|generative\s+ai|analytics|business\s+intelligence|bi\s+(?:developer|analyst|engineer)|statistic\w+|big\s+data|etl|quant(?:itative)?\s+(?:analyst|researcher|developer)|applied\s+scientist|power\s+bi|tableau|mis\s+(?:executive|analyst)|decision\s+scien\w+|research\s+scientist,?\s+(?:ml|ai))\b/i, 13],
  ["devops_cloud", /\b(?:devops|dev\s+ops|devsecops|sre|site\s+reliability|cloud\s+(?:engineer|architect|administrator|ops|operations|support|consultant|developer|infrastructure)|platform\s+engineer|infrastructure\s+engineer|kubernetes|system\s+administrator|systems\s+administrator|sysadmin|network\s+(?:engineer|administrator|admin|support)|dba|database\s+administrator|build\s+(?:and|&)\s+release|release\s+engineer|linux\s+admin\w*|mlops|aws\s+(?:engineer|architect)|azure\s+(?:engineer|architect)|it\s+infrastructure|noc\s+engineer|storage\s+engineer|vmware\s+engineer)\b/i, 13],
  ["product", /\b(?:product\s+(?:manager|management|owner|lead|analyst|operations|ops|strategist|head|director|intern)|apm|technical\s+program\s+manager|tpm)\b/i, 13],
  ["design", /\b(?:designer|ui\s*\/\s*ux|ux\s*\/\s*ui|ux|ui\s+(?:developer|designer)|user\s+experience|user\s+interface|graphic|visual\s+design|interaction\s+design|motion\s+(?:graphics|designer)|illustrator|animator|animation|creative\s+(?:director|lead|designer)|art\s+director|3d\s+(?:artist|modeler|generalist)|video\s+editor|photographer|game\s+artist|design\s+intern)\b(?!\s+engineer)/i, 13],
  ["customer_support", /\b(?:customer\s+(?:support|service|care|success|experience|relationship\s+executive)|client\s+(?:support|service|servicing)|technical\s+support|tech\s+support|help\s*desk|service\s+desk|support\s+(?:engineer|executive|associate|specialist|analyst|representative|agent)|call\s+cent(?:er|re)|bpo|kpo|voice\s+process|non[\s-]voice|chat\s+(?:process|support)|contact\s+cent(?:er|re)|customer\s+care|desktop\s+support|l1\s+support|l2\s+support)\b/i, 12],
  ["hr", /\b(?:hr|human\s+resources?|recruit\w*|talent\s+acquisition|people\s+(?:operations|partner|ops|team)|hrbp|learning\s+(?:and|&)\s+development|payroll\s+(?:executive|specialist)|compensation|employee\s+(?:relations|engagement)|staffing|headhunter|sourcer|hr\s+intern)\b/i, 12],
  ["marketing", /\b(?:marketing|seo|sem|smm|social\s+media|digital\s+market\w*|growth\s+(?:marketer|manager|hacker|lead|marketing)|brand(?:ing)?\s+(?:manager|executive|strategist|associate|intern)|content\s+market\w*|performance\s+market\w*|public\s+relations|\bpr\s+(?:executive|manager|intern)|communications?\s+(?:manager|specialist|executive|associate|intern)|campaign|advertising|media\s+(?:planner|buyer)|influencer|community\s+manager|events?\s+(?:manager|executive|coordinator))\b/i, 12],
  ["sales", /\b(?:sales|business\s+development|bde|bdm|bdr|sdr|account\s+(?:executive|director)|inside\s+sales|pre[\s-]?sales|telesales|tele\s*caller|telecall\w*|lead\s+generation|relationship\s+(?:manager|officer|executive)|territory|channel\s+(?:partner|sales|manager)|key\s+account|business\s+associate|field\s+(?:sales|executive|officer)|area\s+(?:sales\s+)?manager|retail\s+(?:sales|associate)|store\s+(?:manager|associate)|counter\s+sales|insurance\s+(?:advisor|agent)|loan\s+officer|merchandiser|admissions?\s+counsell?or)\b/i, 12],
  ["finance", /\b(?:financ\w*|accountant|accounting|accounts|audit\w*|tax\w*|chartered\s+accountant|cfa|treasury|credit\s+(?:analyst|manager|officer)|risk\s+(?:analyst|manager)|underwrit\w*|actuar\w*|investment|equity\s+research|investment\s+banking|banker|fp&a|controller|bookkeep\w*|payroll|billing|collections?|invoic\w*|reconciliation|wealth|portfolio|valuation|financial|kyc\s+analyst|aml\s+analyst)\b/i, 12],
  ["legal", /\b(?:legal|lawyer|advocate|attorney|counsel|paralegal|compliance|company\s+secretary|litigation|contracts?\s+(?:manager|specialist|analyst)|law\s+(?:clerk|intern|associate|officer)|ipr|patent|trademark)\b/i, 12],
  ["healthcare", /\b(?:doctor|physician|nurse|nursing|pharmacist|pharmacy|medical|clinical|healthcare|health\s+care|dentist|dental|physiotherap\w*|lab\s+technician|radiolog\w*|patient|hospital|mbbs|bds|pharmacovigilance|psycholog\w*|therapist|dietitian|nutritionist|veterinar\w*|optometrist|caregiver|pharma)\b/i, 12],
  ["education", /\b(?:teacher|tutor|faculty|professor|lecturer|teaching|educator|instructor|trainer|academic|curriculum|counsell?or|subject\s+matter\s+expert|school|mentor|coach)\b/i, 10],
  ["content", /\b(?:content\s+(?:writer|writing|creator|editor|developer|strategist|specialist|moderator|reviewer|intern)|copywriter|copy\s+writer|editor|journalist|reporter|writer|blogger|technical\s+writer|proofreader|translator|transcription\w*|subtitl\w*|voice[\s-]?over|anchor|podcast|youtube|video\s+(?:creator|producer)|scriptwriter|script\s+writer)\b/i, 12],
  ["core_engineering", /\b(?:mechanical|civil|electrical|electronics?|ece|eee|vlsi|embedded\s+(?:hardware|systems?\s+engineer)|hardware|chemical|production|manufacturing|design\s+engineer|cad\s+(?:engineer|designer)|autocad|plc|scada|automotive|aerospace|structural|process\s+engineer|quality\s+(?:engineer|inspector|control)|maintenance\s+engineer|site\s+engineer|instrumentation|robotics|mechatronics|rf\s+engineer|asic|fpga|pcb|analog|verification\s+engineer|physical\s+design|piping|hvac|mep|metallurg\w*|mining|petroleum|marine\s+engineer|graduate\s+engineer\s+trainee|plant|power\s+(?:plant|systems)|solar|telecom|r&d\s+engineer|silicon|semiconductor|chip\s+design|cnc|tool\s+(?:design|room)|draughts?man|draftsman|surveyor|estimation\s+engineer|planning\s+engineer|safety\s+(?:officer|engineer)|ehs|diploma\s+engineer|trainee\s+engineer\s+-\s+(?:mechanical|electrical|civil))\b/i, 13],
  ["consulting", /\b(?:consult(?:ant|ing)|advisory|strategy\s+(?:consultant|analyst|associate)|management\s+consult\w*|business\s+consultant|functional\s+consultant)\b/i, 8],
  ["research", /\b(?:research\w*|scientist|postdoc\w*|post[\s-]doctoral|phd|r&d|lab\s+assistant|research\s+associate|fellowship)\b/i, 9],
  ["business_ops", /\b(?:operations?|ops|business\s+analyst|strategy|program\s+manager|project\s+(?:manager|coordinator|lead|management|associate)|supply\s+chain|logistics|procurement|purchase|purchasing|admin(?:istrat\w+)?|office\s+(?:manager|assistant|executive|coordinator|administrator)|executive\s+assistant|personal\s+assistant|coordinator|management\s+trainee|business\s+operations|inventory|warehouse|vendor|category\s+(?:manager|executive)|founder'?s?\s+office|chief\s+of\s+staff|scrum\s+master|pmo|back\s+office|data\s+entry|documentation|front\s+desk|receptionist|facilit(?:y|ies)|planning|e-?commerce|merchandising|fleet|dispatch|delivery\s+(?:executive|associate|partner|boy)|driver|courier|business\s+(?:development\s+)?analyst)\b/i, 9],
  ["software_engineering", /\b(?:software|developer|programmer|sde|swe|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web\s+(?:developer|development)|mobile\s+(?:developer|engineer)|android|ios|app\s+developer|application\s+(?:developer|engineer)|java|python|\.net|dot\s*net|php|react|angular|node(?:\.?js)?|golang|ruby|rails|django|flutter|salesforce\s+developer|abap|game\s+developer|blockchain|web3|member\s+of\s+technical\s+staff|mts|coding|coder|engineering\s+intern|tech\s+intern|it\s+(?:intern|trainee)|systems?\s+engineer|associate\s+software|graduate\s+software|wordpress\s+developer|shopify\s+developer|computer\s+science|embedded\s+software|firmware|technology\s+analyst|programmer\s+analyst|engineer\s+trainee)\b/i, 11],
  ["software_engineering", /\b(?:engineer|engineering)\b/i, 3],
  ["data_ai", /\banalyst\b/i, 3],
  // Trades, banking, BPO and other common gaps
  ["core_engineering", /\b(?:electrician|welder|fitter|plumber|machinist|mechanic|lineman|bauleit\w*|elektri\w*|elektroniker|\w*monteur\w*|\w*mechaniker\w*|montage\w*|meister\s+shk|heizungsbau\w*|baustellen\w*|projektingenieur\w*|ingenieur\w*|engenheir[oa]|ingenier[oa])\b/i, 9],
  ["content", /\b(?:language\s+(?:project|expert|specialist|annotator)|translat\w+|transcri\w+|localization\s+(?:specialist|reviewer))\b/i, 9],
  ["healthcare", /\b(?:fysioterap\w*|fisioterap\w*|pflege\w*|enfermeir[oa])\b/i, 11],
  ["finance", /\b(?:teller|cashier|buchhalt\w*|finanzbuchhalt\w*|contador[a]?|contabilidade)\b/i, 10],
  ["customer_support", /\b(?:process\s+(?:executive|associate)|kundenservice|kundenbetreuer\w*|atendimento)\b/i, 10],
  ["business_ops", /\b(?:trust\s*(?:&|and)\s*safety|content\s+moderat\w*|projektleit\w*|projektmanag\w*|projektkoordin\w*|auftragsmanagement|disposition)\b/i, 10],
  ["sales", /\b(?:kam|vertrieb\w*|verkäufer\w*|vendedor[a]?|ventas)\b/i, 11],
  ["marketing", /\b(?:campus\s+(?:ambassador|crew)|brand\s+ambassador|student\s+ambassador)\b/i, 11],
  ["software_engineering", /\b(?:entwickler\w*|softwareentwickl\w*|desenvolvedor[a]?|desarrollador[a]?|programador[a]?)\b/i, 11],
  ["data_ai", /\b(?:cientista\s+de\s+dados|analista\s+de\s+dados|científico\s+de\s+datos|datenanalyst\w*|data\s+scientist\w*)\b/i, 13],
  ["consulting", /\bberater\w*\b/i, 8],
  ["content", /\b(?:producer|creative\s+producer)\b/i, 9],
];

const DEPARTMENT_RULES: readonly Rule[] = [
  ["software_engineering", /\b(?:engineering|software|technology|tech|r&d|research\s+and\s+development|development|it)\b/i, 5],
  ["hr", /\bpeople\b|\btalent\b/i, 5],
  ["business_ops", /\bg&a\b|\bgeneral\s+(?:and|&)\s+administrative\b|\bstrategy\b/i, 4],
  ["customer_support", /\bcustomer\s+(?:success|experience|support)\b/i, 5],
];

const GROUP_CATEGORY: Readonly<Partial<Record<SkillGroup, readonly (readonly [JobCategory, number])[]>>> = {
  lang: [["software_engineering", 1.5]],
  web: [["software_engineering", 1.5]],
  mobile: [["software_engineering", 1.5]],
  cs: [["software_engineering", 1.5]],
  blockchain: [["software_engineering", 1.5]],
  game: [["software_engineering", 1.5]],
  ml: [["data_ai", 2]],
  data: [["data_ai", 1.5]],
  db: [["software_engineering", 0.8], ["data_ai", 0.8]],
  cloud: [["devops_cloud", 1.5]],
  devops: [["devops_cloud", 1.5]],
  security: [["security", 2]],
  qa: [["qa_testing", 2]],
  design: [["design", 2]],
  office: [["business_ops", 0.6]],
  erp: [["business_ops", 0.8], ["consulting", 0.6]],
  marketing: [["marketing", 2]],
  sales: [["sales", 2]],
  finance: [["finance", 2]],
  hr: [["hr", 2]],
  core: [["core_engineering", 2]],
  pm: [["product", 0.8], ["business_ops", 0.8]],
  support: [["customer_support", 2]],
  healthcare: [["healthcare", 2]],
  legal: [["legal", 2]],
  education: [["education", 2]],
};

const MAX_SKILL_SCORE = 6;

/** Category from title (strong), department (medium) and skills (weak). Falls back to "other". */
export function categorizeDetailed(categoryInput: CategoryInput): CategoryResult {
  const input = bag(categoryInput);
  const scores: Partial<Record<JobCategory, number>> = {};
  const add = (c: JobCategory, w: number): void => {
    scores[c] = (scores[c] ?? 0) + w;
  };
  const title = asString(input.title).slice(0, 2000);
  let titleBest = 0;
  if (title) {
    const seen = new Set<JobCategory>();
    for (const [cat, re, w] of TITLE_RULES) {
      if (seen.has(cat) || !re.test(title)) continue;
      seen.add(cat);
      add(cat, w);
      titleBest = Math.max(titleBest, w);
    }
  }
  const dept = asString(input.department).slice(0, 2000);
  if (dept) {
    const seen = new Set<JobCategory>();
    for (const [cat, re, w] of TITLE_RULES) {
      if (seen.has(cat) || w < 8 || !re.test(dept)) continue;
      seen.add(cat);
      add(cat, Math.round(w * 0.5));
    }
    for (const [cat, re, w] of DEPARTMENT_RULES) if (!seen.has(cat) && re.test(dept)) add(cat, w);
  }
  const skillScores: Partial<Record<JobCategory, number>> = {};
  for (const name of asStringList(input.skills)) {
    const group = skillGroupOf(name);
    for (const [cat, w] of (group && GROUP_CATEGORY[group]) || []) skillScores[cat] = (skillScores[cat] ?? 0) + w;
  }
  for (const [cat, w] of Object.entries(skillScores) as [JobCategory, number][]) add(cat, Math.min(MAX_SKILL_SCORE, w));

  let best: JobCategory = "other";
  let bestScore = 0;
  for (const cat of JOB_CATEGORIES) {
    const s = scores[cat] ?? 0;
    if (s > bestScore) {
      best = cat;
      bestScore = s;
    }
  }
  if (bestScore < 1.5) return { category: "other", confidence: "low", scores };
  const confidence: Confidence = titleBest >= 8 ? "high" : bestScore >= 4 ? "medium" : "low";
  return { category: best, confidence, scores };
}

export function categorize(input: CategoryInput): JobCategory {
  return categorizeDetailed(input).category;
}
