import type { Scraper } from "@easyjobs/contract/node";
import { SITES } from "./sites";
import { blogHosts, createWpJobBlogScraper } from "./wp/scraper";

const hosts = blogHosts(SITES);

/** CourseJoiner + similar Indian fresher/off-campus job blogs (one Scraper per site). */
export const scrapers: Scraper[] = SITES.map((site) => createWpJobBlogScraper(site, { extraBlogHosts: hosts }));
export default scrapers;

export { createWpJobBlogScraper, blogHosts } from "./wp/scraper";
export type { WpJobBlogOptions, RunStats } from "./wp/scraper";
export type { WpJobBlogConfig, SourceStrategy } from "./wp/config";
export { SITES, COURSEJOINER, FRESHERSHUNT, FRESHEROFFCAMPUS, KICKCHARM, getSite } from "./sites";
export { parsePost } from "./parse/post";
export type { ParsedPost, ParseContext } from "./parse/post";
