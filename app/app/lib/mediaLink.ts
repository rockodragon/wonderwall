// What a pasted media link means to a form (docs/features/creator-media-cross-post.md).
//
// An organizer or a project poster can paste an Instagram, TikTok, YouTube or
// Vimeo link instead of uploading a cover: the page plays it in the platform's
// own player, cards show a still. The event modal, the event edit form, both
// project forms, the project page's inline editor and the work composer all
// ask the same question of the field — "is this something we can show, and
// what do I tell the person?" — so the answer lives here once. Two forms were
// built in parallel with their own copies and the wording had already
// drifted; this is the fix. Pure and cheap, so forms run it on every
// keystroke for the hint under the input and once more on submit.

import {
  EMBED_PROVIDER_LABEL,
  type EmbedKind,
  isTikTokShortLink,
  toEmbedUrl,
} from "./videoEmbed";
import { normalizeUrl } from "./richText";

/** The provider of a recognised link. "tiktok-short" is a vm.tiktok.com/…
    "Copy link" from the TikTok app: it can't be read client-side, but the
    server follows it to the permalink (convex/linkPreview.ts), so the form
    accepts it as TikTok and the display code waits for the swap. */
export type MediaLinkKind = EmbedKind | "tiktok-short";

export type MediaLink =
  | { state: "empty" }
  | {
      state: "ok";
      /** What to send: the canonical link, so two people pasting the same
          reel store the same string. A short link is sent as typed. */
      url: string;
      kind: MediaLinkKind;
      /** The line under the input: what it is and what the page does with it. */
      hint: string;
    }
  | { state: "invalid"; message: string };

export const MEDIA_LINK_PROBLEM =
  "That isn't a link we can show. Paste an Instagram, TikTok, YouTube or Vimeo link.";

/** The line under the input: what the link is and what the page does with
    it. An Instagram /p/ permalink may be a photo, which Instagram's frame
    shows rather than plays; a reel or an IGTV post (/reel/, /tv/) and the
    other three providers are always video. The canonical URL is the only
    reliable tell — a pasted link may have come with a username in front.
    Exported for the work composer, which detects the link its own way but
    should say the same thing about it. */
export function mediaLinkHint(kind: MediaLinkKind, canonicalUrl: string): string {
  if (kind === "instagram" && new URL(canonicalUrl).pathname.startsWith("/p/")) {
    return "Instagram post. It shows here on your page.";
  }
  const provider = kind === "tiktok-short" ? "TikTok" : EMBED_PROVIDER_LABEL[kind];
  return `${provider} video. It plays here on your page.`;
}

/** What the field holds right now. A bare host gets https:// so the check
    judges what was meant rather than failing it for a missing scheme. */
export function describeMediaLink(value: string): MediaLink {
  const url = normalizeUrl(value);
  if (!url) return { state: "empty" };
  const embed = toEmbedUrl(url);
  if (embed) {
    return {
      state: "ok",
      url: embed.canonicalUrl,
      kind: embed.kind,
      hint: mediaLinkHint(embed.kind, embed.canonicalUrl),
    };
  }
  if (isTikTokShortLink(url)) {
    return { state: "ok", url, kind: "tiktok-short", hint: mediaLinkHint("tiktok-short", url) };
  }
  return { state: "invalid", message: MEDIA_LINK_PROBLEM };
}
