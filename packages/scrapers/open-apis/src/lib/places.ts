/**
 * Small gazetteer used to decide whether a remote role is open to candidates in India,
 * and to recognise location segments in free text (HN posts). Lowercase entries.
 */

export const INDIA_PLACES: readonly string[] = [
  "india", "bharat", "bengaluru", "bangalore", "mumbai", "bombay", "navi mumbai", "thane", "new delhi", "delhi", "delhi ncr",
  "ncr", "hyderabad", "secunderabad", "pune", "chennai", "madras", "gurgaon", "gurugram", "noida", "greater noida",
  "kolkata", "calcutta", "ahmedabad", "kochi", "cochin", "jaipur", "chandigarh", "mohali", "indore", "coimbatore",
  "trivandrum", "thiruvananthapuram", "mysore", "mysuru", "nagpur", "lucknow", "bhubaneswar", "visakhapatnam", "vizag",
  "goa", "surat", "vadodara", "nashik", "bhopal", "patna", "ranchi", "guwahati", "dehradun", "vijayawada", "madurai",
  "mangalore", "mangaluru", "hubli", "faridabad", "ghaziabad", "karnataka", "maharashtra", "tamil nadu", "telangana",
  "kerala", "gujarat", "rajasthan", "uttar pradesh", "west bengal", "haryana", "punjab", "andhra pradesh", "odisha",
];

/** Countries other than India (common names + frequent short forms). */
export const OTHER_COUNTRIES: readonly string[] = [
  "united states", "united states of america", "usa", "u.s.a.", "u.s.", "us", "america", "canada", "mexico",
  "united kingdom", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland",
  "ireland", "germany", "deutschland", "france", "spain", "portugal", "italy", "netherlands", "the netherlands", "holland",
  "belgium", "luxembourg", "switzerland", "austria", "poland", "czechia", "czech republic", "slovakia", "hungary",
  "romania", "bulgaria", "greece", "croatia", "serbia", "slovenia", "bosnia", "montenegro", "north macedonia",
  "albania", "kosovo", "moldova", "ukraine", "belarus", "russia", "lithuania", "latvia", "estonia", "finland",
  "sweden", "norway", "denmark", "iceland", "cyprus", "malta", "turkey", "türkiye", "turkiye", "georgia", "armenia",
  "azerbaijan", "kazakhstan", "uzbekistan", "israel", "palestine", "lebanon", "jordan", "egypt", "morocco", "tunisia",
  "algeria", "nigeria", "ghana", "kenya", "ethiopia", "uganda", "rwanda", "tanzania", "south africa", "zimbabwe",
  "zambia", "senegal", "ivory coast", "cameroon", "uae", "united arab emirates", "saudi arabia", "saudi", "ksa",
  "qatar", "kuwait", "bahrain", "oman", "iran", "iraq", "pakistan", "bangladesh", "sri lanka", "nepal", "bhutan",
  "maldives", "afghanistan", "china", "hong kong", "taiwan", "japan", "south korea", "korea", "singapore", "malaysia",
  "indonesia", "philippines", "thailand", "vietnam", "cambodia", "myanmar", "laos", "mongolia", "australia",
  "new zealand", "brazil", "argentina", "chile", "colombia", "peru", "uruguay", "paraguay", "bolivia", "ecuador",
  "venezuela", "costa rica", "panama", "guatemala", "honduras", "el salvador", "nicaragua", "dominican republic",
  "puerto rico", "jamaica", "cuba",
];

/** Multi-country regions that do NOT include India. */
export const NON_INDIA_REGIONS: readonly string[] = [
  "europe", "european union", "eu", "eea", "emea", "dach", "nordics", "scandinavia", "benelux", "baltics", "balkans",
  "cee", "eastern europe", "western europe", "central europe", "southern europe", "northern europe",
  "north america", "south america", "latin america", "latam", "americas", "amer", "central america", "caribbean",
  "africa", "middle east", "mena", "gulf", "oceania", "anz", "southeast asia", "south east asia", "sea", "east asia",
  "central asia", "western asia", "west asia",
  // US sub-regions
  "midwest", "east coast", "west coast", "pacific northwest", "new england", "tri-state area", "socal", "norcal",
  // European time zones used as regions ("REMOTE (CET)")
  "cet", "cest", "eet", "eest", "wet", "bst", "european time zones", "eu time zone", "eu time zones",
];

/** Regions that include India. */
export const INDIA_REGIONS: readonly string[] = [
  "apac", "asia", "asia pacific", "asia-pacific", "apj", "south asia", "saarc", "indian subcontinent",
];

/** US/Canada time-zone labels that imply a North-America restriction when used as a region. */
export const NA_TIMEZONES: readonly string[] = [
  "est", "edt", "pst", "pdt", "cst", "cdt", "mst", "mdt", "eastern time", "pacific time", "central time",
  "mountain time", "us time zones", "us timezones", "us time zone", "north american time zones",
];

export const US_STATES: readonly string[] = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida",
  "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland",
  "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma",
  "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming",
];

export const US_STATE_CODES: readonly string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

/** Common ISO alpha-2 codes seen as location qualifiers ("Lausanne, CH"). */
export const COUNTRY_CODES: readonly string[] = [
  "US", "UK", "GB", "CA", "DE", "FR", "ES", "PT", "IT", "NL", "BE", "CH", "AT", "PL", "CZ", "SE", "NO", "DK", "FI",
  "IE", "IL", "AE", "SG", "JP", "KR", "CN", "HK", "TW", "AU", "NZ", "BR", "AR", "MX", "CO", "CL", "ZA", "NG", "KE",
  "EG", "TR", "RO", "UA", "GR", "HU", "EE", "LT", "LV", "IN",
];

/** Major non-Indian job hubs (lets us spot "Engineer - London" style restrictions and HN location segments). */
export const GLOBAL_CITIES: readonly string[] = [
  "san francisco", "sf", "sf bay area", "bay area", "silicon valley", "new york", "new york city", "nyc", "brooklyn",
  "manhattan", "los angeles", "seattle", "boston", "austin", "chicago", "denver", "boulder", "atlanta", "miami",
  "washington dc", "washington, dc", "philadelphia", "pittsburgh", "portland", "san diego", "san jose", "palo alto",
  "mountain view", "menlo park", "sunnyvale", "redwood city", "oakland", "berkeley", "santa clara", "santa monica",
  "bellevue", "redmond", "salt lake city", "phoenix", "tempe", "dallas", "houston", "raleigh", "durham", "nashville",
  "minneapolis", "detroit", "columbus", "jersey city", "reno", "malibu", "san carlos", "irvine", "sacramento",
  "baltimore", "mclean", "arlington", "charlotte", "orlando", "tampa", "las vegas", "kansas city", "st. louis",
  "cincinnati", "cleveland", "indianapolis", "milwaukee", "madison", "ann arbor", "providence", "new haven",
  "stamford", "hoboken", "newark", "princeton", "huntington beach", "fresno", "schaumburg", "jacksonville",
  "gainesville", "toronto", "vancouver", "montreal", "ottawa", "waterloo", "calgary", "london", "manchester",
  "edinburgh", "oxford", "bristol", "dublin", "paris", "lyon", "toulouse", "berlin", "munich", "hamburg",
  "frankfurt", "cologne", "freiburg", "stuttgart", "amsterdam", "rotterdam", "utrecht", "eindhoven", "brussels",
  "antwerp", "zurich", "zürich", "geneva", "lausanne", "basel", "vienna", "prague", "warsaw", "krakow", "kraków",
  "wroclaw", "budapest", "bucharest", "sofia", "athens", "lisbon", "porto", "madrid", "barcelona", "valencia",
  "milan", "rome", "turin", "stockholm", "gothenburg", "copenhagen", "oslo", "helsinki", "tallinn", "riga", "vilnius",
  "kyiv", "belgrade", "zagreb", "ljubljana", "istanbul", "skopje", "tokyo", "osaka", "seoul", "beijing", "shanghai",
  "shenzhen", "taipei", "bangkok", "jakarta", "manila", "kuala lumpur", "ho chi minh city", "hanoi", "dubai",
  "abu dhabi", "riyadh", "khobar", "doha", "tel aviv", "jerusalem", "cairo", "lagos", "nairobi", "cape town",
  "johannesburg", "sydney", "melbourne", "brisbane", "perth", "auckland", "wellington", "são paulo", "sao paulo",
  "rio de janeiro", "buenos aires", "mexico city", "guadalajara", "bogotá", "bogota", "medellín", "medellin",
  "santiago", "lima", "montevideo", "karachi", "lahore", "islamabad", "dhaka", "colombo", "kathmandu",
];

/** HN-style abbreviations → canonical display names. */
export const CITY_ALIASES: Readonly<Record<string, string>> = {
  sf: "San Francisco, CA",
  "sf bay": "San Francisco Bay Area, CA",
  "sf bay area": "San Francisco Bay Area, CA",
  "bay area": "San Francisco Bay Area, CA",
  nyc: "New York, NY",
  ny: "New York, NY",
  la: "Los Angeles, CA",
  dc: "Washington, DC",
  blr: "Bengaluru, India",
  ncr: "Delhi NCR, India",
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Builds a case-insensitive "whole phrase" matcher; tolerates "." inside entries (u.s.). */
export function phraseRegex(phrases: readonly string[], flags = "i"): RegExp {
  const parts = [...phrases].sort((a, b) => b.length - a.length).map(escapeRe);
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join("|")})(?![\\p{L}\\p{N}])`, `${flags}u`);
}

export const INDIA_RE: RegExp = new RegExp(
  `${phraseRegex(INDIA_PLACES).source}|\\bIST\\b|(?:utc|gmt)\\s*\\+\\s*0?5(?::|\\.)?30`,
  "iu",
);
export const INDIA_REGION_RE: RegExp = phraseRegex(INDIA_REGIONS);
export const NON_INDIA_REGION_RE: RegExp = phraseRegex(NON_INDIA_REGIONS);
export const OTHER_COUNTRY_RE: RegExp = phraseRegex(OTHER_COUNTRIES);
export const US_STATE_RE: RegExp = phraseRegex(US_STATES);
export const NA_TIMEZONE_RE: RegExp = phraseRegex(NA_TIMEZONES);
export const GLOBAL_CITY_RE: RegExp = phraseRegex(GLOBAL_CITIES);
export const INDIA_CITY_RE: RegExp = phraseRegex(INDIA_PLACES);
/** "Austin, TX" / "Lausanne, CH" — a capitalised place followed by a state/country code. */
export const CITY_CODE_RE: RegExp = new RegExp(
  `\\b[A-Z][\\p{L}.'-]+(?:\\s+[A-Z][\\p{L}.'-]+)*,\\s*(?:${[...US_STATE_CODES, ...COUNTRY_CODES].join("|")})\\b`,
  "u",
);
