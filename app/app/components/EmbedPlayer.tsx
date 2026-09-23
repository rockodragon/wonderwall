// The player for a pasted Instagram, TikTok, YouTube or Vimeo link, on a
// detail page (work, event, project, story). The platform's own iframe,
// inside our page: the viewer stays here, with Follow, Back and the story
// around it. A reel or a TikTok is portrait, so it is capped at phone width
// and centred; YouTube and Vimeo fill the column.
//
// Only ever handed a link the page already decided this viewer may see
// (docs/gated-event-video-prd.md, "Gating rule"). Cards never render this —
// they use EmbedStill, so browsing a grid loads no players.

import type { CSSProperties } from "react";
import type { VideoEmbed } from "../lib/videoEmbed";
import { EMBED_PROVIDER_LABEL } from "../lib/videoEmbed";

export const EMBED_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

export function EmbedPlayer({
  embed,
  title,
  className = "",
  style,
}: {
  embed: VideoEmbed;
  title?: string | null;
  /** Applied to the frame around the iframe. */
  className?: string;
  style?: CSSProperties;
}) {
  const portrait = embed.aspect === "9/16";
  return (
    <div
      className={`${portrait ? "mx-auto w-full max-w-[420px] aspect-[9/16]" : "w-full aspect-video"} ${className}`}
      style={style}
    >
      <iframe
        src={embed.embedUrl}
        title={title || `${EMBED_PROVIDER_LABEL[embed.kind]} video`}
        className="w-full h-full"
        style={{ border: 0, display: "block" }}
        allow={EMBED_ALLOW}
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
