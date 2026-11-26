import { LABELS, type SearchQuery } from "@easyjobs/contract";

/** Human title for a search ("Internships in Bengaluru", "“react” jobs · Remote"). */
export function searchTitle(query: SearchQuery): string {
  const level = query.level?.length === 1 ? query.level[0] : undefined;
  let what = "Jobs";
  if (level === "intern" || query.type?.includes("internship")) what = "Internships";
  else if (level === "fresher") what = "Fresher jobs";
  else if (level) what = `${LABELS.level[level].split(" ·")[0]} jobs`;
  if (query.q) what = `“${query.q}” ${what.toLowerCase()}`;
  const where = query.location?.length === 1 ? (query.location[0] === "Remote" ? " · Remote" : ` in ${query.location[0]}`) : "";
  const mode = !where && query.mode?.length === 1 ? ` · ${LABELS.workMode[query.mode[0] ?? "onsite"]}` : "";
  return `${what}${where}${mode}`;
}
