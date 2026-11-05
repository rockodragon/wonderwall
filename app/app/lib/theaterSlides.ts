// What theater mode shows (components/Theater.tsx): the work as a run of
// slides, each a picture, an uploaded video, or a pasted YouTube, Vimeo,
// Instagram or TikTok link. Three places build one: a person's page (their
// portfolio, newest first), a project's page (its pieces, in page order)
// and, for admins, /projects (every listed project, newest first).
//
// A piece shows the way its project page plays it (projects.$id.tsx
// PieceMedia): a pasted video link plays, then an uploaded video, then the
// picture; a music link, an audio file or a web page shows its cover. Text
// has nothing to look at and is left out.

import { toEmbedUrl, type VideoEmbed } from "./videoEmbed";
import { shownTitle } from "./placeholderTitle";
import { bylineOf } from "./byline";

export type TheaterSlide = {
  key: string;
  title: string | null;
  /** When it was shared, for newest or oldest first. */
  at: number;
  /** The project page it belongs to, when the viewer isn't on it already. */
  projectId: string | null;
  /** Who made it, where that isn't already plain (the latest-projects reel). */
  by?: string | null;
} & ({ kind: "image"; src: string } | { kind: "video"; src: string } | { kind: "embed"; embed: VideoEmbed });

/** A piece as either page holds it. `file` is what to show (an upload, else
 *  the link); `link` is the link as pasted. */
export type TheaterPiece = {
  _id: string;
  type: string;
  file?: string | null;
  link?: string | null;
  ogImageUrl?: string | null;
  title?: string | null;
  createdAt?: number;
  projectId?: string | null;
};

export function pieceSlide(p: TheaterPiece): TheaterSlide | null {
  const base = { key: String(p._id), title: shownTitle(p.title ?? "") ?? null, at: p.createdAt ?? 0, projectId: p.projectId ?? null };
  const embed = toEmbedUrl(p.link ?? undefined);
  if (embed) return { ...base, kind: "embed", embed };
  if (p.type === "video" && p.file) return { ...base, kind: "video", src: p.file };
  if (p.type === "image" && p.file) return { ...base, kind: "image", src: p.file };
  if (p.ogImageUrl) return { ...base, kind: "image", src: p.ogImageUrl };
  return null;
}

/** The same picture or video twice (a shared image is also its project's
 *  photo) shows once, where it first comes. */
function once(slides: TheaterSlide[]): TheaterSlide[] {
  const seen = new Set<string>();
  return slides.filter((s) => {
    const id = s.kind === "embed" ? s.embed.canonicalUrl : s.src;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** A piece on a person's page (profiles.ts publicProfilePage): `mediaUrl` is
 *  already resolved, `linkUrl` is the link as pasted. */
type ProfilePiece = {
  _id: string;
  type: string;
  mediaUrl?: string | null;
  linkUrl?: string | null;
  ogImageUrl?: string | null;
  title?: string | null;
  createdAt?: number;
  projectId?: string | null;
};

/** A project on a person's page (projectTeam.ts listAffiliations). */
type ProfileProject = {
  projectId: string;
  title: string;
  kind?: string;
  imageUrl?: string | null;
  mediaUrl?: string | null;
  createdAt?: number;
  gig?: unknown;
};

/** A person's work, newest first: every piece they shared, and the picture
 *  or pasted video of each project of theirs that has no piece. A hire post
 *  or a gig isn't their work, and a piece of a project the page doesn't
 *  list (a draft, one hidden) stays out with it. */
export function portfolioSlides(pieces: readonly ProfilePiece[], projects: readonly ProfileProject[]): TheaterSlide[] {
  const work = new Map(
    projects.filter((p) => p.kind !== "paid" && !p.gig).map((p) => [String(p.projectId), p] as const),
  );
  const slides: TheaterSlide[] = [];
  const withPieces = new Set<string>();
  for (const a of pieces) {
    const projectId = a.projectId ? String(a.projectId) : null;
    const project = projectId ? work.get(projectId) : undefined;
    if (projectId && !project) continue;
    const slide = pieceSlide({
      _id: a._id,
      type: a.type,
      file: a.mediaUrl,
      link: a.linkUrl,
      ogImageUrl: a.ogImageUrl,
      title: a.title || project?.title,
      createdAt: a.createdAt,
      projectId,
    });
    if (!slide) continue;
    slides.push(slide);
    if (projectId) withPieces.add(projectId);
  }
  for (const [projectId, p] of work) {
    if (withPieces.has(projectId)) continue;
    const base = { key: projectId, title: shownTitle(p.title) ?? null, at: p.createdAt ?? 0, projectId };
    const embed = toEmbedUrl(p.mediaUrl ?? undefined);
    if (embed) slides.push({ ...base, kind: "embed", embed });
    else if (p.imageUrl) slides.push({ ...base, kind: "image", src: p.imageUrl });
  }
  return orderSlides(once(slides), "newest");
}

/** A project's own page (garden/projects.ts getProject), in the order the
 *  page shows it: the photo, the pasted link, then the pieces. */
export function projectSlides(project: {
  _id: string;
  title: string;
  createdAt?: number;
  resolvedPhotoUrl?: string | null;
  mediaUrl?: string | null;
  media?: readonly any[];
}): TheaterSlide[] {
  const base = { title: shownTitle(project.title) ?? null, at: project.createdAt ?? 0, projectId: null };
  const slides: TheaterSlide[] = [];
  if (project.resolvedPhotoUrl) slides.push({ ...base, key: `${project._id}:photo`, kind: "image", src: project.resolvedPhotoUrl });
  const embed = toEmbedUrl(project.mediaUrl ?? undefined);
  if (embed) slides.push({ ...base, key: `${project._id}:link`, kind: "embed", embed });
  for (const m of project.media ?? []) {
    const slide = pieceSlide({
      _id: m._id,
      type: m.type,
      file: m.resolvedMediaUrl,
      link: m.mediaUrl,
      ogImageUrl: m.ogImageUrl,
      title: m.title || project.title,
      createdAt: m.createdAt,
    });
    if (slide) slides.push(slide);
  }
  return once(slides);
}

/** Every listed project (garden/projects.ts listProjects), for an admin's
 *  reel on /projects (Rick, 2026-11-04): each one's photo, pasted video and
 *  pieces, kept together, newest project first, with who made it. A hire
 *  post or a gig isn't shown work. */
export function latestSlides(
  projects: readonly (Parameters<typeof projectSlides>[0] &
    Parameters<typeof bylineOf>[0] & { kind?: string; gig?: unknown })[],
): TheaterSlide[] {
  const slides = projects
    .filter((p) => p.kind !== "paid" && !p.gig)
    .flatMap((p) =>
      projectSlides(p).map((s) => ({
        ...s,
        at: p.createdAt ?? 0,
        projectId: String(p._id),
        by: bylineOf(p)?.name ?? null,
      })),
    );
  return orderSlides(once(slides), "newest");
}

export type TheaterOrder = "newest" | "oldest";

export function orderSlides(slides: readonly TheaterSlide[], order: TheaterOrder): TheaterSlide[] {
  const newest = [...slides].sort((a, b) => b.at - a.at);
  return order === "newest" ? newest : newest.reverse();
}

/** Seconds a picture stays up. ↑ is faster, ↓ is slower. */
export const THEATER_SPEEDS = [3, 5, 8, 12, 20] as const;
export const DEFAULT_SECONDS = 8;

export function nextSpeed(seconds: number, faster: boolean): number {
  const i = THEATER_SPEEDS.findIndex((s) => s >= seconds);
  const at = i === -1 ? THEATER_SPEEDS.length - 1 : i;
  const to = Math.min(THEATER_SPEEDS.length - 1, Math.max(0, at + (faster ? -1 : 1)));
  return THEATER_SPEEDS[to];
}

/** A player's "it finished" message (window postMessage): YouTube's state 0,
 *  or Vimeo's `ended` event. */
export function embedEnded(kind: VideoEmbed["kind"], data: unknown): boolean {
  let d: any = data;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return false;
    }
  }
  if (!d || typeof d !== "object") return false;
  if (kind === "youtube") {
    return (d.event === "onStateChange" && d.info === 0) || (d.event === "infoDelivery" && d.info?.playerState === 0);
  }
  if (kind === "vimeo") return d.event === "ended";
  return false;
}

/** The player's own address, set to start playing and to tell us when it
 *  ends. Instagram and TikTok have neither: they wait for a tap. */
export function theaterEmbedUrl(embed: VideoEmbed, origin: string): string {
  const url = new URL(embed.embedUrl);
  if (embed.kind === "youtube") {
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("rel", "0");
    url.searchParams.set("origin", origin);
  } else if (embed.kind === "vimeo") {
    url.searchParams.set("autoplay", "1");
  }
  return url.toString();
}
