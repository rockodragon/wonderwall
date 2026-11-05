// What a pasted media link means to a form (docs/features/creator-media-cross-post.md).
//
// An organizer or a project poster can paste an Instagram, TikTok, YouTube or
// Vimeo link instead of uploading a cover: the page plays it in the platform's
// own player, cards show a still. The event forms, the hire form, the project
// page's inline editor and the piece editor all ask the same question of the
// field — "is this something we can show, and what do I tell the person?" —
// so the answer lives here once. Two forms were built in parallel with their
// own copies and the wording had already drifted; this is the fix. Pure and
// cheap, so forms run it on every keystroke for the hint under the input and
// once more on submit.
//
// Two answers to "can we show it":
//   "video" — an event's or a job's link: a video, or nothing.
//   "piece" — a piece of work (components/piece/PieceFields.tsx): a video, a
//             song (Bandcamp, Spotify, SoundCloud), an audio file, or any
//             other page, which shows as a card. Rick, 2026-11-04: pieces
//             take "links to Vimeo, embedded Vimeo or YouTube, as well as
//             audio and Bandcamp or whoever else".

import {
  EMBED_PROVIDER_LABEL,
  type EmbedKind,
  isTikTokShortLink,
  toEmbedUrl,
} from "./videoEmbed";
import { MUSIC_PROVIDER_LABEL, type MusicKind, isAudioFileLink, isBandcampPageLink, toMusicEmbed } from "./musicEmbed";
import { isSafeHttpUrl, linkHost, normalizeUrl } from "./richText";

/** The provider of a recognised link. "tiktok-short" is a vm.tiktok.com/…
    "Copy link" from the TikTok app: it can't be read client-side, but the
    server follows it to the permalink (convex/linkPreview.ts), so the form
    accepts it as TikTok and the display code waits for the swap. */
export type MediaLinkKind = EmbedKind | "tiktok-short";

/** What a field accepts (see the top of this file). */
export type MediaLinkAccept = "video" | "piece";

/** What kind of piece a link makes: it plays as a video, plays as sound,
    or shows as a card for the page. */
export type LinkPieceType = "video" | "audio" | "link";

export type MediaLink =
  | { state: "empty" }
  | {
      state: "ok";
      /** What to send: the canonical link, so two people pasting the same
          reel store the same string. A short link is sent as typed. */
      url: string;
      kind: MediaLinkKind | MusicKind | "audio-file" | "page";
      /** The kind of piece it makes (a "video" field only ever says video). */
      pieceType: LinkPieceType;
      /** The line under the input: what it is and what the page does with it. */
      hint: string;
    }
  | { state: "invalid"; message: string };

export const MEDIA_LINK_PROBLEM =
  "That isn't a link we can show. Paste an Instagram, TikTok, YouTube or Vimeo link.";
export const PIECE_LINK_PROBLEM = "That isn't a link. Paste the address of the page.";

/** The line under the input: what the link is and what the page does with
    it. An Instagram /p/ permalink may be a photo, which Instagram's frame
    shows rather than plays; a reel or an IGTV post (/reel/, /tv/) and the
    other three providers are always video. The canonical URL is the only
    reliable tell — a pasted link may have come with a username in front. */
export function mediaLinkHint(kind: MediaLinkKind, canonicalUrl: string): string {
  if (kind === "instagram" && new URL(canonicalUrl).pathname.startsWith("/p/")) {
    return "Instagram post. It shows here on your page.";
  }
  const provider = kind === "tiktok-short" ? "TikTok" : EMBED_PROVIDER_LABEL[kind];
  return `${provider} video. It plays here on your page.`;
}

function videoLink(url: string): MediaLink | null {
  const embed = toEmbedUrl(url);
  if (embed) {
    return {
      state: "ok",
      url: embed.canonicalUrl,
      kind: embed.kind,
      pieceType: "video",
      hint: mediaLinkHint(embed.kind, embed.canonicalUrl),
    };
  }
  if (isTikTokShortLink(url)) {
    return { state: "ok", url, kind: "tiktok-short", pieceType: "video", hint: mediaLinkHint("tiktok-short", url) };
  }
  return null;
}

/** A song, an audio file or any other page, for a piece. */
function pieceLink(url: string): MediaLink | null {
  const music = toMusicEmbed(url);
  if (music) {
    return {
      state: "ok",
      url: music.canonicalUrl,
      kind: music.kind,
      pieceType: "audio",
      hint: `${MUSIC_PROVIDER_LABEL[music.kind]} ${music.item}. It plays here on your page.`,
    };
  }
  if (isBandcampPageLink(url)) {
    const item = new URL(url).pathname.split("/").filter(Boolean)[0];
    return {
      state: "ok",
      url,
      kind: "bandcamp",
      pieceType: "audio",
      hint: `Bandcamp ${item}. It plays here on your page.`,
    };
  }
  if (!isSafeHttpUrl(url) || !linkHost(url)?.includes(".")) return null;
  if (isAudioFileLink(url)) {
    return { state: "ok", url, kind: "audio-file", pieceType: "audio", hint: "Audio file. It plays here on your page." };
  }
  return { state: "ok", url, kind: "page", pieceType: "link", hint: `A link to ${linkHost(url)}. It shows as a card.` };
}

/** What the field holds right now. A bare host gets https:// so the check
    judges what was meant rather than failing it for a missing scheme. */
export function describeMediaLink(value: string, accept: MediaLinkAccept = "video"): MediaLink {
  const url = normalizeUrl(value);
  if (!url) return { state: "empty" };
  const found = videoLink(url) ?? (accept === "piece" ? pieceLink(url) : null);
  if (found) return found;
  return { state: "invalid", message: accept === "piece" ? PIECE_LINK_PROBLEM : MEDIA_LINK_PROBLEM };
}
