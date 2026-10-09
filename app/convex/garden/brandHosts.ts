// The Garden's own web addresses, and what follows from someone being on one
// (docs/features/garden-brand-domains.md). Shared by the backend (sign-in
// return addresses, the name in sign-in codes) and the site (the brand,
// app/app/brand/brandConfig.ts, and the edge). Plain functions, no Convex
// imports, so the edge can bundle it.
//
// Every address here is also a place sign-in may hand a one-time code to
// (allowedAuthRedirect), so list only addresses Rick controls that point at
// the site. garden.thecreative.exchange came first (Rick, 2026-10-03);
// createthegarden.com joined 2026-10-08, once its DNS was on Rick's
// Cloudflare and pointed at the Pages project. hostOrgs.domains for
// the-garden (communityDomains.ts) should list the same.

import { PLATFORM_NAME } from "../email/sender";

export { PLATFORM_NAME };

export const GARDEN_HOSTS = [
  "garden.thecreative.exchange",
  "thegarden.thecreative.exchange",
  "createthegarden.com",
] as const;

export const GARDEN_NAME = "The Garden";

/** "WWW.CreateTheGarden.com:443" or "https://x.org/path" → the bare host.
 *  Empty for anything unusable. */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  let h = host.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

/** One of The Garden's addresses, with or without www. */
export function isGardenHost(host: string): boolean {
  return (GARDEN_HOSTS as readonly string[]).includes(normalizeHost(host));
}

/** The Garden, when `url` (where a sign-in code's link would land: the page
 *  it was asked from) is on one of its addresses; nothing otherwise. */
export function gardenNameForUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return isGardenHost(new URL(url).hostname) ? GARDEN_NAME : undefined;
  } catch {
    return undefined;
  }
}

/** The name a sign-in code goes out under: The Garden for someone on one of
 *  its addresses, TheCreative.exchange otherwise. */
export function siteNameForUrl(url: string | undefined): string {
  return gardenNameForUrl(url) ?? PLATFORM_NAME;
}

/** Where Convex Auth may send someone after Google, or name in a code's link:
 *  a path (on SITE_URL), SITE_URL itself, or one of The Garden's addresses
 *  (www or not) over https. Anything else is refused, as the library's own
 *  check does: an open return address would hand sign-in codes to any site. */
export function allowedAuthRedirect(redirectTo: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) return `${base}${redirectTo}`;
  if (startsWithOrigin(redirectTo, base)) return redirectTo;
  for (const host of GARDEN_HOSTS) {
    if (startsWithOrigin(redirectTo, `https://${host}`) || startsWithOrigin(redirectTo, `https://www.${host}`)) {
      return redirectTo;
    }
  }
  throw new Error(`Invalid \`redirectTo\` ${redirectTo} for configured SITE_URL: ${base}`);
}

function startsWithOrigin(url: string, origin: string): boolean {
  if (!url.startsWith(origin)) return false;
  const after = url[origin.length];
  return after === undefined || after === "?" || after === "/";
}
