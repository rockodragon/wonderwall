import { Microphone } from "@phosphor-icons/react";

// "Talk instead": a round 44px microphone. At rest it is a paper icon on ink
// (about 17:1); recording is a filled citron circle with an ink icon (about
// 14:1), and aria-pressed says it to a screen reader. While the take is being
// written down (`working`) it waits, dimmed. TalkBox draws it only where the
// browser can record and the person is signed in (lib/useTalk.ts).
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
