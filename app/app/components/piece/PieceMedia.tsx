// A piece of work, playing: the one renderer for a piece wherever it plays
// whole — its project's page, and a work sample on an application or a gig.
// Cards never draw this; they show a still (EmbedStill, ProjectCover).
//
// The project page and the work samples had each written this switch, and
// they had drifted (one checked music first, one images first; one played
// any "audio" address in an <audio>, which is a dead player for a music
// page). One rule now, in pieceDisplay, and one way to draw it.

import { toEmbedUrl, type VideoEmbed } from "../../lib/videoEmbed";
import { isAudioFileLink, toMusicEmbed, type MusicEmbed } from "../../lib/musicEmbed";
import { isSafeHttpUrl, linkHost, safeHref } from "../../lib/richText";
import { EmbedPlayer } from "../EmbedPlayer";
import { MusicPlayer } from "../MusicPlayer";

/** What a renderer needs of a piece (an artifacts row with its file's
 *  address). `mediaUrl` is the link the person pasted; `resolvedMediaUrl`
 *  is the address to play — the uploaded file's, else that link. */
export type PieceLike = {
  type: string;
  title?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  resolvedMediaUrl?: string | null;
  mediaStorageId?: string | null;
  ogImageUrl?: string | null;
};

export type PieceDisplay =
  | { kind: "video-embed"; embed: VideoEmbed }
  | { kind: "music"; music: MusicEmbed }
  | { kind: "video"; src: string }
  | { kind: "audio"; src: string }
  | { kind: "image"; src: string }
  | { kind: "text"; text: string }
  | { kind: "link"; href: string; host: string; image: string | null }
  | { kind: "none" };

/** How a piece plays, in order: a pasted video in its platform's player, a
 *  song in its platform's player, an uploaded (or linked) video, audio or
 *  picture, its words, else a card for its link. An <audio> only gets an
 *  uploaded file or an audio file's link; a music page that isn't a player
 *  link (yet) gets the card. Pure, so it is unit-tested. */
export function pieceDisplay(piece: PieceLike): PieceDisplay {
  const link = piece.mediaUrl ?? undefined;
  const embed = toEmbedUrl(link);
  if (embed) return { kind: "video-embed", embed };
  const music = toMusicEmbed(link);
  if (music) return { kind: "music", music };
  const src = piece.resolvedMediaUrl ?? null;
  // A file someone uploaded, or (for a work sample, which carries no
  // storage id) an address with no pasted link behind it.
  const isFile = !!piece.mediaStorageId || (!link && !!src);
  if (src && isSafeHttpUrl(src)) {
    if (piece.type === "video") return { kind: "video", src };
    if (piece.type === "audio" && (isFile || isAudioFileLink(src))) return { kind: "audio", src };
    if (piece.type === "image") return { kind: "image", src };
  }
  if (piece.type === "text" && piece.content) return { kind: "text", text: piece.content };
  const href = safeHref(link);
  if (href) {
    return { kind: "link", href, host: linkHost(href) ?? href, image: piece.ogImageUrl ?? null };
  }
  return { kind: "none" };
}

/** `framed`: the project page's dark rounded frame. Off for a work sample,
 *  which sits inside its own card. */
export function PieceMedia({
  piece,
  title,
  framed = true,
}: {
  piece: PieceLike;
  /** The player's name for a screen reader, when the piece has no title. */
  title?: string | null;
  framed?: boolean;
}) {
  const d = pieceDisplay(piece);
  const name = piece.title || title || null;
  const frame = framed ? { backgroundColor: "var(--garden-ink-raised)" } : undefined;
  const round = framed ? "rounded-2xl" : "rounded-lg";
  switch (d.kind) {
    case "video-embed":
      return <EmbedPlayer embed={d.embed} title={name} className={`${round} overflow-hidden`} style={frame} />;
    case "music":
      return <MusicPlayer music={d.music} title={name} className={`${round} overflow-hidden`} style={frame} />;
    case "video":
      return (
        <video
          controls
          preload="metadata"
          playsInline
          src={d.src}
          aria-label={name ?? "Video"}
          className={`w-full ${framed ? "max-h-[80vh]" : "max-h-80"} ${round}`}
          style={frame}
        />
      );
    case "audio":
      return framed ? (
        <div className={`${round} p-4`} style={frame}>
          {piece.title && (
            <p className="text-sm mb-2" style={{ color: "var(--garden-paper)" }}>
              {piece.title}
            </p>
          )}
          <audio controls preload="none" src={d.src} className="w-full" aria-label={name ?? "Audio"} />
        </div>
      ) : (
        <audio controls preload="none" src={d.src} className="w-full" aria-label={name ?? "Audio sample"} />
      );
    case "image":
      return (
        <img
          src={d.src}
          alt={name ?? ""}
          loading="lazy"
          className={`w-full ${framed ? "max-h-[70vh]" : "max-h-80"} object-contain ${round}`}
          style={frame}
        />
      );
    case "text":
      return framed ? (
        <div className={`${round} p-5 text-[15px] whitespace-pre-wrap`} style={{ ...frame, color: "var(--garden-body)" }}>
          {d.text}
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">{d.text}</p>
      );
    case "link":
      return (
        <a
          href={d.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 ${round} p-3 hover:opacity-90`}
          style={frame ?? { border: "1px solid var(--garden-hairline-raised)" }}
        >
          {d.image && <img src={d.image} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />}
          <span className="min-w-0">
            <span className="block text-sm font-medium break-words" style={{ color: "var(--garden-paper)" }}>
              {piece.title || d.host}
            </span>
            <span className="block text-[13px]" style={{ color: "var(--garden-muted)" }}>
              {d.host} ↗
            </span>
          </span>
        </a>
      );
    case "none":
      return null;
  }
}
