// Slugs the client needs by name. Each mirrors a constant in convex/; the
// client never imports convex server modules (they pull in server-only code
// the browser can't load), so the value is copied here and must change with it.

/** The Garden's slug. Mirrors convex/garden/defaultCommunity.ts
 *  DEFAULT_COMMUNITY_SLUG. */
export const GARDEN_SLUG = "the-garden";
