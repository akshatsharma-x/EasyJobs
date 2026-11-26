import type { Logger } from "@easyjobs/contract/node";
import { errorMessage } from "../shared/text";

/** What one page navigation produced. */
export interface BrowserPage {
  /** Main document HTTP status (null if the navigation produced no response). */
  status: number | null;
  /** Final URL after redirects. */
  url: string;
  /** Main document body as served (first 200 KB) — robots.txt text, or the HTML used for block detection. */
  body: string;
  /** The first response matching `waitFor`, i.e. the data the page itself received. */
  api: { url: string; status: number; text: string; json: unknown } | null;
}

export interface NaukriFetcher {
  /** UA actually sent (browser UA + our bot token). */
  readonly userAgent: string;
  open(url: string, waitFor: RegExp | null, signal: AbortSignal): Promise<BrowserPage>;
  close(): Promise<void>;
}

export interface FetcherOptions {
  botUserAgent: string;
  navigationTimeoutMs: number;
  apiWaitMs: number;
  log: Logger;
}

export type FetcherFactory = (options: FetcherOptions) => Promise<NaukriFetcher>;

/** Playwright missing / Chromium not installed — a setup problem, not a block. */
export class BrowserUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserUnavailableError";
  }
}

/* Minimal structural view of the Playwright API we use (keeps playwright an optional dependency). */
interface PwResponse {
  status(): number;
  url(): string;
  text(): Promise<string>;
}
interface PwRoute {
  request(): { resourceType(): string };
  abort(): Promise<void>;
  continue(): Promise<void>;
}
interface PwPage {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<PwResponse | null>;
  waitForResponse(predicate: (r: PwResponse) => boolean, options: { timeout: number }): Promise<PwResponse>;
  evaluate<T>(fn: () => T): Promise<T>;
  url(): string;
  close(): Promise<void>;
}
interface PwContext {
  newPage(): Promise<PwPage>;
  route(pattern: string, handler: (route: PwRoute) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}
interface PwBrowser {
  newContext(options: { userAgent?: string; locale?: string; serviceWorkers?: "block" }): Promise<PwContext>;
  close(): Promise<void>;
}
interface PlaywrightModule {
  chromium: { launch(options: { headless: boolean }): Promise<PwBrowser> };
}

const INSTALL_HINT = "pnpm --filter @easyjobs/scraper-portals exec playwright install chromium";
const BODY_LIMIT = 200_000;
/** Images, fonts and media aren't needed to read results — skipping them keeps each page load light. */
const SKIPPED_RESOURCES = new Set(["image", "media", "font"]);

/**
 * Vanilla headless Chromium — no stealth plugins, no fingerprint changes, no proxies. The UA is Chromium's own
 * (it says "HeadlessChrome") with our bot token appended, so the site can see exactly who is visiting.
 * A fresh context per run: no cookies are carried in and nothing is persisted.
 */
export const createPlaywrightFetcher: FetcherFactory = async (options) => {
  const specifier = "playwright";
  let pw: PlaywrightModule;
  try {
    pw = (await import(specifier)) as PlaywrightModule;
  } catch (e) {
    throw new BrowserUnavailableError(`playwright is not installed (${errorMessage(e)}); install it with: ${INSTALL_HINT}`);
  }
  let browser: PwBrowser;
  try {
    browser = await pw.chromium.launch({ headless: true });
  } catch (e) {
    throw new BrowserUnavailableError(`headless Chromium failed to launch (${errorMessage(e).split("\n")[0]}); run: ${INSTALL_HINT}`);
  }
  try {
    const scratch = await browser.newContext({});
    const probe = await scratch.newPage();
    const browserUa = await probe.evaluate(() => navigator.userAgent);
    await scratch.close();
    const userAgent = `${browserUa} ${options.botUserAgent}`;
    const context = await browser.newContext({ userAgent, locale: "en-IN", serviceWorkers: "block" });
    await context.route("**/*", (route) => (SKIPPED_RESOURCES.has(route.request().resourceType()) ? route.abort() : route.continue()));
    options.log.debug("naukri: headless Chromium ready", { userAgent });

    return {
      userAgent,
      async open(url, waitFor, signal) {
        if (signal.aborted) throw signal.reason;
        const page = await context.newPage();
        const onAbort = (): void => void page.close().catch(() => undefined);
        signal.addEventListener("abort", onAbort, { once: true });
        try {
          const apiPromise = waitFor
            ? page.waitForResponse((r) => waitFor.test(r.url()), { timeout: options.apiWaitMs }).catch(() => null)
            : Promise.resolve(null);
          const main = await page.goto(url, { waitUntil: "domcontentloaded", timeout: options.navigationTimeoutMs });
          const status = main?.status() ?? null;
          const body = ((await main?.text().catch(() => "")) ?? "").slice(0, BODY_LIMIT);
          let api: BrowserPage["api"] = null;
          // Only wait for the page's data request when the page itself was served (not on 403/429 pages).
          if (waitFor && status !== null && status < 400) {
            const r = await apiPromise;
            if (r) {
              const text = await r.text().catch(() => "");
              api = { url: r.url(), status: r.status(), text, json: safeJson(text) };
            }
          }
          return { status, url: page.url(), body, api };
        } finally {
          signal.removeEventListener("abort", onAbort);
          await page.close().catch(() => undefined);
        }
      },
      async close() {
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      },
    };
  } catch (e) {
    await browser.close().catch(() => undefined);
    throw e;
  }
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
