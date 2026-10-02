// The one place the Shortlist's data is read. The desk's Shortlist view, Today
// and the palette (its dot and its stack's counts) all call this, so they
// share one subscription and one clock (useNow), and can never disagree about
// what needs you.

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { useNow } from "../../hooks/useNow";
import { needsYou, type NeedsYouItem } from "./needsYou";
import { summary, type ShortlistSummary } from "./model";
import type { ShortlistData } from "./types";

export type ShortlistState =
  | { status: "loading" }
  | { status: "ready"; data: ShortlistData; needs: NeedsYouItem[]; summary: ShortlistSummary; now: number };

/** The signed-in member's Shortlist. Pass `false` to skip the query (signed out). */
export function useShortlist(enabled = true): ShortlistState {
  const data = useQuery(api.shortlist.getMine, enabled ? {} : "skip");
  // The shared clock, not Date.now() here: it moves once a minute, the same
  // for every reader, so the 7-day windows move on while the member is here.
  const now = useNow();
  return useMemo(() => {
    if (!data) return { status: "loading" };
    return { status: "ready", data, needs: needsYou(data, now), summary: summary(data, now), now };
  }, [data, now]);
}
