// The canonical mark + wordmark lockup. One place to change the geometry,
// fonts, and sizing — every usage (home.tsx, the app sidebar, anywhere
// else) renders through this instead of its own copy-pasted SVG/text.
// History: the mark's geometry went through several rounds of live
// feedback (V-shaped asymmetry fixed, angle/weight tuned) — see commits
// ae47cf2, 10d7b6d, and the current 22°/8px settled version below.

const SIZES = {
  sm: { icon: 20, text: 12, tagline: 9, gap: "gap-1.5", trackingText: "0.2em", trackingTag: "0.14em" },
  md: { icon: 28, text: 15, tagline: 10.5, gap: "gap-2.5", trackingText: "0.24em", trackingTag: "0.18em" },
  lg: { icon: 40, text: 20, tagline: 13, gap: "gap-3.5", trackingText: "0.24em", trackingTag: "0.18em" },
} as const;

export type WordmarkSize = keyof typeof SIZES;
// "paper": fixed light text, for the dark ink surfaces (home.tsx, the new
// token-based pages) via tokens.css vars.
// "adaptive": Tailwind text-gray-900/dark:text-white, for surfaces still on
// the authenticated shell's old light/dark-by-OS-preference theme — an
// inline color literal can't respond to Tailwind's `dark:` variant, so this
// tone drives color via className instead.
export type WordmarkTone = "paper" | "adaptive";

const CITRON = "#d7f25a";
const TEXT_CLASS = {
  paper: "",
  adaptive: "text-gray-900 dark:text-white",
} as const;
const TEXT_STYLE_COLOR = { paper: "var(--garden-paper)" } as const;
const DIM_CLASS = {
  paper: "",
  adaptive: "text-gray-500 dark:text-gray-400",
} as const;
const DIM_STYLE_COLOR = { paper: "var(--garden-dim)" } as const;

export function Mark({
  size = 28,
  tone = "paper",
  className = "",
}: {
  size?: number;
  tone?: WordmarkTone;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 48 48" fill="none" width={size} height={size} className={`shrink-0 ${className}`}>
      <rect
        x="20" y="3" width="8" height="42" rx="4"
        className={tone === "adaptive" ? "fill-gray-900 dark:fill-white" : undefined}
        fill={tone === "paper" ? TEXT_STYLE_COLOR.paper : undefined}
        transform="rotate(-18 24 24)"
      />
      <rect x="20" y="3" width="8" height="42" rx="4" fill={CITRON} transform="rotate(18 24 24)" />
    </svg>
  );
}

/** Monochrome variant for contexts needing a single inherited color (e.g.
 * currentColor on a light or dark ground) rather than the two-tone mark. */
export function MarkMono({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" width={size} height={size} className={`shrink-0 ${className}`}>
      <rect x="20" y="3" width="8" height="42" rx="4" fill="currentColor" opacity="0.55" transform="rotate(-18 24 24)" />
      <rect x="20" y="3" width="8" height="42" rx="4" fill="currentColor" transform="rotate(18 24 24)" />
    </svg>
  );
}

export function Wordmark({
  size = "md",
  tagline = false,
  tone = "paper",
  className = "",
}: {
  size?: WordmarkSize;
  tagline?: boolean;
  tone?: WordmarkTone;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={`flex items-center ${s.gap} ${className}`}>
      <Mark size={s.icon} tone={tone} />
      <span className="flex flex-col leading-none">
        <span
          className={`font-medium uppercase ${TEXT_CLASS[tone]}`}
          style={{
            fontFamily: "var(--garden-font-mono)",
            fontSize: s.text,
            letterSpacing: s.trackingText,
            color: tone === "paper" ? TEXT_STYLE_COLOR.paper : undefined,
          }}
        >
          creatives.exchange
        </span>
        {tagline && (
          <span
            className={`hidden sm:block mt-1 font-medium uppercase ${DIM_CLASS[tone]}`}
            style={{
              fontFamily: "var(--garden-font-mono)",
              fontSize: s.tagline,
              letterSpacing: s.trackingTag,
              color: tone === "paper" ? DIM_STYLE_COLOR.paper : undefined,
            }}
          >
            Give<span style={{ color: CITRON }}>.</span> Receive
            <span style={{ color: CITRON }}>.</span> Grow
            <span style={{ color: CITRON }}>.</span>
          </span>
        )}
      </span>
    </span>
  );
}
