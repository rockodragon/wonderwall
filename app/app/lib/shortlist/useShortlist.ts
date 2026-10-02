// The one place the Shortlist's data is read. The desk's Shortlist view, Today
// and the palette (its dot and its stack's counts) all call this, so they
// share one subscription and can never disagree about what needs you.

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { needsYou, type NeedsYouItem } from "./needsYou";
import { summary, type ShortlistSummary } from "./model";
import type { ShortlistData } from "./types";

export type ShortlistState =
  | { status: "loading" }
  | { status: "ready"; data: ShortlistData; needs: NeedsYouItem[]; summary: ShortlistSummary; now: number };

/** The signed-in member's Shortlist. Pass `false` to skip the query (signed out). */
export function useShortlist(enabled = true): ShortlistState {
  const data = useQuery(api.shortlist.getMine, enabled ? {} : "skip");
  return useMemo(() => {
    if (!data) return { status: "loading" };
    // "Now" is read when the data changes, not on every render, so the
    // 7-day windows don't shift under a member mid-session.
    const now = Date.now();
    return { status: "ready", data, needs: needsYou(data, now), summary: summary(data, now), now };
  }, [data]);
}
