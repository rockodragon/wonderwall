// The player for a piece's music link — Bandcamp, Spotify or SoundCloud
// (convex/musicEmbed.ts): the
// platform's own iframe at the height it is drawn for, as wide as the column
// up to the widest it draws.
// Only where a piece plays — its project page and a work sample — never on
// a card.

import type { CSSProperties } from "react";
import { MUSIC_PROVIDER_LABEL, type MusicEmbed } from "../lib/musicEmbed";

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
        title={title || `${MUSIC_PROVIDER_LABEL[music.kind]} player`}
        className="w-full h-full"
        // The players draw on a see-through page; an iframe whose color
        // scheme differs from the page around it gets a white backdrop,
        // which showed in the corners of Spotify's rounded card.
        style={{ border: 0, display: "block", colorScheme: "light" }}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
