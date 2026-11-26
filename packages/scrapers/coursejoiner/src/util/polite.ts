import { sleep, type HttpClient, type HttpRequestInit } from "@easyjobs/contract/node";

interface Gate {
  chain: Promise<void>;
  lastStart: number;
}

/** Process-wide per-host gates, shared by every scraper instance in this package. */
const gates = new Map<string, Gate>();

/**
 * Wraps the shared contract HttpClient (which already does robots.txt, retries and a 750 ms per-host gap)
 * with a stricter per-host policy for blogs: one request in flight per host and ≥ `minGapMs` between starts.
 * This keeps us at ≤ 1 request/second per site, as required.
 */
export function politeHttp(http: HttpClient, minGapMs = 1000): HttpClient {
  async function gated<T>(url: string, init: HttpRequestInit | undefined, fn: () => Promise<T>): Promise<T> {
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return fn(); // invalid URL → let the underlying client throw a meaningful error
    }
    let gate = gates.get(host);
    if (!gate) {
      gate = { chain: Promise.resolve(), lastStart: 0 };
      gates.set(host, gate);
    }
    const g = gate;
    const previous = g.chain;
    let release!: () => void;
    g.chain = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      const signal = init?.signal ?? undefined;
      if (signal?.aborted) throw signal.reason ?? new Error("aborted");
      const wait = g.lastStart + minGapMs - Date.now();
      if (wait > 0) await sleep(wait, signal);
      g.lastStart = Date.now();
      return await fn();
    } finally {
      release();
    }
  }
  return {
    fetch: (url, init) => gated(url, init, () => http.fetch(url, init)),
    json: <T = unknown>(url: string, init?: HttpRequestInit) => gated(url, init, () => http.json<T>(url, init)),
    text: (url, init) => gated(url, init, () => http.text(url, init)),
  };
}
