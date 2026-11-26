/**
 * Same-origin company logo proxy: logo.dev (when LOGO_DEV_TOKEN is set, server-side only) → Google favicon.
 * Missing / default / low-res (< 32 px) icons return a 1×1 transparent PNG (200), which the client turns into a
 * monogram — so the browser never logs 404s and blurry favicons never reach the UI. Responses are cached.
 */
const TRANSPARENT_PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MIN_WIDTH = 32;
const MAX_ENTRIES = 3000;

interface CachedLogo {
  body: Uint8Array;
  type: string;
  source: string;
}

const memory = new Map<string, CachedLogo>();

function pngWidth(buf: Uint8Array): number | null {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(16);
}

async function fetchImage(url: string): Promise<{ body: Uint8Array; type: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
      headers: { "user-agent": "EasyJobsWeb/1.0 (logo proxy)" },
      next: { revalidate: 604_800 },
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    // Raster only: never serve third-party SVG from our origin.
    if (!/^image\/(png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon)$/.test(type)) return null;
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.byteLength === 0 || body.byteLength > 512_000) return null;
    return { body, type };
  } catch {
    return null;
  }
}

async function resolveLogo(domain: string): Promise<CachedLogo> {
  const token = process.env.LOGO_DEV_TOKEN?.trim();
  if (token) {
    const img = await fetchImage(`https://img.logo.dev/${domain}?token=${encodeURIComponent(token)}&size=128&format=png&fallback=404`);
    if (img) return { ...img, source: "logo.dev" };
  }
  const favicon = await fetchImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
  if (favicon) {
    const width = pngWidth(favicon.body);
    if (width === null || width >= MIN_WIDTH) return { ...favicon, source: "favicon" };
  }
  return { body: TRANSPARENT_PNG, type: "image/png", source: "none" };
}

export async function GET(_request: Request, { params }: { params: Promise<{ domain: string }> }): Promise<Response> {
  const domain = decodeURIComponent((await params).domain).trim().toLowerCase().replace(/^www\./, "");
  let logo: CachedLogo;
  if (!DOMAIN_RE.test(domain)) logo = { body: TRANSPARENT_PNG, type: "image/png", source: "invalid" };
  else {
    const cached = memory.get(domain);
    logo = cached ?? (await resolveLogo(domain));
    if (!cached) {
      if (memory.size >= MAX_ENTRIES) memory.delete(memory.keys().next().value ?? "");
      memory.set(domain, logo);
    }
  }
  return new Response(logo.body.slice().buffer, {
    headers: {
      "content-type": logo.type,
      "cache-control": logo.source === "none" || logo.source === "invalid" ? "public, max-age=3600" : "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
      "x-logo-source": logo.source,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
