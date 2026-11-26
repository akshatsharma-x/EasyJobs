import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger, HttpError, type HttpClient, type HttpRequestInit, type Logger } from "@easyjobs/contract/node";
import { postFromFixture } from "../src/wp/rest";
import { getSite, SITES } from "../src/sites";
import { blogHosts } from "../src/wp/scraper";
import type { ParseContext } from "../src/parse/post";
import type { PostFixture, WpPost, WpRestPost, WpRestTerm } from "../src/wp/types";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
export const EXPECTED = fileURLToPath(new URL("./__expected__/", import.meta.url));
export const BLOG_HOSTS = blogHosts(SITES);

export interface LoadedFixture {
  file: string;
  name: string;
  fixture: PostFixture;
  post: WpPost;
}

export function loadFixtures(site?: string): LoadedFixture[] {
  const out: LoadedFixture[] = [];
  for (const dir of readdirSync(FIXTURES, { withFileTypes: true })) {
    if (!dir.isDirectory() || (site && dir.name !== site) || dir.name === "raw") continue;
    for (const f of readdirSync(join(FIXTURES, dir.name)).filter((n) => n.endsWith(".json")).sort()) {
      const file = join(FIXTURES, dir.name, f);
      const fixture = JSON.parse(readFileSync(file, "utf8")) as PostFixture;
      out.push({ file, name: `${dir.name}/${f.replace(/\.json$/, "")}`, fixture, post: postFromFixture(fixture) });
    }
  }
  return out;
}

export function loadFixture(name: string): LoadedFixture {
  const [site, id] = name.split("/");
  const f = loadFixtures(site).find((x) => x.name === `${site}/${id}`);
  if (!f) throw new Error(`fixture ${name} not found`);
  return f;
}

export function parseContextFor(siteId: string, resolve?: Record<string, string>): ParseContext {
  const site = getSite(siteId);
  if (!site) throw new Error(`unknown site ${siteId}`);
  return { site, extraBlogHosts: BLOG_HOSTS, ...(resolve ? { resolveUrl: (u: string) => resolve[u] ?? u } : {}) };
}

/** Silent logger for tests (set LOG_LEVEL=debug to see output). */
export function testLogger(): Logger {
  if (process.env.LOG_LEVEL === "debug") return createLogger("test");
  const noop = (): void => undefined;
  const l: Logger = { debug: noop, info: noop, warn: noop, error: noop, child: () => l };
  return l;
}

export type Route = (url: URL, init?: HttpRequestInit) => Response | Promise<Response>;

/** HttpClient backed by a route function; records every requested URL. */
export function fakeHttp(route: Route): HttpClient & { calls: string[] } {
  const calls: string[] = [];
  const doFetch = async (url: string, init?: HttpRequestInit): Promise<Response> => {
    calls.push(url);
    return route(new URL(url), init);
  };
  return {
    calls,
    fetch: doFetch,
    async json<T = unknown>(url: string, init?: HttpRequestInit): Promise<T> {
      const res = await doFetch(url, init);
      if (!res.ok) throw new HttpError(res.status, url, await res.text());
      return (await res.json()) as T;
    },
    async text(url: string, init?: HttpRequestInit): Promise<string> {
      const res = await doFetch(url, init);
      if (!res.ok) throw new HttpError(res.status, url, await res.text());
      return res.text();
    },
  };
}

const json = (data: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json; charset=UTF-8", ...headers } });

const gmt = (iso: string): number => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);

/**
 * Minimal WordPress REST emulator over fixture posts (+ optional overrides of posts, e.g. modified dates):
 * /wp-json/wp/v2/posts (per_page, page, after, modified_after, include, orderby) and /categories|/tags?include=.
 */
export function wpRestRoute(fixtures: PostFixture[]): Route {
  const posts: WpRestPost[] = fixtures.map((f) => f.post);
  const terms = { categories: new Map<number, WpRestTerm>(), tags: new Map<number, WpRestTerm>() };
  for (const f of fixtures) {
    for (const t of f.terms.categories) terms.categories.set(t.id, t);
    for (const t of f.terms.tags) terms.tags.set(t.id, t);
  }
  return (url) => {
    const m = /\/wp-json\/wp\/v2\/(posts|categories|tags)$/.exec(url.pathname);
    if (!m) return new Response("not found", { status: 404 });
    const q = url.searchParams;
    if (m[1] === "categories" || m[1] === "tags") {
      const ids = (q.get("include") ?? "").split(",").map(Number).filter(Boolean);
      return json(ids.map((id) => terms[m[1] as "categories" | "tags"].get(id)).filter(Boolean));
    }
    let list = [...posts];
    const include = q.get("include");
    if (include) {
      const ids = include.split(",").map(Number);
      list = list.filter((p) => ids.includes(p.id));
    }
    const after = q.get("after");
    if (after) list = list.filter((p) => gmt(p.date_gmt) > Date.parse(after));
    const modifiedAfter = q.get("modified_after");
    if (modifiedAfter) list = list.filter((p) => gmt(p.modified_gmt) > Date.parse(modifiedAfter));
    const key = q.get("orderby") === "modified" ? "modified_gmt" : "date_gmt";
    list.sort((a, b) => gmt(b[key]) - gmt(a[key]));
    const perPage = Number(q.get("per_page") ?? 10);
    const page = Number(q.get("page") ?? 1);
    const totalPages = Math.max(1, Math.ceil(list.length / perPage));
    if (page > totalPages) return new Response(JSON.stringify({ code: "rest_post_invalid_page_number" }), { status: 400 });
    const fields = (q.get("_fields") ?? "").split(",").filter(Boolean);
    const slice = list.slice((page - 1) * perPage, page * perPage).map((p) => {
      if (fields.length === 0) return p;
      return Object.fromEntries(Object.entries(p).filter(([k]) => fields.includes(k)));
    });
    return json(slice, { "x-wp-total": String(list.length), "x-wp-totalpages": String(totalPages) });
  };
}
