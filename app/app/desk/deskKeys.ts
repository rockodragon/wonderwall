// Keys on the Canvas: when an arrow or Escape is the Canvas's to take, and
// when it belongs to whatever has focus. Shared by the opened card (Desk.tsx)
// and a project's page over the grid (ProjectOverlay.tsx).

/** The palette's corner: it sits above an opened card on purpose, so the
 *  keyboard can reach it while a card is open. */
export const PALETTE_SELECTOR = '.desk-pal, [aria-label="Navigation"]';

/** Focus is in something that takes arrow keys for itself. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}
