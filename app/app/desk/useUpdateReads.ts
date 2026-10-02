// What the desk tells the server about Updates (docs/features/desk-updates.md,
// "Rules"): opening a card records that it was seen, closing it archives it,
// and pressing its button records the press (which archives it too).
//
// Watching the open card, not the buttons that close it, covers every way a
// card closes: Escape, the X, the dim layer, the browser's Back, or the
// palette taking the desk to another view. Every call is idempotent on the
// server, and a failed one is dropped: reading an Update must never break.

import { useCallback, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { updateIdOf } from "../lib/updates";

/** Opens the Update that `openId` names (if it is one) and archives the one
 * that was open when the card closes or another opens. */
export function useUpdateReads(openId: string | null): void {
  const open = useMutation(api.updates.open);
  const archive = useMutation(api.updates.archive);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const was = updateIdOf(previous.current);
    const now = updateIdOf(openId);
    previous.current = openId;
    if (now && now !== was) open({ updateId: now as Id<"updates"> }).catch(() => {});
    if (was && was !== now) archive({ updateId: was as Id<"updates"> }).catch(() => {});
  }, [openId, open, archive]);
}

/** Records that an Update's button was pressed. Not awaited: the press goes
 * on to its link either way. */
export function useUpdateClick(): (updateId: string) => void {
  const click = useMutation(api.updates.click);
  return useCallback(
    (updateId: string) => {
      click({ updateId: updateId as Id<"updates"> }).catch(() => {});
    },
    [click],
  );
}
