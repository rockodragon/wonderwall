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
  // 40px with a 16px initial (the blocked list), and 48px (search results).
  mdBase: "h-10 w-10 text-base",
  card: "h-12 w-12 text-base",
  // 80px: your own photo at the top of Settings.
  xl: "h-20 w-20 text-3xl",
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
  // A bold initial in the page's own text color, for people on the app pages.
  strong: {
    className: "font-bold",
    style: { backgroundColor: "var(--app-hairline-raised)", color: "var(--app-text)" },
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
  /** `tile` is a rounded square, like the photos on the Canvas's cards. */
  shape?: "round" | "square" | "tile";
  className?: string;
}) {
  const dimensions = SIZES[size];
  // A tile's corners scale with it: 16px on the 80px profile photo, 12px on a card.
  const rounded =
    shape === "square" ? "rounded" : shape === "tile" ? (size === "xl" ? "rounded-2xl" : "rounded-xl") : "rounded-full";
  const initial = name.trim().charAt(0).toUpperCase() || "·";
  const { className: toneClass, style } = TONES[tone] as { className: string; style?: CSSProperties };
  // The tone's background sits behind a picture too, so a transparent logo
  // keeps its circle. The name is always beside the face, so the face is
  // decoration for a screen reader.
  return imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      className={`${dimensions} shrink-0 ${rounded} object-cover ${toneClass} ${className}`}
      style={style}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${dimensions} flex shrink-0 items-center justify-center ${rounded} ${toneClass} ${className}`}
      style={style}
    >
      {initial}
    </span>
  );
}
