// The small "i" next to a heading, with the explanation behind it (Rick,
// 2026-09-30: headline + one line, explanations behind an info icon).
// Hover on desktop, tap toggles; Escape or an outside click closes. Garden
// pages (/give) color it with their --g-* tokens; everywhere else the app's.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const HAIR = "var(--g-hairline, var(--app-hairline-raised))";
const CIRCLE = 28;
const TARGET = 44;

export function InfoTip({ lines, label = "How this works" }: { lines: ReactNode[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shift, setShift] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const shown = open || pinned;

  useEffect(() => {
    if (!shown) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [shown]);

  // On a phone the "i" can sit far enough right that the note would run
  // off the screen: slide it back in, 16px from the edge.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!shown || !tip) {
      setShift(0);
      return;
    }
    const { left, right } = tip.getBoundingClientRect();
    const over = right - (document.documentElement.clientWidth - 16);
    setShift(over > 0 ? -Math.max(0, Math.min(over, left - 16)) : 0);
  }, [shown]);

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={shown}
        aria-controls={id}
        // A touch fires mouseenter too, so a second tap has to close both.
        onClick={() => {
          if (pinned) {
            setPinned(false);
            setOpen(false);
          } else {
            setPinned(true);
          }
        }}
        // A 44px target around a 28px circle. The margin takes the extra 8px
        // back on every side, so the row and the note's top: 34 don't move.
        style={{
          width: TARGET,
          height: TARGET,
          margin: -(TARGET - CIRCLE) / 2,
          padding: 0,
          border: 0,
          borderRadius: 9999,
          background: "transparent",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            boxSizing: "border-box",
            width: CIRCLE,
            height: CIRCLE,
            borderRadius: 9999,
            border: `1px solid ${HAIR}`,
            color: "var(--g-paper, var(--app-text))",
            fontFamily: "var(--g-mono, monospace)",
            fontSize: 14,
            fontStyle: "italic",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          i
        </span>
      </button>
      {shown && (
        <span
          ref={tipRef}
          id={id}
          role="note"
          style={{
            position: "absolute",
            top: 34,
            left: shift,
            zIndex: 20,
            width: "min(320px, 80vw)",
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${HAIR}`,
            background: "var(--g-raised, var(--app-surface-raised))",
            color: "var(--g-body, var(--app-text))",
            fontSize: 14.5,
            lineHeight: 1.5,
            fontWeight: 400,
            letterSpacing: "normal",
            display: "grid",
            gap: 6,
          }}
        >
          {lines.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </span>
      )}
    </span>
  );
}
