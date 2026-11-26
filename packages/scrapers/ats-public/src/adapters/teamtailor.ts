/**
 * Teamtailor career-site RSS feed (public; every Teamtailor career site exposes it):
 *   GET https://{company}.teamtailor.com/jobs.rss?per_page=100&offset={n}
 * Paginated with per_page + offset (`page` is ignored; verified). Unknown subdomain → 404.
 * Career sites on custom domains work too (token "https://jobs.lunar.app"); robots.txt is respected.
 * Items carry escaped-HTML descriptions, RFC-822 pubDate, remoteStatus (none|onsite|hybrid|fully|temporary)
 * and structured tt:locations. Job links usually point at the company's own career domain.
 */
import type { CompanyTarget, RawJob, WorkMode } from "@easyjobs/contract";
import { UnexpectedResponseError } from "../core/errors";
import { getBoardText } from "../core/http";
import { buildJob } from "../core/job";
import { paginateOffset } from "../core/paginate";
import type { AtsAdapter } from "../core/types";
import { joinLocation } from "../lib/location";
import { clean, extraOf, isRecord } from "../lib/text";
import { careersOrigin } from "../lib/tokens";
import { createFeedParser, xmlText } from "../lib/xml";

export interface TeamtailorItem {
  id: string;
  guid: string | null;
  title: string | null;
  link: string | null;
  description: string | null;
  pubDate: string | null;
  remoteStatus: string | null;
  department: string | null;
  role: string | null;
  locations: { name: string | null; city: string | null; country: string | null }[];
}

export const TEAMTAILOR_PAGE_SIZE = 100;

const parser = createFeedParser(["rss.channel.item", "rss.channel.item.tt:locations.tt:location"]);

/** Numeric job id from ".../jobs/8794741-title", else the RSS guid. */
export const teamtailorJobId = (link: string | null, guid: string | null): string | null =>
  (link ? /\/jobs\/(\d+)(?:[-/?#]|$)/.exec(link)?.[1] : undefined) ?? guid;

export function parseTeamtailorRss(xml: string, url = "teamtailor feed"): TeamtailorItem[] {
  const doc: unknown = parser.parse(xml);
  const channel = isRecord(doc) && isRecord(doc.rss) ? doc.rss.channel : undefined;
  if (!isRecord(channel)) throw new UnexpectedResponseError(url, "expected an RSS <channel>");
  const items = Array.isArray(channel.item) ? channel.item : [];
  return items.filter(isRecord).flatMap((it): TeamtailorItem[] => {
    const link = xmlText(it.link);
    const guid = xmlText(it.guid);
    const id = teamtailorJobId(link, guid);
    if (!id) return [];
    const locs = isRecord(it["tt:locations"]) && Array.isArray(it["tt:locations"]["tt:location"]) ? it["tt:locations"]["tt:location"] : [];
    return [
      {
        id,
        guid,
        title: xmlText(it.title),
        link,
        description: xmlText(it.description),
        pubDate: xmlText(it.pubDate),
        remoteStatus: xmlText(it.remoteStatus),
        department: xmlText(it["tt:department"]),
        role: xmlText(it["tt:role"]),
        locations: locs.filter(isRecord).map((l) => ({
          name: xmlText(l["tt:name"]),
          city: xmlText(l["tt:city"]),
          country: xmlText(l["tt:country"]),
        })),
      },
    ];
  });
}

export const teamtailorOrigin = (token: string): string => careersOrigin(token, "teamtailor.com");
export const teamtailorFeedUrl = (origin: string, offset: number, perPage = TEAMTAILOR_PAGE_SIZE): string =>
  `${origin}/jobs.rss?per_page=${perPage}&offset=${offset}`;

/** "temporary" (temporarily remote) and "none" carry no reliable signal. */
const REMOTE_STATUS: Record<string, WorkMode> = { fully: "remote", remote: "remote", hybrid: "hybrid", onsite: "onsite" };

export function mapTeamtailorItem(it: TeamtailorItem, target: CompanyTarget): RawJob | null {
  const workMode = REMOTE_STATUS[clean(it.remoteStatus)?.toLowerCase() ?? ""];
  // tt:name is the display name ("Copenhagen, Denmark"); tt:city may be the local spelling ("København").
  const locations = it.locations.map((l) => clean(l.name) ?? joinLocation([l.city, l.country]));
  if (locations.length === 0 && workMode === "remote") locations.push("Remote");
  return buildJob("teamtailor", target, {
    sourceJobId: it.id,
    title: it.title,
    url: it.link,
    locations,
    descriptionHtml: it.description,
    postedAt: it.pubDate,
    department: it.department,
    workMode,
    extra: extraOf({ guid: it.guid ?? undefined, role: clean(it.role), remoteStatus: clean(it.remoteStatus) }),
  });
}

export const teamtailor: AtsAdapter = {
  id: "teamtailor",
  name: "Teamtailor",
  ats: "teamtailor",
  endpoint: "https://{company}.teamtailor.com/jobs.rss?per_page=100&offset={n}",
  async *scrapeTarget(ctx) {
    const origin = teamtailorOrigin(ctx.target.token);
    const items = paginateOffset<TeamtailorItem>({
      pageSize: TEAMTAILOR_PAGE_SIZE,
      signal: ctx.signal,
      log: ctx.log,
      idOf: (it) => it.id,
      fetchPage: async (offset) => {
        const url = teamtailorFeedUrl(origin, offset);
        const xml = await getBoardText(ctx, url, { robots: true, accept: "application/rss+xml,application/xml" });
        return { items: parseTeamtailorRss(xml, url) };
      },
    });
    for await (const it of items) {
      const raw = mapTeamtailorItem(it, ctx.target);
      if (raw) yield raw;
      else ctx.skip("missing id/title/url");
    }
  },
};
