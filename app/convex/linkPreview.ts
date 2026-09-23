// What a pasted video link looks like before anyone clicks it — the still
// and the title for a card (docs/features/creator-media-cross-post.md).
//
// One fetcher for every table that stores a pasted link: an artifact on
// /works, an event's media, a project's media. Each keeps its own
// `mediaPreviewUrl` (+ the storage id behind it) so its read paths stay
// simple; this module is the one place that knows how to get the still.
//
// How each provider gives up a still:
//   Instagram — serves Open Graph tags to link crawlers so a reel unfurls
//               on WhatsApp and Messenger, and refuses a browser UA from a
//               server (login shell, no tags). Checked 2026-09-23: the
//               Googlebot UA answers for reels and posts; Twitterbot and
//               facebookexternalhit each answer for one of the two and 429
//               the other. So: canonical URL, crawler UAs in turn, first
//               og:image wins.
//   TikTok    — public oEmbed, no key; a short link is followed first.
//   YouTube   — img.youtube.com, derived client-side; nothing to fetch.
//   Vimeo     — nothing without a key; the player carries its own image.
// Every provider's image URL expires (Instagram `oe=`, TikTok `x-expires`),
// so the bytes are copied into Convex storage and the storage URL is what
// gets stored.

import { v } from "convex/values";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { isTikTokShortLink, toEmbedUrl } from "./videoEmbed";

export type PreviewTarget = "artifact" | "event" | "project";

export const previewTargetValidator = v.union(
  v.literal("artifact"),
  v.literal("event"),
  v.literal("project"),
);

/** True when a link is one this module can fetch a still for. YouTube and
    Vimeo are embeds too, but need nothing from the server. */
export function wantsPreviewFetch(url: string | undefined): boolean {
  if (!url) return false;
  const kind = toEmbedUrl(url)?.kind;
  return kind === "instagram" || kind === "tiktok" || isTikTokShortLink(url);
}

/**
 * Schedules the fetch for a row that just got a pasted link. Call from the
 * mutation that stored it. A no-op for links that need nothing, so callers
 * don't have to check first.
 */
export async function schedulePreviewFetch(
  ctx: MutationCtx,
  target: PreviewTarget,
  id: Id<"artifacts"> | Id<"events"> | Id<"projects">,
  url: string | undefined,
): Promise<void> {
  if (!url || !wantsPreviewFetch(url)) return;
  await ctx.scheduler.runAfter(0, internal.linkPreview.fetchPreview, { target, id, url });
}

// ————— resolving —————

export interface ResolvedPreview {
  canonicalUrl: string;
  title?: string;
  imageUrl?: string;
}

const CRAWLER_UAS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Twitterbot/1.0",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
];
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function metaContent(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]*(?:property|name)\\s*=\\s*["']${property}["'][^>]*content\\s*=\\s*["']([^"']+)["']|<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${property}["']`,
    "i",
  );
  const m = html.match(re);
  const raw = m?.[1] ?? m?.[2];
  return raw ? decodeEntities(raw) : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Instagram's og:title reads `Name on Instagram: "caption…"`. The caption's
    first line is the title a card wants; the rest is noise. */
function instagramTitle(html: string): string | undefined {
  const og = metaContent(html, "og:title") ?? "";
  const quoted = og.match(/on Instagram: "([\s\S]*)"\s*$/)?.[1] ?? og;
  const firstLine = quoted.split(/\r?\n/)[0]?.trim() ?? "";
  return firstLine ? firstLine.slice(0, 120) : undefined;
}

/** The still and title in an Instagram page as a crawler sees it, or null
    when the page is the login shell a browser UA gets. Pure, so it is
    unit-tested against a saved page (linkPreview.test.ts). */
export function parseInstagramPreview(html: string, canonicalUrl: string): ResolvedPreview | null {
  const imageUrl = metaContent(html, "og:image");
  if (!imageUrl || !/^https:\/\//.test(imageUrl)) return null;
  return { canonicalUrl, title: instagramTitle(html), imageUrl };
}

async function resolveInstagram(canonicalUrl: string): Promise<ResolvedPreview | null> {
  for (const ua of CRAWLER_UAS) {
    let res: Response;
    try {
      res = await fetch(canonicalUrl, {
        redirect: "follow",
        headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      continue;
    }
    if (!res.ok) continue; // 429 from one UA is normal; the next one answers
    const preview = parseInstagramPreview(await res.text(), canonicalUrl);
    if (preview) return preview;
  }
  return null;
}

async function resolveTikTok(url: string): Promise<ResolvedPreview | null> {
  let target = url;
  if (isTikTokShortLink(target)) {
    // vm.tiktok.com/… is a redirect the browser couldn't follow
    // cross-origin; the server can. The body is not read.
    const res = await fetch(target, {
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(10000),
    });
    target = res.url || target;
  }
  const embed = toEmbedUrl(target);
  if (embed?.kind !== "tiktok") return null;

  const res = await fetch(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(embed.canonicalUrl)}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) return { canonicalUrl: embed.canonicalUrl };
  const data = (await res.json()) as { title?: unknown; thumbnail_url?: unknown };
  // TikTok titles are the caption, hashtags and all — enough for a card,
  // clamped so a wall of tags doesn't become a project title.
  const title =
    typeof data.title === "string" ? data.title.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const imageUrl = typeof data.thumbnail_url === "string" ? data.thumbnail_url : "";
  return {
    canonicalUrl: embed.canonicalUrl,
    title: title || undefined,
    imageUrl: /^https:\/\//.test(imageUrl) ? imageUrl : undefined,
  };
}

/** The still and title for a pasted link, or null when there is nothing to
    fetch. Never throws for a provider that simply won't answer. */
export async function resolveLinkPreview(url: string): Promise<ResolvedPreview | null> {
  const embed = toEmbedUrl(url);
  if (embed?.kind === "instagram") return resolveInstagram(embed.canonicalUrl);
  if (embed?.kind === "tiktok" || isTikTokShortLink(url)) return resolveTikTok(url);
  return null;
}

// ————— the action and its apply —————

export const fetchPreview = internalAction({
  args: { target: previewTargetValidator, id: v.string(), url: v.string() },
  handler: async (ctx, args) => {
    try {
      const preview = await resolveLinkPreview(args.url);
      if (!preview) {
        console.log(`No preview for ${args.target} ${args.id}: ${args.url}`);
        return;
      }
      let imageStorageId: Id<"_storage"> | undefined;
      let imageUrl: string | undefined;
      if (preview.imageUrl) {
        const img = await fetch(preview.imageUrl, { signal: AbortSignal.timeout(15000) });
        if (img.ok) {
          imageStorageId = await ctx.storage.store(await img.blob());
          imageUrl = (await ctx.storage.getUrl(imageStorageId)) ?? undefined;
        }
      }
      await ctx.runMutation(internal.linkPreview.apply, {
        target: args.target,
        id: args.id,
        canonicalUrl: preview.canonicalUrl,
        title: preview.title,
        imageUrl,
        imageStorageId,
      });
    } catch (error) {
      console.log(`Error fetching preview for ${args.target} ${args.id} (${args.url}):`, error);
    }
  },
});

// What the fetch learned, applied to the row. A blank artifact title is
// filled from the post (and passed on to its companion project, which got
// the type's fallback title at create); a title someone typed is kept.
// Events and projects keep their own titles — only the media fields move.
export const apply = internalMutation({
  args: {
    target: previewTargetValidator,
    id: v.string(),
    canonicalUrl: v.string(),
    title: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const dropImage = async () => {
      if (args.imageStorageId) await ctx.storage.delete(args.imageStorageId);
    };
    const hasImage = !!args.imageUrl && !!args.imageStorageId;

    if (args.target === "artifact") {
      const id = ctx.db.normalizeId("artifacts", args.id);
      const artifact = id ? await ctx.db.get(id) : null;
      if (!id || !artifact) return dropImage(); // deleted mid-fetch
      const patch: Partial<Doc<"artifacts">> = {};
      if (artifact.mediaUrl !== args.canonicalUrl) patch.mediaUrl = args.canonicalUrl;
      if (hasImage) {
        if (artifact.coverStorageId && artifact.coverStorageId !== args.imageStorageId) {
          await ctx.storage.delete(artifact.coverStorageId);
        }
        patch.ogImageUrl = args.imageUrl;
        patch.coverStorageId = args.imageStorageId;
      }
      const fillTitle = !!args.title && !artifact.title?.trim();
      if (fillTitle) patch.title = args.title;
      await ctx.db.patch(id, patch);
      if (fillTitle && args.title) {
        if (artifact.projectId) {
          const project = await ctx.db.get(artifact.projectId);
          if (project && /^Untitled( video| link)?$/.test(project.title)) {
            await ctx.db.patch(project._id, { title: args.title, updatedAt: Date.now() });
          }
        }
        // It has words now — index it, as artifacts.create would have.
        await ctx.scheduler.runAfter(0, api.embeddings.embedArtifact, { artifactId: id });
      }
      return;
    }

    if (args.target === "event") {
      const id = ctx.db.normalizeId("events", args.id);
      const event = id ? await ctx.db.get(id) : null;
      if (!id || !event) return dropImage();
      const patch: Partial<Doc<"events">> = {};
      if (event.mediaUrl !== args.canonicalUrl) patch.mediaUrl = args.canonicalUrl;
      if (hasImage) {
        if (event.mediaPreviewStorageId && event.mediaPreviewStorageId !== args.imageStorageId) {
          await ctx.storage.delete(event.mediaPreviewStorageId);
        }
        patch.mediaPreviewUrl = args.imageUrl;
        patch.mediaPreviewStorageId = args.imageStorageId;
      }
      await ctx.db.patch(id, patch);
      return;
    }

    // project
    const id = ctx.db.normalizeId("projects", args.id);
    const project = id ? await ctx.db.get(id) : null;
    if (!id || !project) return dropImage();
    const patch: Partial<Doc<"projects">> = {};
    if (project.mediaUrl !== args.canonicalUrl) patch.mediaUrl = args.canonicalUrl;
    if (hasImage) {
      if (project.mediaPreviewStorageId && project.mediaPreviewStorageId !== args.imageStorageId) {
        await ctx.storage.delete(project.mediaPreviewStorageId);
      }
      patch.mediaPreviewUrl = args.imageUrl;
      patch.mediaPreviewStorageId = args.imageStorageId;
    }
    await ctx.db.patch(id, patch);
  },
});

// ————— backfill —————
//
// Reels pasted before this module existed have a player but no still. Run
// once after deploy, from the dashboard or the CLI:
//   npx convex run linkPreview:backfillArtifactPreviews
// Idempotent: a row that already has a still is skipped, and the fetch is
// scheduled a second apart so Instagram's rate limit isn't tripped.
export const backfillArtifactPreviews = internalMutation({
  args: {},
  handler: async (ctx) => {
    const artifacts = await ctx.db.query("artifacts").collect();
    let scheduled = 0;
    for (const a of artifacts) {
      if (a.ogImageUrl || !a.mediaUrl || !wantsPreviewFetch(a.mediaUrl)) continue;
      await ctx.scheduler.runAfter(scheduled * 1000, internal.linkPreview.fetchPreview, {
        target: "artifact",
        id: a._id,
        url: a.mediaUrl,
      });
      scheduled += 1;
    }
    return { scheduled };
  },
});
