import { Microphone } from "@phosphor-icons/react";
import { useSpeechSupported } from "../lib/useSpeech";

// "Talk instead": a round 44px microphone. At rest it is a paper icon on ink
// (about 17:1); listening is a filled citron circle with an ink icon (about
// 14:1), and aria-pressed says it to a screen reader. It draws nothing where
// the browser can't listen (Firefox, some in-app browsers), so the page never
// offers what won't work. The words come from useSpeech.
export function MicButton({
  listening,
  onStart,
  onStop,
  className,
}: {
  listening: boolean;
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
      aria-label={listening ? "Stop" : "Talk instead"}
      onClick={listening ? onStop : onStart}
      className={["inline-flex items-center justify-center shrink-0 rounded-full border", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: 44,
        height: 44,
        padding: 0,
        cursor: "pointer",
        backgroundColor: listening ? "var(--garden-citron)" : "var(--garden-ink)",
        borderColor: listening ? "var(--garden-citron)" : "var(--garden-hairline-raised)",
        color: listening ? "var(--garden-ink)" : "var(--garden-paper)",
      }}
    >
      <Microphone size={22} weight={listening ? "fill" : "regular"} aria-hidden="true" />
    </button>
  );
}
