// The server's half of FF_BACKING (app/lib/featureFlags.ts). Backing a
// project with money is held back until Stripe Connect payouts are proven
// and Stripe's crowdfunding approval is settled (beads sc15, fpmn;
// docs/features/backing-payouts.md). The page hides every way to pay, but
// the page is not the gate: this is, and every function that starts a money
// backing calls it before it talks to Stripe or writes a row.
//
// Deliberately NOT called from the Stripe webhook (stripeHandlers.ts): a
// checkout that was already paid must still be recorded, whatever the flag
// says.

import { FF_BACKING } from "../../app/lib/featureFlags";
import { fail } from "../errors";

export const BACKING_NOT_OPEN_REASON =
  "Backing isn't open yet — we're still setting up how creatives get paid. Nothing was charged.";

/** Refuses, with a reason the page can show, while backing is off. */
export function requireBackingOpen(): void {
  if (!FF_BACKING) fail("backing_not_open", BACKING_NOT_OPEN_REASON);
}
