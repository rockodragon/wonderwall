// The Garden's own web addresses, and what follows from someone being on one
// (docs/features/garden-brand-domains.md). Shared by the backend (sign-in
// return addresses, the name in sign-in codes) and the site (the brand,
// app/app/brand/brandConfig.ts, and the edge). Plain functions, no Convex
// imports, so the edge can bundle it.
//
// garden.thecreative.exchange is the live one for now (Rick, 2026-10-03);
// createthegarden.com once Rick has it. hostOrgs.domains for the-garden
// (communityDomains.ts) should list the same.

export const GARDEN_HOSTS = [
  "garden.thecreative.exchange",
  "thegarden.thecreative.exchange",
  "createthegarden.com",
] as const;

export const GARDEN_NAME = "The Garden";
export const PLATFORM_NAME = "TheCreative.exchange";

/** "WWW.CreateTheGarden.com:443" → "createthegarden.com". */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().split(":")[0].replace(/^www\./, "");
}

export function isGardenHost(host: string): boolean {
  return (GARDEN_HOSTS as readonly string[]).includes(normalizeHost(host));
}

/** The name a sign-in code goes out under: The Garden for someone on one of
 *  its addresses, TheCreative.exchange otherwise. `url` is where the person
 *  will land (Convex Auth's redirect for the code), so its host is the one
 *  they asked from. */
export function siteNameForUrl(url: string | undefined): string {
  if (!url) return PLATFORM_NAME;
  try {
    return isGardenHost(new URL(url).hostname) ? GARDEN_NAME : PLATFORM_NAME;
  } catch {
    return PLATFORM_NAME;
  }
}

/** Where Convex Auth may send someone after Google, or name in a code's link:
 *  a path (on SITE_URL), SITE_URL itself, or one of The Garden's addresses
 *  over https. Anything else is refused, as the library's own check does:
 *  an open return address would hand sign-in codes to any site. */
export function allowedAuthRedirect(redirectTo: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) return `${base}${redirectTo}`;
  if (startsWithOrigin(redirectTo, base)) return redirectTo;
  for (const host of GARDEN_HOSTS) {
    if (startsWithOrigin(redirectTo, `https://${host}`)) return redirectTo;
  }
  throw new Error(`Invalid \`redirectTo\` ${redirectTo} for configured SITE_URL: ${base}`);
}

function startsWithOrigin(url: string, origin: string): boolean {
  if (!url.startsWith(origin)) return false;
  const after = url[origin.length];
  return after === undefined || after === "?" || after === "/";
}
