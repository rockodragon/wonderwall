// Portfolio selection and inline evidence share one UI across applications,
// legacy job interests and scheduled gigs. Callers supply authorized samples.
import type { ReactNode } from "react";
import type { PortfolioSample as ResolvedPortfolioSample } from "../../convex/portfolioSamples";
import { toEmbedUrl } from "../lib/videoEmbed";
import { isSafeHttpUrl } from "../lib/richText";
import { EmbedPlayer } from "./EmbedPlayer";

export type PortfolioSample = Pick<ResolvedPortfolioSample, "type"> &
  Partial<Omit<ResolvedPortfolioSample, "artifactId" | "type">> & { resolvedMediaUrl?: string | null };

/** Removing a selection always works, including when the limit is reached. */
export function toggleSampleSelection<T extends string>(selected: readonly T[], id: T, maximum: number): T[] {
  if (selected.includes(id)) return selected.filter((value) => value !== id);
  return selected.length < maximum ? [...selected, id] : [...selected];
}

export function PortfolioSamplePicker<T extends string>({
  samples,
  selected,
  onChange,
  maximum,
  empty = "No work samples yet. Add work to your profile, then choose it here.",
  tone = "garden",
}: {
  samples: readonly (PortfolioSample & { _id: T })[] | undefined;
  selected: readonly T[];
  onChange: (ids: T[]) => void;
  maximum: number;
  empty?: ReactNode;
  tone?: "garden" | "page";
}) {
  if (samples === undefined) return <p role="status" className="text-sm opacity-70">Loading your work…</p>;
  if (samples.length === 0) return <div className="text-sm opacity-70">{empty}</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Choose work samples">
      {samples.map((sample) => {
        const active = selected.includes(sample._id);
        const embed = toEmbedUrl(sample.linkUrl ?? sample.mediaUrl ?? undefined);
        const thumbnail = sample.type === "image"
          ? sample.resolvedMediaUrl ?? sample.mediaUrl ?? sample.ogImageUrl
          : sample.ogImageUrl ?? embed?.thumbnailUrl;
        return (
          <button
            key={sample._id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(toggleSampleSelection(selected, sample._id, maximum))}
            disabled={!active && selected.length >= maximum}
            className={`flex items-center gap-2 rounded-lg border p-2 text-left disabled:opacity-40 ${tone === "page" ? "border-gray-300 dark:border-gray-700" : ""}`}
            style={tone === "garden" ? {
              borderColor: active ? "var(--garden-citron)" : "var(--garden-hairline-raised)",
              backgroundColor: active ? "rgba(254,226,104,0.12)" : "var(--garden-ink)",
              color: "var(--garden-paper)",
            } : active ? { borderColor: "currentColor", backgroundColor: "rgba(128,128,128,0.12)" } : undefined}
          >
            {thumbnail && <img src={thumbnail} alt="" className="h-12 w-12 rounded object-cover shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{active ? "✓ " : ""}{sample.title || "Untitled work"}</span>
              <span className="block text-xs capitalize opacity-65">{sample.type}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One media renderer; use the platform's existing embed resolver and player. */
export function PortfolioSamplePreview({ sample }: { sample: PortfolioSample }) {
  const mediaUrl = sample.resolvedMediaUrl ?? sample.mediaUrl;
  const embed = toEmbedUrl(sample.linkUrl ?? mediaUrl ?? undefined);
  if (sample.type === "image" && mediaUrl) {
    return <img src={mediaUrl} alt={sample.title || "Work sample"} loading="lazy" className="w-full max-h-80 object-contain rounded-lg" />;
  }
  if (sample.type === "audio" && mediaUrl) {
    return <audio controls preload="none" src={mediaUrl} className="w-full" aria-label={sample.title || "Audio sample"} />;
  }
  if (embed) return <EmbedPlayer embed={embed} title={sample.title} className="rounded-lg overflow-hidden" />;
  if (sample.type === "video" && mediaUrl) {
    return <video controls preload="metadata" src={mediaUrl} className="w-full max-h-80 rounded-lg" aria-label={sample.title || "Video sample"} />;
  }
  if (sample.type === "text" && sample.content) {
    return <p className="text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">{sample.content}</p>;
  }
  const linkUrl = sample.linkUrl ?? mediaUrl;
  if (isSafeHttpUrl(linkUrl)) {
    return <a href={linkUrl!} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-2 break-words">{sample.title || "Open work sample"}</a>;
  }
  return <p className="text-xs opacity-60">This sample is no longer available.</p>;
}
