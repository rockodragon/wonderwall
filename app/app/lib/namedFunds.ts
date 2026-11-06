// Funds that carry their own name and a short note, keyed by the org's slug.
// Moved out of routes/fund.$slug.tsx so the fund page and the desk's fund card
// read one constant (docs/features/desktop-desk-palette.md).

import { CLAIMS } from "../constants/claims";
import { GARDEN_ORIGIN } from "../../convex/garden/brandHosts";

/** The Sophia Fund's host org (Abiding Practice). */
export const SOPHIA_FUND_SLUG = "abiding-practice";

export type NamedFund = {
  name: string;
  about: string;
  openCall?: string;
  seedCents?: number;
  /** The fund page's cover picture, shown whole, with its caption under it. */
  cover?: { src: string; alt: string; caption: string };
  /** The card a shared link to the fund page unfurls to (1200×675). */
  shareImage?: string;
};

export const NAMED_FUNDS: Record<string, NamedFund> = {
  [SOPHIA_FUND_SLUG]: {
    name: "The Sophia Grant Fund",
    openCall: CLAIMS.sophiaSchedule,
    // Money the fund holds that isn't in this ledger (Rick, 2026-09-29).
    // Tickets and gifts recorded here add to it; grants made come off it.
    // If it's ever entered as a ledger row, remove it here or it counts twice.
    seedCents: 1_000_000,
    // Rick's words, 2026-11-06.
    about:
      "Named in honor of a young artist who lost her life in a tragic accident, but left behind a great spiritual and creative legacy. The Sophia Grant is awarded to artists whose work fosters deep connection between the human and the Divine. Creating space at the table for sinners and saints to meet with their Maker.",
    cover: {
      src: "/fund/sophia-icon.webp",
      alt: "An icon of Sophia: her portrait under a gold halo, in a gold oval ringed with blue circles, on white with teal flourishes.",
      caption: "The above icon was made in remembrance by her sister Nyla.",
    },
    shareImage: `${GARDEN_ORIGIN}/fund/sophia-share.jpg`,
  },
};

/** What a fund has to give, the way its page computes it: the seed it holds
 *  outside the ledger (named funds only) plus the ledger's balance. */
export function availableCents(slug: string, balanceCents: number): number {
  return (NAMED_FUNDS[slug]?.seedCents ?? 0) + balanceCents;
}
