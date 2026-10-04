import type { Config } from "@react-router/dev/config";
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
    "/demo/offers",
    "/demo/app",
    // Audience pages are handed out and shared as links, so each one needs
    // real HTML with its own title/description/OG tags. Keep this list in
    // step with AUDIENCES in routes/for.$audience.tsx.
    "/for/creatives",
    "/for/hosts",
    "/for/patrons",
    "/for/churches",
    "/for/donors",
    "/for/partners",
    // Public browse — prerendered for its own title/description/OG tags; the
    // postings themselves load client-side from Convex after hydration.
    "/opportunities",
    // The open call is the landing page for paid and organic social, so it
    // needs real HTML for link unfurls (the OG image is the hero drawing).
    // The application form hydrates and posts to Convex after load.
    "/showcase",
    "/grant-program",
    "/legal/credits",
    // Static page; real HTML for when it is eventually linked (noindex until then).
    "/pricing",
  ],
  // Deep links must hydrate the SPA shell, not the prerendered home page.
  // Cloudflare Pages only treats exactly "/* /index.html 200" as an SPA
  // fallback that yields to real files (any other target runs before them
  // and loops or shadows /assets — commit 7866a75), so the fallback has to
  // BE index.html. After prerendering: the home document moves to
  // __home.html and is served at "/" by a rule added here (only when the
  // move happened), and the shell React Router built for every other path
  // becomes index.html. Before this, every deep link hydrated the home
  // markup and threw React #418 (2026-10-03).
  async buildEnd({ reactRouterConfig }) {
    const client = join(reactRouterConfig.buildDirectory, "client");
    const shell = join(client, "__spa-fallback.html");
    const index = join(client, "index.html");
    if (!existsSync(shell) || !existsSync(index)) return;
    renameSync(index, join(client, "__home.html"));
    copyFileSync(shell, index);
    const redirects = join(client, "_redirects");
    const rules = existsSync(redirects) ? readFileSync(redirects, "utf8") : "";
    writeFileSync(redirects, `/ /__home 200\n${rules}`);
  },
} satisfies Config;
