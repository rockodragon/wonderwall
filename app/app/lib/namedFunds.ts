// Funds that carry their own name and a short note, keyed by the org's slug.
// Moved out of routes/fund.$slug.tsx so the fund page and the desk's fund card
// read one constant (docs/features/desktop-desk-palette.md).

import { CLAIMS } from "../constants/claims";

/** The Sophia Fund's host org (Abiding Practice). */
export const SOPHIA_FUND_SLUG = "abiding-practice";

export type NamedFund = { name: string; about: string; openCall?: string; seedCents?: number };

export const NAMED_FUNDS: Record<string, NamedFund> = {
  [SOPHIA_FUND_SLUG]: {
    name: "The Sophia Grant Fund",
    openCall: CLAIMS.sophiaSchedule,
    // Money the fund holds that isn't in this ledger (Rick, 2026-09-29).
    // Tickets and gifts recorded here add to it; grants made come off it.
    // If it's ever entered as a ledger row, remove it here or it counts twice.
    seedCents: 1_000_000,
    about:
      "Sophia means wisdom in Greek. The fund carries the name of Sophia, a young Christian creative.",
  },
};

/** What a fund has to give, the way its page computes it: the seed it holds
 *  outside the ledger (named funds only) plus the ledger's balance. */
export function availableCents(slug: string, balanceCents: number): number {
  return (NAMED_FUNDS[slug]?.seedCents ?? 0) + balanceCents;
}
