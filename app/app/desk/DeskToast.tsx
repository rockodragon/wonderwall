// A short note at the bottom of the desk after something is done: "Hana
// joined Hymns for the Commons as Cellist." The card that did it has usually
// closed by then, so the note lives with the desk, not the card. One at a
// time; a new one replaces the last. Read out politely (role="status").
//
// The last note outlives the desk (it's kept here, in the module), so a desk
// that mounts again, back from another page, would say it again. It's
// stamped instead: a desk shows only what's left of a note's time, and
// nothing once that's spent.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { DESK } from "./tokens";

/** How long a note stays up. */
export const SHOW_MS = 2600;

/** A note, and when it went up. */
export type Toast = { id: number; text: string; at: number };

const listeners = new Set<() => void>();
let current: Toast | null = null;

/** Say `text` at the bottom of the desk. */
export function showDeskToast(text: string) {
  current = { id: (current?.id ?? 0) + 1, text, at: Date.now() };
  listeners.forEach((l) => l());
}

/** How much longer `toast` stays up, as of `now`: 0 once its time is spent. */
export function toastTimeLeft(toast: Toast, now: number): number {
  return Math.max(0, toast.at + SHOW_MS - now);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function DeskToast() {
  const toast = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const reduced = useReducedMotion();
  // The note this desk put up, and whether it's still up (it keeps its words
  // while it fades). One whose time was spent before the desk mounted never
  // goes up, nor into the live region.
  const [shown, setShown] = useState<{ id: number; on: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const left = toastTimeLeft(toast, Date.now());
    if (left === 0) return;
    setShown({ id: toast.id, on: true });
    const timer = setTimeout(() => setShown({ id: toast.id, on: false }), left);
    return () => clearTimeout(timer);
  }, [toast]);
  const mine = toast !== null && shown !== null && shown.id === toast.id;
  const on = mine && shown.on;

  return (
    // Always in the page, so a screen reader is listening before the words change.
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 28,
        zIndex: 50,
        maxWidth: "min(520px, calc(100% - 32px))",
        padding: "12px 18px",
        borderRadius: 10,
        border: `1px solid ${DESK.lineStrong}`,
        background: "#232323",
        color: DESK.text,
        fontSize: 14,
        boxShadow: "0 20px 50px rgba(0,0,0,.5)",
        pointerEvents: "none",
        opacity: on ? 1 : 0,
        transform: `translate(-50%, ${on ? 0 : 16}px)`,
        transition: reduced ? "none" : `opacity 250ms ease, transform 300ms ${DESK.ease}`,
      }}
    >
      {mine ? toast.text : null}
    </div>
  );
}
