import { HttpError, RobotsDisallowedError } from "@easyjobs/contract/node";

/** The board/account does not exist (404/410, or a redirect to the vendor's home page). */
export class BoardNotFoundError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(url: string, status: number, detail?: string) {
    super(`Board not found (HTTP ${status}) at ${url}${detail ? ` — ${detail}` : ""}`);
    this.name = "BoardNotFoundError";
    this.status = status;
    this.url = url;
  }
}

/** The response arrived but was not what the API documents (HTML instead of JSON, wrong shape…). */
export class UnexpectedResponseError extends Error {
  readonly url: string;
  constructor(url: string, detail: string) {
    super(`Unexpected response from ${url}: ${detail}`);
    this.name = "UnexpectedResponseError";
    this.url = url;
  }
}

/** Rate limited or refused (429/403 after the HTTP client's own retries). */
export const isThrottle = (error: unknown): boolean =>
  error instanceof HttpError && (error.status === 429 || error.status === 403);

/** One-line description for logs and aggregated errors. */
export function describeError(error: unknown): string {
  if (error instanceof HttpError) return `HTTP ${error.status} for ${error.url}`;
  if (error instanceof RobotsDisallowedError) return error.message;
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return `${error.name === "Error" ? "" : `${error.name}: `}${error.message}${cause}`;
  }
  return String(error);
}
