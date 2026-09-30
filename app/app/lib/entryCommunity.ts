// Which community a visitor came in for — the page's domain (createsd.org,
// thegardensd.org) and any ?community=<slug> link. The server decides what
// they map to (convex/garden/communityDomains.ts); thecreative.exchange and
// localhost map to none.
export function entryCommunityArgs(): { host?: string; communitySlug?: string } {
  if (typeof window === "undefined") return {};
  const slug = new URLSearchParams(window.location.search).get("community") ?? undefined;
  return { host: window.location.hostname, ...(slug ? { communitySlug: slug } : {}) };
}
