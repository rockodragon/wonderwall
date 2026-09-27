// Pure HTML parsing for an ordinary website's link preview (title, blurb,
// cover image). Split out from convex/artifacts.ts so it can be unit-tested
// against a raw HTML string without touching Convex's fetch/action runtime.
//
// Covers the fallback chain a plain website needs that convex/linkPreview.ts
// doesn't: og:image → og:image:secure_url → twitter:image → a large
// apple-touch-icon/icon link, og:title → <title>, and og:description. Image
// URLs are resolved against the page's *final* URL (after redirects), since
// a relative og:image is relative to where the page actually lives, not the
// link someone pasted.

// A double-quoted value and a single-quoted one are separate branches, so an
// apostrophe or stray quote inside the other kind of quote doesn't end the
// match early.
const ATTR_VALUE = `(?:"([^"]*)"|'([^']*)')`;

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** A <meta> tag's content, matched with property/content in either order —
    real-world markup writes both — for a `property` or `name` value. */
function metaContent(html: string, key: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*${ATTR_VALUE}|<meta[^>]*content\\s*=\\s*${ATTR_VALUE}[^>]*(?:property|name)\\s*=\\s*["']${key}["']`,
    "i",
  );
  const m = html.match(re);
  const raw = m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4];
  return raw ? decodeEntities(raw).trim() || undefined : undefined;
}

/** All `<link rel="...">` hrefs for a rel value that can repeat (icons come
    in several sizes; the caller picks). */
function linkHrefs(html: string, rel: string): string[] {
  const re = new RegExp(
    `<link[^>]*rel\\s*=\\s*["'][^"']*\\b${rel}\\b[^"']*["'][^>]*href\\s*=\\s*${ATTR_VALUE}|<link[^>]*href\\s*=\\s*${ATTR_VALUE}[^>]*rel\\s*=\\s*["'][^"']*\\b${rel}\\b[^"']*["']`,
    "gi",
  );
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (raw) out.push(decodeEntities(raw));
  }
  return out;
}

function titleTag(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  const text = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
  return text || undefined;
}

/** Resolve a possibly-relative URL (protocol-relative, root-relative, or
    bare) against the page's own final URL. Returns undefined for anything
    that isn't a plain http(s) URL once resolved (never `javascript:`/`data:`
    passed through into an <img src>). */
export function resolveAgainst(raw: string | undefined, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:")) return undefined;
  try {
    const resolved = new URL(trimmed, baseUrl);
    return resolved.protocol === "https:" || resolved.protocol === "http:"
      ? resolved.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export interface ParsedOgMeta {
  title?: string;
  description?: string;
  imageUrl?: string;
}

/**
 * The site's own title/description/cover from its HTML `<head>`, or as much
 * of it as the page offers. `baseUrl` should be the URL the response was
 * actually served from (`response.url`, after redirects) so a relative
 * og:image resolves to the right host. Pure — unit-tested in ogParse.test.ts
 * against saved page heads.
 */
export function parseOgMeta(html: string, baseUrl: string): ParsedOgMeta {
  const rawImage =
    metaContent(html, "og:image:secure_url") ??
    metaContent(html, "og:image") ??
    metaContent(html, "og:image:url") ??
    metaContent(html, "twitter:image") ??
    linkHrefs(html, "apple-touch-icon")[0] ??
    linkHrefs(html, "icon").sort((a, b) => b.length - a.length)[0];

  const title = metaContent(html, "og:title") ?? titleTag(html);
  const description = metaContent(html, "og:description") ?? metaContent(html, "description");

  return {
    title,
    description,
    imageUrl: resolveAgainst(rawImage, baseUrl),
  };
}
