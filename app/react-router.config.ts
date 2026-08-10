import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode - all data fetching happens client-side via Convex.
  // Public marketing routes are prerendered at build time so crawlers
  // and link unfurlers see real HTML (title, meta, OG, hero copy).
  ssr: false,
  // /demo/* must be prerendered: the /* -> /index.html SPA fallback serves the
  // home document, whose hydration mismatch (React #418) kills interactivity
  // on deep links. Prerendered routes are served as real assets instead.
  prerender: [
    "/",
    "/demo",
    "/demo/join",
    "/demo/create",
    "/demo/patron",
    "/demo/host",
    "/demo/host/dashboard",
  ],
} satisfies Config;
