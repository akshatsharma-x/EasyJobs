import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SEARCH_QUERY, type JobsSearchResponse } from "@easyjobs/contract";
import { createHttpApi } from "@/lib/api/http";
import { ApiRequestError } from "@/lib/api/types";

/** Minimal stub of the §0.5 API: records every request and answers with contract-shaped JSON. */
const seen: string[] = [];
let server: Server;
let baseUrl = "";

const emptySearch: JobsSearchResponse = {
  data: [],
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
  facets: { type: [], level: [], mode: [], category: [], location: [], company: [], ctype: [], skills: [], batch: [], source: [], tag: [] },
  tookMs: 3,
};

function handler(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? "/";
  seen.push(url);
  const json = (status: number, body: unknown): void => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.startsWith("/v1/jobs?") || url === "/v1/jobs") return json(200, emptySearch);
  if (url.startsWith("/v1/jobs/missing")) return json(404, { error: { code: "not_found", message: "Job not found" } });
  if (url.startsWith("/v1/jobs/boom")) return json(500, { error: { code: "internal", message: "Database unavailable" } });
  if (/^\/v1\/jobs\/[^/]+\/similar/.test(url)) return json(200, { data: [] });
  if (url.startsWith("/v1/suggest")) return json(200, { titles: [], companies: [], locations: [], skills: [] });
  if (url.startsWith("/v1/companies/missing")) return json(404, { error: { code: "not_found", message: "nope" } });
  if (url.startsWith("/v1/companies")) return json(200, { data: [], page: 1, pageSize: 24, total: 0 });
  return json(404, { error: { code: "not_found", message: "no route" } });
}

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("http JobsApi (prompts.md §0.5)", () => {
  it("serialises SearchQuery with toQueryString on GET /v1/jobs", async () => {
    const api = createHttpApi({ baseUrl });
    seen.length = 0;
    await api.searchJobs({ ...DEFAULT_SEARCH_QUERY, q: "react dev", level: ["intern", "fresher"], location: ["Bengaluru"], official: true, sort: "newest", page: 2 });
    expect(seen[0]).toBe("/v1/jobs?q=react+dev&level=intern,fresher&location=Bengaluru&official=1&sort=newest&page=2");
  });

  it("omits defaults entirely", async () => {
    const api = createHttpApi({ baseUrl });
    seen.length = 0;
    await api.searchJobs(DEFAULT_SEARCH_QUERY);
    expect(seen[0]).toBe("/v1/jobs");
  });

  it("maps 404 to null for job and company lookups, and encodes ids", async () => {
    const api = createHttpApi({ baseUrl });
    expect(await api.getJob("missing")).toBeNull();
    expect(await api.company("missing")).toBeNull();
    seen.length = 0;
    await api.similar("a/b c", 50);
    expect(seen[0]).toBe("/v1/jobs/a%2Fb%20c/similar?limit=12");
  });

  it("throws ApiRequestError with the ApiError code/message for other failures", async () => {
    const api = createHttpApi({ baseUrl });
    await expect(api.getJob("boom")).rejects.toMatchObject({ name: "ApiRequestError", status: 500, code: "internal", message: "Database unavailable" });
  });

  it("reports network failures as ApiRequestError(0, network_error)", async () => {
    const api = createHttpApi({ baseUrl: "http://127.0.0.1:9" });
    const error = await api.stats().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe("network_error");
  });

  it("builds companies and suggest query strings", async () => {
    const api = createHttpApi({ baseUrl });
    seen.length = 0;
    await api.companies({ q: "tata", ctype: ["indian_it", "mnc"], page: 2, pageSize: 48 });
    await api.suggest("sde 1");
    expect(seen).toEqual(["/v1/companies?q=tata&ctype=indian_it,mnc&page=2&pageSize=48", "/v1/suggest?q=sde+1"]);
  });

  it("subscribe is a no-op outside the browser", () => {
    const api = createHttpApi({ baseUrl });
    const unsubscribe = api.subscribe({ level: ["intern"] }, () => undefined);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });
});
