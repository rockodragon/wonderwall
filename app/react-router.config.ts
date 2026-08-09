import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode - all data fetching happens client-side via Convex.
  // Public marketing routes are prerendered at build time so crawlers
  // and link unfurlers see real HTML (title, meta, OG, hero copy).
  ssr: false,
  prerender: ["/"],
} satisfies Config;
