import { useId } from "react";
import { describeMediaLink } from "../lib/mediaLink";

// The "paste a link" field shared by the event forms, the project forms and
// the project page's inline editor, so they can't drift on copy or on what
// counts as playable. The rule itself is app/lib/mediaLink.ts; this is the
// label, the input and the line beneath it.
//
// The hosts sit on two designs: the event modal is Tailwind gray/dark, the
// garden (projects) surfaces are the --garden-* variables. `variant` picks
// the tokens; the layout is the same either way.
export { describeMediaLink, MEDIA_LINK_PROBLEM } from "../lib/mediaLink";

const STYLES = {
  default: {
    label: "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1",
    labelStyle: undefined,
    input:
      "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white",
    inputStyle: undefined,
    hint: "mt-1 text-xs text-gray-500 dark:text-gray-400",
    hintStyle: undefined,
    problem: "mt-1 text-xs text-amber-600 dark:text-amber-400",
  },
  garden: {
    label: "block text-xs uppercase tracking-[0.06em] mb-1.5",
    labelStyle: { color: "var(--garden-dim)" },
    input: "w-full px-3 py-2 rounded-lg border text-sm outline-none",
    inputStyle: {
      backgroundColor: "var(--garden-ink)",
      borderColor: "var(--garden-hairline-raised)",
      color: "var(--garden-paper)",
    },
    hint: "text-xs mt-1.5",
    hintStyle: { color: "var(--garden-dim)" },
    problem: "text-xs mt-1.5 text-amber-400",
  },
} as const;

export function MediaLinkField({
  value,
  onChange,
  label = "Video or reel link (Instagram, TikTok, YouTube or Vimeo)",
  placeholder = "https://www.instagram.com/reel/…",
  autoFocus,
  id,
  variant = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  variant?: keyof typeof STYLES;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const s = STYLES[variant];
  const link = describeMediaLink(value);
  return (
    <div>
      <label htmlFor={inputId} className={s.label} style={s.labelStyle}>
        {label}
      </label>
      {/* type="text", not "url": the browser's own url check would refuse a
          bare host the normalizer is about to accept. */}
      <input
        id={inputId}
        type="text"
        inputMode="url"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={s.input}
        style={s.inputStyle}
      />
      {link.state === "ok" && (
        <p className={s.hint} style={s.hintStyle}>
          {link.hint}
        </p>
      )}
      {link.state === "invalid" && <p className={s.problem}>{link.message}</p>}
    </div>
  );
}
