/**
 * Request bodies with hard size limits, optional gzip/deflate/br (Content-Encoding) and a cap on the
 * decompressed size (zip bombs).
 */
import { promisify } from "node:util";
import { brotliDecompress, gunzip, inflate } from "node:zlib";
import type { Context } from "hono";
import { HttpError } from "./http";

const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);
const brotliAsync = promisify(brotliDecompress);

async function readLimited(c: Context, maxBytes: number): Promise<Buffer> {
  const declared = Number(c.req.header("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "payload_too_large", `Body exceeds ${maxBytes} bytes`);
  }
  const stream = c.req.raw.body;
  if (!stream) return Buffer.alloc(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "payload_too_large", `Body exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(c: Context, maxBytes: number, maxInflatedBytes: number): Promise<unknown> {
  const raw = await readLimited(c, maxBytes);
  const encoding = (c.req.header("content-encoding") ?? "identity").trim().toLowerCase();
  let buf: Buffer;
  try {
    const opts = { maxOutputLength: maxInflatedBytes };
    if (encoding === "gzip" || encoding === "x-gzip") buf = await gunzipAsync(raw, opts);
    else if (encoding === "deflate") buf = await inflateAsync(raw, opts);
    else if (encoding === "br") buf = await brotliAsync(raw, opts);
    else if (encoding === "identity" || encoding === "") buf = raw;
    else throw new HttpError(415, "unsupported_encoding", `Unsupported Content-Encoding: ${encoding}`);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ERR_BUFFER_TOO_LARGE" || /too large|maxOutputLength/i.test(String((e as Error).message))) {
      throw new HttpError(413, "payload_too_large", `Decompressed body exceeds ${maxInflatedBytes} bytes`);
    }
    throw new HttpError(400, "bad_encoding", `Could not decode ${encoding} body: ${(e as Error).message}`);
  }
  if (buf.length === 0) throw new HttpError(400, "invalid_json", "Request body is empty");
  try {
    return JSON.parse(buf.toString("utf8")) as unknown;
  } catch (e) {
    throw new HttpError(400, "invalid_json", `Body is not valid JSON: ${(e as Error).message}`);
  }
}
