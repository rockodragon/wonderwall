// "Take them where they were going." A signed-out visitor who clicks Join,
// Back this, or Apply has already made their choice — making them pick it
// again after signup is asking the same question twice.
//
// So the click stashes where they were headed, sends them to signup, and
// _app.tsx replays it the moment they're authenticated. Generalised from
// the pendingClaim stash claim.$token.tsx already used for credit links.
//
// Only same-origin paths are ever stored or replayed: the value is written
// by our own code, but it comes back out of localStorage, which a hostile
// page on the same origin could have written. A path that doesn't start
// with exactly one "/" is dropped rather than navigated to.

const KEY = "pendingIntent";

/** A path is replayable only if it's a plain same-origin route. Rejects
    "//evil.com" (protocol-relative) and anything with a scheme. */
export function isSafeIntentPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("://")
  );
}

/** Remember where this person was going, before sending them to sign up. */
export function setPendingIntent(path: string): void {
  if (!isSafeIntentPath(path)) return;
  try {
    localStorage.setItem(KEY, path);
  } catch {
    // Private browsing / storage disabled — they'll land on the default
    // page after signup instead. Not worth failing the click over.
  }
}

/** Read and clear it. Returns null when there's nothing safe to replay. */
export function takePendingIntent(): string | null {
  try {
    const path = localStorage.getItem(KEY);
    if (path) localStorage.removeItem(KEY);
    return isSafeIntentPath(path) ? path : null;
  } catch {
    return null;
  }
}
