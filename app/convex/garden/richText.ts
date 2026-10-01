// Rich content — the block document behind project descriptions and project
// updates (docs/features/rich-project-content.md).
//
// WHY BLOCKS AND NOT HTML OR MARKDOWN
//
// A project page has to carry headings, emphasis, links, images and video
// embeds, posted by creatives who are not writing code. Two obvious routes
// were both worse:
//
//   Stored HTML — means a sanitizer on every read, forever, and one missed
//   attribute is a stored-XSS hole on a page strangers visit.
//   Stored Markdown — means shipping a parser's whole surface (raw HTML
//   passthrough, reference links, autolinks) to get four features, and it
//   still has no way to say "this is a YouTube embed".
//
// So content is a typed array of blocks with a closed union of types, and
// the renderer is a switch over that union. Nothing arbitrary can be stored,
// which means nothing arbitrary can be rendered — the safety property holds
// at rest, not at display time. Inline emphasis inside a text block is the
// one place a mini-syntax survives (`**bold**`, `*italic*`, `[a](url)`),
// tokenized by parseInline below into a flat token list the renderer maps to
// <strong>/<em>/<a>. The editor writes those markers for the author via a
// format bar, so nobody types them by hand unless they want to.
//
// This module is the SINGLE source of truth for both sides — server
// validation and client rendering/editing — re-exported to the app through
// app/app/lib/richText.ts, the same shim convention app/app/garden/
// capabilities.ts already uses. Everything here is pure except
// resolveRichDocMedia, which takes storage as a duck-typed argument rather
// than importing Convex server bindings, so the client can still import the
// module without pulling them in.

import { ConvexError, v } from "convex/values";

// ——————————————————————————————————————————————————————————————
// Types
// ——————————————————————————————————————————————————————————————

export type RichBlock =
  | { type: "heading"; text: string; level?: number }
  | { type: "text"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "image"; url?: string; storageId?: string; alt?: string; caption?: string }
  | { type: "video"; url?: string; storageId?: string; caption?: string }
  | { type: "divider" };

export type RichBlockType = RichBlock["type"];

/** What a read path hands the renderer: the stored block plus, for media,
    the URL the storageId resolved to. Kept as a separate type so nothing can
    accidentally write a resolved URL back into the database. */
export type ResolvedRichBlock = RichBlock & { resolvedUrl?: string | null };

export type RichDoc = RichBlock[];

// ——————————————————————————————————————————————————————————————
// Convex validator
// ——————————————————————————————————————————————————————————————

// Kept structurally identical to RichBlock above. Storage ids are v.string()
// rather than v.id("_storage") on purpose: the same validator describes rows
// written before a file was attached and, more importantly, lets this module
// stay free of a generated dataModel import so the client shim can re-export
// it. The ids are only ever handed back to ctx.storage.getUrl, which returns
// null for anything that isn't a real file.
export const richBlockValidator = v.union(
  v.object({ type: v.literal("heading"), text: v.string(), level: v.optional(v.number()) }),
  v.object({ type: v.literal("text"), text: v.string() }),
  v.object({ type: v.literal("quote"), text: v.string() }),
  v.object({
    type: v.literal("list"),
    items: v.array(v.string()),
    ordered: v.optional(v.boolean()),
  }),
  v.object({
    type: v.literal("image"),
    url: v.optional(v.string()),
    storageId: v.optional(v.string()),
    alt: v.optional(v.string()),
    caption: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("video"),
    url: v.optional(v.string()),
    storageId: v.optional(v.string()),
    caption: v.optional(v.string()),
  }),
  v.object({ type: v.literal("divider") }),
);

export const richDocValidator = v.array(richBlockValidator);

// ——————————————————————————————————————————————————————————————
// Limits
// ——————————————————————————————————————————————————————————————

// Generous enough that no honest project page hits them, tight enough that a
// single row can't become a denial-of-service on every reader of the page.
export const RICH_LIMITS = {
  blocks: 120,
  headingChars: 200,
  textChars: 5000,
  quoteChars: 2000,
  listItems: 50,
  listItemChars: 500,
  captionChars: 300,
  altChars: 300,
  docChars: 60000,
} as const;

// ——————————————————————————————————————————————————————————————
// URL safety
// ——————————————————————————————————————————————————————————————

/**
 * http(s) only. `javascript:` and `data:` parse as perfectly valid URLs, so
 * the scheme check — not the parse — is what keeps them out of an href or a
 * src. Same reasoning as app/app/lib/videoEmbed.ts, which deliberately makes
 * the same check for the same reason.
 */
export function isSafeHttpUrl(raw: string | undefined | null): boolean {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Adds https:// to a bare host the author pasted ("vimeo.com/123"), so the
    safety check below judges what they meant rather than failing them for a
    missing scheme. Anything that already carries a scheme is left alone —
    including a bad one, which then fails isSafeHttpUrl as it should. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// ——————————————————————————————————————————————————————————————
// Inline marks
// ——————————————————————————————————————————————————————————————

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "link"; text: string; href: string };

// `**bold**` is listed first so it wins at a position where `*italic*` would
// also match. Marks are deliberately flat — no nesting, no bold-inside-link.
// A project page does not need a nested-mark parser, and every one of those
// is a source of pathological backtracking on hostile input.
const INLINE_PATTERN = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/**
 * Splits a text block into renderable tokens. A link whose URL isn't http(s)
 * degrades to its literal source text rather than being dropped: the author
 * still sees what they typed, and nothing unsafe reaches an href.
 */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;

  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: "text", text: text.slice(cursor, match.index) });
    }
    const [whole, bold, italic, linkText, linkHref] = match;
    if (bold !== undefined) {
      tokens.push({ kind: "bold", text: bold });
    } else if (italic !== undefined) {
      tokens.push({ kind: "italic", text: italic });
    } else if (linkText !== undefined && linkHref !== undefined) {
      const href = normalizeUrl(linkHref);
      if (isSafeHttpUrl(href)) {
        tokens.push({ kind: "link", text: linkText, href });
      } else {
        tokens.push({ kind: "text", text: whole });
      }
    }
    cursor = match.index + whole.length;
  }

  if (cursor < text.length) {
    tokens.push({ kind: "text", text: text.slice(cursor) });
  }
  return tokens;
}

/** The same text with its markers removed — what a notification body, a meta
    description or a list-card excerpt should show. */
export function stripInlineMarks(text: string): string {
  return parseInline(text)
    .map((t) => t.text)
    .join("");
}

// ——————————————————————————————————————————————————————————————
// Plain text
// ——————————————————————————————————————————————————————————————

/**
 * A readable plain-text rendering of a whole document. Used for the
 * `storyUpdates.body` column (which stays the canonical plain summary that
 * notifications and legacy readers use), for excerpts, and for search.
 */
export function richDocPlainText(blocks: RichDoc | undefined | null): string {
  if (!blocks?.length) return "";
  const lines: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
      case "text":
      case "quote":
        lines.push(stripInlineMarks(block.text));
        break;
      case "list":
        for (const item of block.items) lines.push(stripInlineMarks(item));
        break;
      case "image":
      case "video":
        if (block.caption) lines.push(stripInlineMarks(block.caption));
        break;
      case "divider":
        break;
    }
  }
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** First `max` characters of the plain text, ellipsised on a word boundary. */
export function richDocExcerpt(blocks: RichDoc | undefined | null, max = 200): string {
  const text = richDocPlainText(blocks).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/** True when a document has nothing a reader would see. An array of empty
    text blocks is not content, and neither is a lone divider. */
export function isRichDocEmpty(blocks: RichDoc | undefined | null): boolean {
  return normalizeBlocks(blocks ?? []).length === 0;
}

// ——————————————————————————————————————————————————————————————
// Normalization + validation
// ——————————————————————————————————————————————————————————————

function clamp(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function reject(reason: string): never {
  throw new ConvexError({ code: "invalid_content", reason });
}

/**
 * Trims every block, drops the ones with nothing in them, and clamps text to
 * the per-block limits. Pure and total — it never throws, so the editor can
 * call it on every keystroke to decide whether "Save" is live. The throwing
 * checks (block count, whole-document size, unsafe URLs) live in
 * normalizeRichDoc below, which is what mutations call.
 */
export function normalizeBlocks(blocks: RichDoc): RichDoc {
  const out: RichDoc = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const text = clamp(block.text.trim(), RICH_LIMITS.headingChars);
        // Only two levels exist. h1 is the project title, which the page
        // owns; anything an author picks is a section or a sub-section.
        const level = block.level === 3 ? 3 : 2;
        if (text) out.push({ type: "heading", text, level });
        break;
      }
      case "text": {
        // Interior blank lines are the author's paragraph breaks and are
        // preserved; only the block's own leading/trailing space goes.
        const text = clamp(block.text.replace(/^\s+|\s+$/g, ""), RICH_LIMITS.textChars);
        if (text) out.push({ type: "text", text });
        break;
      }
      case "quote": {
        const text = clamp(block.text.trim(), RICH_LIMITS.quoteChars);
        if (text) out.push({ type: "quote", text });
        break;
      }
      case "list": {
        const items = block.items
          .map((i) => clamp(i.trim(), RICH_LIMITS.listItemChars))
          .filter(Boolean)
          .slice(0, RICH_LIMITS.listItems);
        if (items.length) {
          out.push(block.ordered ? { type: "list", items, ordered: true } : { type: "list", items });
        }
        break;
      }
      case "image": {
        const url = block.url ? normalizeUrl(block.url) : undefined;
        if (!url && !block.storageId) break;
        const next: RichBlock = { type: "image" };
        if (url) next.url = url;
        if (block.storageId) next.storageId = block.storageId;
        const alt = clamp((block.alt ?? "").trim(), RICH_LIMITS.altChars);
        if (alt) next.alt = alt;
        const caption = clamp((block.caption ?? "").trim(), RICH_LIMITS.captionChars);
        if (caption) next.caption = caption;
        out.push(next);
        break;
      }
      case "video": {
        const url = block.url ? normalizeUrl(block.url) : undefined;
        if (!url && !block.storageId) break;
        const next: RichBlock = { type: "video" };
        if (url) next.url = url;
        if (block.storageId) next.storageId = block.storageId;
        const caption = clamp((block.caption ?? "").trim(), RICH_LIMITS.captionChars);
        if (caption) next.caption = caption;
        out.push(next);
        break;
      }
      case "divider":
        // A divider between nothing and nothing is noise. One that would
        // lead or follow the document is dropped below.
        out.push({ type: "divider" });
        break;
    }
  }

  // Dividers can't lead, trail, or double up — an author dragging blocks
  // around produces all three, and each one renders as a stray rule.
  const trimmed: RichDoc = [];
  for (const block of out) {
    if (block.type !== "divider") {
      trimmed.push(block);
      continue;
    }
    if (trimmed.length === 0) continue;
    if (trimmed[trimmed.length - 1].type === "divider") continue;
    trimmed.push(block);
  }
  while (trimmed.length && trimmed[trimmed.length - 1].type === "divider") trimmed.pop();

  return trimmed;
}

/**
 * What every mutation that accepts rich content calls. Normalizes as above,
 * then enforces the limits that are worth refusing a save over — too many
 * blocks, too much total text, a URL that isn't http(s). Returns undefined
 * for a document with no content, so a caller can store `undefined` rather
 * than an empty array.
 */
export function normalizeRichDoc(blocks: RichDoc | undefined): RichDoc | undefined {
  if (!blocks) return undefined;
  if (blocks.length > RICH_LIMITS.blocks) {
    reject(`That's more than ${RICH_LIMITS.blocks} blocks — try splitting it into an update.`);
  }

  const normalized = normalizeBlocks(blocks);
  if (normalized.length === 0) return undefined;

  for (const block of normalized) {
    if (block.type === "image" && block.url && !isSafeHttpUrl(block.url)) {
      reject("An image link has to be a normal http:// or https:// web address.");
    }
    if (block.type === "video" && block.url && !isSafeHttpUrl(block.url)) {
      reject("A video link has to be a normal http:// or https:// web address.");
    }
  }

  const total = richDocPlainText(normalized).length;
  if (total > RICH_LIMITS.docChars) {
    reject("That's a lot of words for one page — try moving some into an update.");
  }

  return normalized;
}

// ——————————————————————————————————————————————————————————————
// Uploaded media
// ——————————————————————————————————————————————————————————————

/** Every Convex file id a document references, deduped. */
export function collectStorageIds(blocks: RichDoc | undefined | null): string[] {
  const ids = new Set<string>();
  for (const block of blocks ?? []) {
    if ((block.type === "image" || block.type === "video") && block.storageId) {
      ids.add(block.storageId);
    }
  }
  return [...ids];
}

/** Files the OLD document referenced that the NEW one no longer does — the
    uploads to delete when a save replaces a document, so an author who
    swaps a photo ten times doesn't leave ten files behind. */
export function orphanedStorageIds(
  previous: RichDoc | undefined | null,
  next: RichDoc | undefined | null,
): string[] {
  const kept = new Set(collectStorageIds(next));
  return collectStorageIds(previous).filter((id) => !kept.has(id));
}

/**
 * Attaches `resolvedUrl` to each media block. Takes `storage` duck-typed so
 * this module never imports Convex server bindings (see the header) — call
 * sites pass `ctx.storage`.
 */
export async function resolveRichDocMedia(
  storage: { getUrl: (id: any) => Promise<string | null> },
  blocks: RichDoc | undefined | null,
): Promise<ResolvedRichBlock[] | undefined> {
  if (!blocks?.length) return undefined;
  return await Promise.all(
    blocks.map(async (block): Promise<ResolvedRichBlock> => {
      if (block.type !== "image" && block.type !== "video") return block;
      if (!block.storageId) return { ...block, resolvedUrl: block.url ?? null };
      let resolved: string | null = null;
      try {
        resolved = await storage.getUrl(block.storageId);
      } catch {
        // A file that has been deleted out from under the document — the
        // block renders as a quiet gap rather than a broken image.
        resolved = null;
      }
      return { ...block, resolvedUrl: resolved ?? block.url ?? null };
    }),
  );
}

/** Drops `resolvedUrl` before a document goes back to the server. The
    validator rejects unknown fields, so the editor must strip what a read
    path added. */
export function toStoredDoc(blocks: ResolvedRichBlock[] | undefined | null): RichDoc {
  return (blocks ?? []).map((block) => {
    if (block.type !== "image" && block.type !== "video") return block;
    const { resolvedUrl: _drop, ...stored } = block as ResolvedRichBlock & { resolvedUrl?: unknown };
    return stored as RichBlock;
  });
}
