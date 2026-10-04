// A note shown once per browser: the palette's (desk/PaletteHint.tsx) and the
// phone bar's names (components/PhoneNavNote.tsx). It waits until the page
// has settled, shows after a beat, and is gone for good once dismissed.

import { useCallback, useEffect, useRef, useState } from "react";

/** Long enough for the page to settle first, so a note never flashes on the way somewhere else. */
export const ONCE_NOTE_DELAY_MS = 900;

export function noteSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) === "seen";
  } catch {
    return false;
  }
}

export function markNoteSeen(key: string) {
  try {
    localStorage.setItem(key, "seen");
  } catch {
    // Storage blocked: the note comes back next visit, which is fine.
  }
}

/**
 * @param key     the localStorage key that remembers it was seen
 * @param ready   nothing is about to send this person elsewhere (sign-in
 *                settling, onboarding, /invite)
 * @param usedIt  they did the thing the note explains: it has done its job
 */
export function useOnceNote(key: string, ready: boolean, usedIt = false) {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  const dismiss = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    setShow(false);
    markNoteSeen(key);
  }, [key]);

  useEffect(() => {
    if (usedIt) dismiss();
  }, [usedIt, dismiss]);

  useEffect(() => {
    if (!ready || done) return;
    if (noteSeen(key)) {
      doneRef.current = true;
      setDone(true);
      return;
    }
    const timer = window.setTimeout(() => setShow(true), ONCE_NOTE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [key, ready, done]);

  return { show: show && !done, dismiss };
}
