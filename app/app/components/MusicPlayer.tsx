// The player for a piece's music link (convex/musicEmbed.ts): the
// platform's own iframe at the height it is drawn for, as wide as the column
// up to the widest it draws.
// Only where a piece plays — its project page and a work sample — never on
// a card.

import type { CSSProperties } from "react";
import type { MusicEmbed } from "../lib/musicEmbed";

export function MusicPlayer({
  music,
  title,
  className = "",
  style,
}: {
  music: MusicEmbed;
  title?: string | null;
  /** Applied to the frame around the iframe. */
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`w-full ${className}`} style={{ height: music.height, maxWidth: music.maxWidth, ...style }}>
      <iframe
        src={music.embedUrl}
        title={title || "Bandcamp player"}
        className="w-full h-full"
        style={{ border: 0, display: "block" }}
        allow="autoplay; encrypted-media"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
