// A round portrait with the first initial as its fallback — for people, and
// (square) for the organization posting something. `size` and `tone` carry
// the few looks the app already had, so a list of faces can match the page
// it sits on.
import type { CSSProperties } from "react";

const SIZES = {
  "2xs": "h-5 w-5 text-xs",
  xs: "h-6 w-6 text-xs",
  sm: "h-7 w-7 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-xl",
  // 36px: the org people list, and (smaller initial) event guests and hosts.
  row: "h-9 w-9 text-sm",
  rowXs: "h-9 w-9 text-xs",
} as const;

const TONES = {
  // The default: the accent wash.
  accent: {
    className: "font-semibold",
    style: { backgroundColor: "var(--app-accent-wash)", color: "var(--app-text)" },
  },
  // The raised hairline, for the app pages. `muted` and `dim` are the two
  // initial colors those lists use.
  muted: {
    className: "font-semibold",
    style: { backgroundColor: "var(--app-hairline-raised)", color: "var(--app-text-muted)" },
  },
  dim: {
    className: "font-medium",
    style: { backgroundColor: "var(--app-hairline-raised)", color: "var(--app-text-dim)" },
  },
  // The fixed dark palette the project and gig pages are set in.
  garden: {
    className: "font-bold",
    style: { backgroundColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" },
  },
  // The event page's own grays.
  gray: {
    className: "font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200",
  },
} satisfies Record<string, { className: string; style?: CSSProperties }>;

export function PersonAvatar({
  name,
  imageUrl,
  size = "md",
  tone = "accent",
  shape = "round",
  className = "",
}: {
  name: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  shape?: "round" | "square";
  className?: string;
}) {
  const dimensions = SIZES[size];
  const rounded = shape === "square" ? "rounded" : "rounded-full";
  const initial = name.trim().charAt(0).toUpperCase() || "·";
  const { className: toneClass, style } = TONES[tone] as { className: string; style?: CSSProperties };
  return imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      className={`${dimensions} shrink-0 ${rounded} object-cover ${className}`}
    />
  ) : (
    <span
      aria-label={name}
      className={`${dimensions} flex shrink-0 items-center justify-center ${rounded} ${toneClass} ${className}`}
      style={style}
    >
      {initial}
    </span>
  );
}
