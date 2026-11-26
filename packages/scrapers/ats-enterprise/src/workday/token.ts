export interface WorkdaySite {
  /** e.g. "nvidia.wd5.myworkdayjobs.com" */
  host: string;
  tenant: string;
  /** Career site id, e.g. "NVIDIAExternalCareerSite" */
  site: string;
  /** Locale segment from the token, if any ("en-US"). */
  locale: string | null;
  /** https://{host}/wday/cxs/{tenant}/{site} */
  apiBase: string;
  /** Public career-site base that externalPath values are appended to. */
  publicBase: string;
}

const LOCALE = /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/;

/**
 * Registry token (§0.6) → Workday site. Accepts
 *   https://{tenant}.wd{N}.myworkdayjobs.com[/{locale}]/{site}[/…]
 *   https://wd{N}.myworkdaysite.com[/{locale}]/recruiting/{tenant}/{site}[/…]
 */
export function parseWorkdayToken(token: string): WorkdaySite {
  let url: URL;
  try {
    url = new URL(token.trim());
  } catch {
    throw new Error(`workday: token is not a URL: "${token}"`);
  }
  const host = url.host.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let locale: string | null = null;
  if (segments[0] && LOCALE.test(segments[0]) && segments.length > 1) locale = segments.shift() ?? null;

  if (host.endsWith(".myworkdaysite.com") || host === "myworkdaysite.com") {
    const i = segments.indexOf("recruiting");
    const tenant = i >= 0 ? segments[i + 1] : undefined;
    const site = i >= 0 ? segments[i + 2] : undefined;
    if (!tenant || !site) throw new Error(`workday: expected /recruiting/{tenant}/{site} in "${token}"`);
    return {
      host,
      tenant,
      site,
      locale,
      apiBase: `https://${host}/wday/cxs/${tenant}/${site}`,
      publicBase: `https://${host}/recruiting/${tenant}/${site}`,
    };
  }

  if (!/\.myworkdayjobs(?:-impl)?\.com$/.test(host)) throw new Error(`workday: not a myworkdayjobs.com URL: "${token}"`);
  const tenant = host.split(".")[0] ?? "";
  const site = segments[0];
  if (!tenant || !site) throw new Error(`workday: token must include the career site path: "${token}"`);
  return {
    host,
    tenant,
    site,
    locale,
    apiBase: `https://${host}/wday/cxs/${tenant}/${site}`,
    publicBase: `https://${host}/${site}`,
  };
}
