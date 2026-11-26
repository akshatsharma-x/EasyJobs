import { HttpError, type HttpClient, type Logger } from "@easyjobs/contract/node";
import { decodeEntities, normalizeSpace } from "../util/text";
import type { JsonStore } from "../util/store";
import { wpGmtToIso, type WpPost, type WpPostRef, type WpRestPost, type WpRestTerm, type WpTerm } from "./types";

const LIST_FIELDS = "id,date_gmt,modified_gmt,link,title,categories,tags";
const FULL_FIELDS = "id,date_gmt,modified_gmt,link,title,content,categories,tags";
const MAX_PER_PAGE = 100;

export interface RestListQuery {
  /** Only posts published after this instant (server-side `after`). */
  after?: Date;
  /** Only posts modified after this instant (server-side `modified_after`, WP ≥ 5.7). */
  modifiedAfter?: Date;
  orderby: "date" | "modified";
  perPage?: number;
}

export interface RestPage {
  page: number;
  totalPages: number;
  total: number | null;
  refs: WpPostRef[];
}

export class RestUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestUnavailableError";
  }
}

export interface WpRestClientOptions {
  http: HttpClient;
  baseUrl: string;
  log: Logger;
  signal?: AbortSignal;
  /** Persistent term cache (keys "categories:<id>" / "tags:<id>"). */
  terms: JsonStore<WpTerm>;
}

/** Minimal WordPress REST v2 client for public posts. */
export class WpRestClient {
  private readonly http: HttpClient;
  private readonly log: Logger;
  private readonly signal: AbortSignal | undefined;
  private readonly terms: JsonStore<WpTerm>;
  private api: string;

  constructor(opts: WpRestClientOptions) {
    this.http = opts.http;
    this.log = opts.log;
    this.signal = opts.signal;
    this.terms = opts.terms;
    this.api = `${opts.baseUrl.replace(/\/+$/, "")}/wp-json/wp/v2`;
  }

  private url(path: string, params: Record<string, string | number | undefined>): string {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v)).replace(/%2C/gi, ",")}`)
      .join("&");
    return `${this.api}/${path}${qs ? `?${qs}` : ""}`;
  }

  private async getJson<T>(url: string): Promise<{ data: T; headers: Headers }> {
    const res = await this.http.fetch(url, { headers: { accept: "application/json" }, signal: this.signal });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new HttpError(res.status, url, body);
    }
    if (!type.includes("json")) {
      await res.body?.cancel().catch(() => undefined);
      throw new RestUnavailableError(`non-JSON response (${type || "no content-type"}) from ${url}`);
    }
    return { data: (await res.json()) as T, headers: res.headers };
  }

  /** Cheap availability check. Throws RestUnavailableError when the REST API is off/blocked. */
  async probe(): Promise<number | null> {
    try {
      const { data, headers } = await this.getJson<unknown>(this.url("posts", { per_page: 1, _fields: "id" }));
      if (!Array.isArray(data)) throw new RestUnavailableError("posts endpoint did not return an array");
      const total = Number(headers.get("x-wp-total"));
      return Number.isFinite(total) ? total : null;
    } catch (e) {
      if (e instanceof RestUnavailableError) throw e;
      if (e instanceof HttpError && [401, 403, 404, 410, 501].includes(e.status)) {
        throw new RestUnavailableError(`REST API unavailable (HTTP ${e.status})`);
      }
      throw e;
    }
  }

  /** Lists post refs page by page (newest first). */
  async *list(query: RestListQuery): AsyncGenerator<RestPage> {
    const perPage = Math.min(MAX_PER_PAGE, query.perPage ?? MAX_PER_PAGE);
    for (let page = 1; ; page++) {
      const url = this.url("posts", {
        per_page: perPage,
        page,
        orderby: query.orderby,
        order: "desc",
        after: query.after ? isoNoMillis(query.after) : undefined,
        modified_after: query.modifiedAfter ? isoNoMillis(query.modifiedAfter) : undefined,
        _fields: LIST_FIELDS,
      });
      let data: WpRestPost[];
      let headers: Headers;
      try {
        ({ data, headers } = await this.getJson<WpRestPost[]>(url));
      } catch (e) {
        // Past the last page WP answers 400 rest_post_invalid_page_number.
        if (e instanceof HttpError && e.status === 400 && page > 1) return;
        throw e;
      }
      if (!Array.isArray(data)) throw new RestUnavailableError(`unexpected posts payload from ${url}`);
      const totalPages = Number(headers.get("x-wp-totalpages")) || (data.length < perPage ? page : page + 1);
      const totalHeader = Number(headers.get("x-wp-total"));
      const refs = await this.toRefs(data);
      yield { page, totalPages, total: Number.isFinite(totalHeader) ? totalHeader : null, refs };
      if (page >= totalPages || data.length < perPage) return;
    }
  }

  /** Fetches full posts (with content) by id, in chunks. Missing/unpublished ids are simply absent. */
  async fetchPosts(ids: number[], chunkSize = 25): Promise<WpPost[]> {
    const out: WpPost[] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const url = this.url("posts", { include: chunk.join(","), per_page: chunk.length, _fields: FULL_FIELDS });
      const { data } = await this.getJson<WpRestPost[]>(url);
      if (!Array.isArray(data)) throw new RestUnavailableError(`unexpected posts payload from ${url}`);
      const posts = await this.toPosts(data);
      out.push(...posts);
    }
    return out;
  }

  /** Converts raw REST posts (with content) into normalized posts, resolving term ids. */
  async toPosts(raw: WpRestPost[]): Promise<WpPost[]> {
    const refs = await this.toRefs(raw);
    const byId = new Map(raw.map((r) => [r.id, r]));
    return refs.map((ref) => ({ ...ref, contentHtml: byId.get(ref.id)?.content?.rendered ?? "" }));
  }

  private async toRefs(raw: WpRestPost[]): Promise<WpPostRef[]> {
    const catIds = [...new Set(raw.flatMap((p) => p.categories ?? []))];
    const tagIds = [...new Set(raw.flatMap((p) => p.tags ?? []))];
    await this.resolveTerms("categories", catIds);
    await this.resolveTerms("tags", tagIds);
    const refs: WpPostRef[] = [];
    for (const p of raw) {
      const ref = restToRef(p, (kind, id) => this.terms.get(`${kind}:${id}`));
      if (ref) refs.push(ref);
    }
    return refs;
  }

  private async resolveTerms(kind: "categories" | "tags", ids: number[]): Promise<void> {
    const missing = ids.filter((id) => !this.terms.has(`${kind}:${id}`));
    for (let i = 0; i < missing.length; i += MAX_PER_PAGE) {
      const chunk = missing.slice(i, i + MAX_PER_PAGE);
      const url = this.url(kind, { include: chunk.join(","), per_page: chunk.length, _fields: "id,slug,name" });
      try {
        const { data } = await this.getJson<WpRestTerm[]>(url);
        for (const t of data) this.terms.set(`${kind}:${t.id}`, { id: t.id, slug: t.slug, name: cleanTermName(t.name) });
      } catch (e) {
        // Terms are hints only — never fail a run because the taxonomy endpoint is restricted.
        this.log.warn(`could not resolve ${kind}`, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
    }
  }
}

function cleanTermName(name: string): string {
  return normalizeSpace(decodeEntities(name));
}

function isoNoMillis(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Pure conversion used by the client and by tests (fixtures carry their own term lists). */
export function restToRef(p: WpRestPost, term: (kind: "categories" | "tags", id: number) => WpTerm | undefined): WpPostRef | null {
  const dateGmt = wpGmtToIso(p.date_gmt);
  const modifiedGmt = wpGmtToIso(p.modified_gmt) ?? dateGmt;
  if (!dateGmt || !modifiedGmt || typeof p.link !== "string") return null;
  const pick = (kind: "categories" | "tags", ids: number[] | undefined): WpTerm[] =>
    (ids ?? []).map((id) => term(kind, id)).filter((t): t is WpTerm => t !== undefined);
  return {
    id: p.id,
    link: p.link,
    title: normalizeSpace(decodeEntities((p.title?.rendered ?? "").replace(/<[^>]*>/g, " "))),
    dateGmt,
    modifiedGmt,
    categories: pick("categories", p.categories),
    tags: pick("tags", p.tags),
  };
}

/** Builds a normalized post from a saved fixture (raw REST post + its terms). */
export function postFromFixture(f: { post: WpRestPost; terms: { categories: WpRestTerm[]; tags: WpRestTerm[] } }): WpPost {
  const map = new Map<string, WpTerm>();
  for (const t of f.terms.categories) map.set(`categories:${t.id}`, { id: t.id, slug: t.slug, name: cleanTermName(t.name) });
  for (const t of f.terms.tags) map.set(`tags:${t.id}`, { id: t.id, slug: t.slug, name: cleanTermName(t.name) });
  const ref = restToRef(f.post, (kind, id) => map.get(`${kind}:${id}`));
  if (!ref) throw new Error(`fixture post ${f.post.id} is missing dates/link`);
  return { ...ref, contentHtml: f.post.content?.rendered ?? "" };
}
