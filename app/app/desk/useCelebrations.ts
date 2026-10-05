// What the canvas tells the server about celebrations (lib/celebrations.ts),
// and the confetti an award gets. Closing a celebration's opened card marks
// it done (notifications.finishCelebration), and so does pressing its button,
// so it leaves the canvas once it has been seen. The same rule as an Update's
// archive (useUpdateReads.ts), watched the same way: from the open card, not
// the buttons, so Escape, the X, Back and the palette all count.
//
// Every call is idempotent on the server, and a failed one is dropped:
// reading a celebration must never break the canvas.

import { useCallback, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { throwConfetti } from "../lib/celebrate";
import { awardsToCelebrate, celebratedIds, celebrationIdOf, rememberCelebrated } from "../lib/celebrations";
import type { DeskCard } from "./deskCards";

/** Marks the celebration that was open done when its card closes or another opens. */
export function useCelebrationReads(openId: string | null): void {
  const finish = useMutation(api.notifications.finishCelebration);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const was = celebrationIdOf(previous.current);
    previous.current = openId;
    if (was && was !== celebrationIdOf(openId)) {
      finish({ notificationId: was as Id<"notifications"> }).catch(() => {});
    }
  }, [openId, finish]);
}

/** Marks one celebration done. Not awaited: the button goes on either way. */
export function useFinishCelebration(): (notificationId: string) => void {
  const finish = useMutation(api.notifications.finishCelebration);
  return useCallback(
    (notificationId: string) => {
      finish({ notificationId: notificationId as Id<"notifications"> }).catch(() => {});
    },
    [finish],
  );
}

/** Confetti the first time an award is on show, once per award per browser. */
export function useAwardConfetti(shown: readonly DeskCard[] | undefined, ready: boolean): void {
  const reduced = useReducedMotion();
  const awards = (shown ?? []).flatMap((c) =>
    c.kind === "celebration" && c.notificationId && c.celebrationType ? [{ _id: c.notificationId, type: c.celebrationType }] : [],
  );
  const key = awardsToCelebrate(awards, new Set()).join(" ");

  useEffect(() => {
    if (!ready || !key) return;
    const fresh = awardsToCelebrate(awards, celebratedIds());
    if (fresh.length === 0) return;
    // A beat after the cards land, so the burst reads as theirs.
    const timer = setTimeout(() => {
      rememberCelebrated(fresh);
      throwConfetti(reduced);
    }, 450);
    return () => clearTimeout(timer);
    // `awards` is rebuilt every render; `key` (the awards on show) is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, reduced]);
}
