// Pointing people at a creative's public page: the share kit on your own
// profile (components/ProfileShareKit.tsx) and the card other sites frame
// (functions/embed/[handle].ts). The addresses with where-from tags, the
// snippets to paste into a website, and which works to show. Pure: the edge
// bundles it.
//
// ?ref= says where a visit came from. PostHog records the address of every
// page view, so the tag shows up there with nothing else to set up.
//
// What is shared from a Garden domain says The Garden and points at The
// Garden's address (ShareSite); from anywhere else, TheCreative.exchange.

import { profilePath } from "../../convex/handleRules";
import { convexFileKey } from "../../convex/images";
import { GARDEN, GARDEN_ORIGIN, PLATFORM_NAME, type BrandId } from "../brand/brandConfig";
import { SITE_ORIGIN } from "./eventCalendar";
import { shownTitle } from "./placeholderTitle";
import { publicProfileUrl } from "./profileHead";
import { escapeHtml } from "./shareHead";

/** Where a link to the profile was put: Instagram bio, Linktree, your own
 *  website, the QR code, the story image, the badge, the embed. */
export type ShareRef = "ig" | "linktree" | "site" | "qr" | "story" | "badge" | "embed";

/** What a creative did in the share kit, for PostHog's `profile_share`. */
export type ShareKind = "copy_link" | "qr_png" | "qr_svg" | "story" | "badge" | "embed";

/** Where a share points and the name it goes by. */
export interface ShareSite {
  brand: BrandId;
  name: string;
  origin: string;
}

/** The Garden's name and address on a Garden domain (brandForHost /
 *  useBrand), TheCreative.exchange's everywhere else. */
export function shareSite(brand: BrandId): ShareSite {
  return brand === "garden"
    ? { brand, name: GARDEN.name, origin: GARDEN_ORIGIN }
    : { brand, name: PLATFORM_NAME, origin: SITE_ORIGIN };
}

const EXCHANGE = shareSite("exchange");

/** The profile's address on the site it's shared from, tagged with where it
 *  was put. */
export function profileLink(handle: string, ref?: ShareRef, site: ShareSite = EXCHANGE): string {
  const url = site.brand === "garden" ? `${site.origin}${profilePath(handle)}` : publicProfileUrl(handle);
  return ref ? `${url}?ref=${ref}` : url;
}

/** The address as people read it: no "https://". */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

// ——— For your website ———

export type BadgeTone = "dark" | "light";

/** The badge's words, also its alt text. */
export function badgeAlt(site: ShareSite = EXCHANGE): string {
  return `See my work on ${site.name}`;
}
/** public/badge/*.svg are drawn at these sizes: "The Garden" is the shorter name. */
export const BADGE_SIZE: Readonly<Record<BrandId, { width: number; height: number }>> = {
  exchange: { width: 221, height: 48 },
  garden: { width: 147, height: 48 },
};

/** Where a badge picture lives: public/badge/<tone>.svg, or garden-<tone>.svg. */
export function badgePath(tone: BadgeTone, brand: BrandId = "exchange"): string {
  return brand === "garden" ? `/badge/garden-${tone}.svg` : `/badge/${tone}.svg`;
}

/** The badge to paste into a website: the picture, linking to the profile. */
export function badgeSnippet(handle: string, tone: BadgeTone, site: ShareSite = EXCHANGE): string {
  const href = escapeHtml(profileLink(handle, "badge", site));
  const src = `${site.origin}${badgePath(tone, site.brand)}`;
  const { width, height } = BADGE_SIZE[site.brand];
  return `<a href="${href}"><img src="${src}" alt="${badgeAlt(site)}" width="${width}" height="${height}"></a>`;
}

/** The card's two shapes: one line (photo, name, what they do, the link),
 *  the default; or that line over a row of recent works (?works). */
export type EmbedLayout = "compact" | "works";

/** The card's own address, for a frame on someone else's page. */
export function embedPath(handle: string, layout: EmbedLayout = "compact"): string {
  return layout === "works" ? `/embed/@${handle}?works` : `/embed/@${handle}`;
}

/** The frame the embed snippet asks for, per shape. The card fits it at
 *  400px; narrower is fine (max-width: 100%). */
export const EMBED_FRAME: Readonly<Record<EmbedLayout, { width: number; height: number }>> = {
  compact: { width: 400, height: 96 },
  works: { width: 400, height: 290 },
};

/** The card to paste into a website: a frame holding /embed/@handle. */
export function embedSnippet(
  handle: string,
  name: string,
  layout: EmbedLayout = "compact",
  site: ShareSite = EXCHANGE,
): string {
  const src = escapeHtml(`${site.origin}${embedPath(handle, layout)}`);
  const title = escapeHtml(`${name.trim() || `@${handle}`} on ${site.name}`);
  const { width, height } = EMBED_FRAME[layout];
  return (
    `<iframe src="${src}" width="${width}" height="${height}" ` +
    `style="border:0;max-width:100%" loading="lazy" title="${title}"></iframe>`
  );
}

// ——— Which works to show ———

/**
 * A picture safe to put on another site or a canvas: https, or a path on our
 * own site. Convex's own address for a stored file goes through /media, as
 * every stored picture does (functions/media/[id].ts). Anything else (plain
 * http, data:, a script URL) is no picture.
 */
export function shownImageUrl(url: string | null | undefined): string | null {
  const u = url?.trim();
  if (!u) return null;
  const key = convexFileKey(u);
  if (key) return `${SITE_ORIGIN}/media/${key}`;
  if (/^https:\/\//i.test(u)) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  return null;
}

/** A project row from garden/projectTeam:listAffiliations, the list the
 *  profile page shows. */
export interface ProjectRow {
  projectId: string;
  title?: string | null;
  imageUrl?: string | null;
}

/** A piece from the profile (profiles.publicProfilePage `artifacts`). */
export interface PieceRow {
  _id: string;
  projectId?: string | null;
  type?: string;
  title?: string | null;
  mediaUrl?: string | null;
  ogImageUrl?: string | null;
  createdAt?: number;
}

export interface Work {
  imageUrl: string;
  title?: string;
  /** Set for a project, which has its own public page. */
  projectId?: string;
}

/**
 * The works with a picture, newest first: the person's projects (the list
 * already comes newest first), then pieces that never got a project, as the
 * profile's Portfolio shows them. Pieces inside a project are that project.
 */
export function recentWorks(
  projects: readonly ProjectRow[] | null | undefined,
  pieces: readonly PieceRow[] | null | undefined,
  limit: number,
): Work[] {
  const fromProjects = (projects ?? []).flatMap((p) => {
    const imageUrl = shownImageUrl(p.imageUrl);
    return imageUrl ? [{ imageUrl, title: shownTitle(p.title), projectId: String(p.projectId) }] : [];
  });
  const loose = (pieces ?? [])
    .filter((p) => !p.projectId)
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .flatMap((p) => {
      const imageUrl = shownImageUrl(p.type === "image" ? p.mediaUrl : p.ogImageUrl);
      return imageUrl ? [{ imageUrl, title: shownTitle(p.title) }] : [];
    });
  return [...fromProjects, ...loose].slice(0, Math.max(0, limit));
}
