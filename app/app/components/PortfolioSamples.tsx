// Portfolio selection and inline evidence share one UI across applications,
// legacy job interests and scheduled gigs. Callers supply authorized samples.
import type { ReactNode } from "react";
import type { PortfolioSample as ResolvedPortfolioSample } from "../../convex/portfolioSamples";
import { pieceStill } from "../../convex/coverRules";
import { PieceMedia, pieceDisplay, type PieceLike } from "./piece/PieceMedia";

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
        const thumbnail = pieceStill(
          { ...sample, mediaUrl: sample.linkUrl ?? sample.mediaUrl },
          sample.type === "image" ? (sample.resolvedMediaUrl ?? sample.mediaUrl) : null,
        );
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

/** A work sample playing, the way its piece plays on its project's page
 *  (components/piece/PieceMedia.tsx), inside the sample's own card. */
export function PortfolioSamplePreview({ sample }: { sample: PortfolioSample }) {
  const piece: PieceLike = {
    type: sample.type,
    title: sample.title,
    content: sample.content,
    mediaUrl: sample.linkUrl ?? null,
    resolvedMediaUrl: sample.resolvedMediaUrl ?? sample.mediaUrl,
    ogImageUrl: sample.ogImageUrl,
  };
  if (pieceDisplay(piece).kind === "none") {
    return <p className="text-xs opacity-60">This sample is no longer available.</p>;
  }
  return <PieceMedia piece={piece} title={sample.type === "audio" ? "Audio sample" : "Work sample"} framed={false} />;
}
