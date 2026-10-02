// A short note at the bottom of the desk after something is done: "Hana
// joined Hymns for the Commons as Cellist." The card that did it has usually
// closed by then, so the note lives with the desk, not the card. One at a
// time; a new one replaces the last. Read out politely (role="status").

import { useEffect, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { DESK } from "./tokens";

/** How long a note stays up. */
const SHOW_MS = 2600;

type Toast = { id: number; text: string };

const listeners = new Set<() => void>();
let current: Toast | null = null;

/** Say `text` at the bottom of the desk. */
export function showDeskToast(text: string) {
  current = { id: (current?.id ?? 0) + 1, text };
  listeners.forEach((l) => l());
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
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    setShown(toast.id);
    const timer = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const on = toast !== null && shown === toast.id;

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
      {toast?.text}
    </div>
  );
}
