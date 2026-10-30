import { Microphone } from "@phosphor-icons/react";
import { useSpeechSupported } from "../lib/useSpeech";

// "Talk instead": a round 44px microphone. At rest it is a paper icon on ink
// (about 17:1); listening is a filled citron circle with an ink icon (about
// 14:1), and aria-pressed says it to a screen reader. While a take is being
// written down (`working`, the recorder fallback) it waits, dimmed. It draws
// nothing where the browser can neither listen nor record, so the page never
// offers what won't work. The words come from useSpeech.
export function MicButton({
  listening,
  working = false,
  onStart,
  onStop,
  className,
}: {
  listening: boolean;
  working?: boolean;
  onStart: () => void;
  onStop: () => void;
  className?: string;
}) {
  const supported = useSpeechSupported();
  if (!supported) return null;
  return (
    <button
      type="button"
      aria-pressed={listening}
      aria-label={working ? "Writing it down" : listening ? "Stop" : "Talk instead"}
      aria-busy={working || undefined}
      disabled={working}
      onClick={listening ? onStop : onStart}
      className={["inline-flex items-center justify-center shrink-0 rounded-full border", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: 44,
        height: 44,
        padding: 0,
        cursor: working ? "wait" : "pointer",
        opacity: working ? 0.6 : 1,
        backgroundColor: listening ? "var(--garden-citron)" : "var(--garden-ink)",
        borderColor: listening ? "var(--garden-citron)" : "var(--garden-hairline-raised)",
        color: listening ? "var(--garden-ink)" : "var(--garden-paper)",
      }}
    >
      <Microphone size={22} weight={listening ? "fill" : "regular"} aria-hidden="true" />
    </button>
  );
}
