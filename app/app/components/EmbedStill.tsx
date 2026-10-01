// The static face of an embedded video on a card: a still with a play badge
// when we have one, else a dark tile that names the provider. Nothing here
// plays or loads a player — that is the detail page's job, so a grid of
// reels stays quiet while someone browses (Instagram's own rule).
//
// Used by the works grid, the profile grid, the settings grid, event cards
// and project cards. The still is whatever the row stored (`ogImageUrl` on
// an artifact, `mediaPreviewUrl` on an event or project — fetched by
// convex/linkPreview.ts) or, for YouTube, the resolver's own thumbnail.

import type { VideoEmbed } from "../lib/videoEmbed";
import { EMBED_PROVIDER_LABEL } from "../lib/videoEmbed";

/** The play badge over a still. YouTube red is the one colour people
    recognise; every other provider gets a neutral badge so the card reads
    as the creative's work, not an ad for the platform. */
export function PlayBadge({ kind, size = "md" }: { kind: VideoEmbed["kind"]; size?: "sm" | "md" }) {
  const box = size === "sm" ? "w-10 h-10" : "w-14 h-14";
  const glyph = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={`${box} rounded-full flex items-center justify-center shadow-lg ${
          kind === "youtube" ? "bg-red-600" : "bg-black/70"
        }`}
      >
        <svg className={`${glyph} text-white ml-0.5`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
}

export function EmbedStill({
  embed,
  previewUrl,
  title,
  className = "",
  badgeSize = "md",
}: {
  embed: VideoEmbed;
  /** The stored still, if the row has one. Falls back to the provider's
      own (YouTube), then to the tile. */
  previewUrl?: string | null;
  title?: string | null;
  /** Applied to the outer box, which fills its parent by default. */
  className?: string;
  badgeSize?: "sm" | "md";
}) {
  const src = previewUrl ?? embed.thumbnailUrl ?? null;
  if (src) {
    return (
      <div className={`relative w-full h-full overflow-hidden ${className}`}>
        <img
          src={src}
          alt={title || `${EMBED_PROVIDER_LABEL[embed.kind]} video`}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        <PlayBadge kind={embed.kind} size={badgeSize} />
      </div>
    );
  }
  return (
    <div
      className={`relative w-full h-full p-4 flex flex-col justify-between bg-gradient-to-br from-gray-900 to-gray-700 ${className}`}
    >
      <span className="text-xs uppercase tracking-wide text-white/70">
        {EMBED_PROVIDER_LABEL[embed.kind]}
      </span>
      <PlayBadge kind={embed.kind} size={badgeSize} />
      {title && <h3 className="relative text-white text-sm font-medium line-clamp-2">{title}</h3>}
    </div>
  );
}
