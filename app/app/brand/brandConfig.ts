// The brand settings with no React in them, so the edge
// (functions/_middleware.ts) can share them. See brands.ts.

export type BrandId = "exchange" | "garden";

export const GARDEN_HOSTS = ["createthegarden.com", "thegarden.thecreative.exchange"] as const;

/** `?brand=garden` (or `exchange`) sets the brand for the rest of the tab's
 *  session — only on localhost and Pages preview hosts, which have no Garden
 *  domain. On a live address a shared link must not rebrand the site. */
export const BRAND_OVERRIDE_PARAM = "brand";
const OVERRIDE_KEY = "brand-override";
const OVERRIDE_HOSTS = /^(localhost|127\.0\.0\.1|.+\.pages\.dev)$/;

export const GARDEN = {
  communitySlug: "the-garden",
  name: "The Garden",
  tagline: "Loving our neighbors through our craft.",
  /** The mark on the dark site; on paper it's CRIMSON_PAPER. Never text. */
  crimson: "#D93A4B",
  crimsonPaper: "#A51C30",
  /** Ink for text on paper (the kit's #161826). */
  ink: "#161826",
  /** The browser's theme color: the site's own ink, so the bar matches the page. */
  themeColor: "#121212",
  icons: "/brand/garden",
  jostHref: "https://fonts.googleapis.com/css2?family=Jost:wght@500&display=swap",
} as const;

/** "WWW.CreateTheGarden.com:443" → "createthegarden.com". */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().split(":")[0].replace(/^www\./, "");
}

export function brandForHost(host: string): BrandId {
  return (GARDEN_HOSTS as readonly string[]).includes(normalizeHost(host)) ? "garden" : "exchange";
}

/** Words for a Garden domain: "Sign In - TheCreative.exchange" reads "Sign In
 *  - The Garden", and a title that comes out as "The Garden — The Garden" (The
 *  Garden's own page) is just "The Garden". Addresses are lowercase and
 *  untouched. */
export function gardenText(text: string): string {
  const swapped = text.replace(/TheCreative\.exchange/g, GARDEN.name);
  const twice = new RegExp(`^${GARDEN.name}\\s*[—–|·-]\\s*${GARDEN.name}$`);
  return twice.test(swapped.trim()) ? GARDEN.name : swapped;
}

/** Where `?brand=` is honored. */
export function allowsBrandOverride(host: string): boolean {
  return OVERRIDE_HOSTS.test(normalizeHost(host));
}

/** Runs in <head> before first paint. Self-contained: it can't import, so the
 *  values above are written into it. On a live Garden domain the edge has
 *  already done most of this (gardenHtml.ts); it adds only what's missing.
 *  It never touches the icon links, which React owns: the edge answers their
 *  usual addresses with The Garden's files instead. */
export const BRAND_BOOT = `(function(){try{
var hosts=${JSON.stringify(GARDEN_HOSTS)};
var h=location.hostname.toLowerCase().replace(/^www\\./,"");
var b=hosts.indexOf(h)>=0?"garden":"exchange";
if(${OVERRIDE_HOSTS}.test(h)){var q=new URLSearchParams(location.search).get(${JSON.stringify(BRAND_OVERRIDE_PARAM)});
try{if(q==="garden"||q==="exchange")sessionStorage.setItem(${JSON.stringify(OVERRIDE_KEY)},q);var o=sessionStorage.getItem(${JSON.stringify(OVERRIDE_KEY)});if(o==="garden"||o==="exchange")b=o;}catch(e){}}
document.documentElement.setAttribute("data-brand",b);
if(b!=="garden")return;
var p=${JSON.stringify(GARDEN.icons)};
var add=function(rel,href){if(document.querySelector('link[rel="'+rel+'"][href="'+href+'"]'))return;var l=document.createElement("link");l.rel=rel;l.href=href;document.head.appendChild(l);};
if(!document.querySelector('link[rel="manifest"]'))add("manifest",p+"/site.webmanifest");
add("stylesheet",${JSON.stringify(GARDEN.jostHref)});
var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m);}m.content=${JSON.stringify(GARDEN.themeColor)};
}catch(e){}})();`;
