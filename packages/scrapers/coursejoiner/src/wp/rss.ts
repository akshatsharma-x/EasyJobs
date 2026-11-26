/** RSS 2.0 (WordPress /feed/) parsing. */
import * as cheerio from "cheerio";
import { slugify } from "@easyjobs/contract";
import { decodeEntities, normalizeSpace } from "../util/text";
import { syntheticPostId } from "./html";
import type { WpPostRef, WpTerm } from "./types";

export interface FeedItem {
  ref: WpPostRef;
  /** content:encoded when the feed carries full text. */
  contentHtml: string | null;
}

export function parseFeed(xml: string): FeedItem[] {
  const $ = cheerio.load(xml, { xml: true });
  return $("item")
    .toArray()
    .flatMap((item): FeedItem[] => {
      const $i = $(item);
      const link = normalizeSpace($i.children("link").first().text());
      const guid = normalizeSpace($i.children("guid").first().text());
      const pub = Date.parse(normalizeSpace($i.children("pubDate").first().text()));
      if (!link || Number.isNaN(pub)) return [];
      const idMatch = /[?&]p=(\d+)/.exec(guid);
      const id = idMatch ? Number(idMatch[1]) : syntheticPostId(link);
      const categories: WpTerm[] = $i
        .children("category")
        .toArray()
        .map((c, n) => {
          const name = normalizeSpace(decodeEntities($(c).text()));
          return { id: -(n + 1), slug: slugify(name), name };
        })
        .filter((t) => t.slug);
      const encoded = $i.children("content\\:encoded").first().text() || $i.find("content\\:encoded").first().text();
      const iso = new Date(pub).toISOString();
      return [
        {
          ref: {
            id,
            link,
            title: normalizeSpace(decodeEntities($i.children("title").first().text())),
            dateGmt: iso,
            modifiedGmt: iso,
            categories,
            tags: [],
          },
          contentHtml: encoded && encoded.trim().length > 200 ? encoded : null,
        },
      ];
    });
}
