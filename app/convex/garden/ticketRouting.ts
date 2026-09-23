// Where an event's ticket money lands.
//
// The platform runs more than one legal entity (docs/entity-structure-
// research.md): a for-profit that owns the business, and 501(c)(3)s —
// Abiding Practice today — that hold charitable money. A ticket to a
// fundraiser FOR the grant fund is charitable money and must settle in the
// nonprofit's own Stripe account. A ticket to an ordinary for-profit event
// settles in the platform account. Getting that backwards is a tax problem,
// not a bug you can patch next week, so the rule lives here as one pure
// function with tests rather than inline in a Stripe action.
//
// The mechanism is Stripe Connect destination charges: the platform creates
// the PaymentIntent, `on_behalf_of` makes the connected account the merchant
// of record (so the statement descriptor and the 1099 are theirs), and
// `transfer_data.destination` settles the funds there.
//
// THE SAFETY PROPERTY, and the reason this refuses instead of falling back:
// an event that names a beneficiary whose Stripe account isn't connected
// yet must NOT sell tickets into the platform account "for now." That would
// put charitable money in the for-profit's balance and leave someone
// reconciling it by hand afterward. A refused sale is recoverable; misfiled
// charitable revenue is the thing the entity structure exists to prevent.

/** The beneficiary as the checkout action sees it — just the fields the
    decision needs, so this stays testable without a Convex context. */
export type Beneficiary = {
  name: string;
  /** The connected Stripe account (acct_…), once onboarding is finished. */
  stripeConnectAccountId?: string;
  /** "501c3" | "for_profit". Recorded on the purchase so a receipt can say
      the right thing later; it does not by itself choose the account. */
  taxStatus?: string;
};

export type TicketRouting =
  | {
      ok: true;
      /** Absent = settle in the platform account (the for-profit default). */
      destinationAccountId?: string;
      beneficiaryTaxStatus?: string;
    }
  | { ok: false; reason: string };

/**
 * Decide where one ticket's money settles.
 *
 * - No beneficiary named → the platform account. An event nobody attached to
 *   an org is ordinary platform revenue, and that is an explicit choice
 *   rather than a fallback.
 * - Beneficiary with a connected account → that account.
 * - Beneficiary WITHOUT a connected account → refuse, with a message an
 *   organizer can act on. See the safety property above.
 */
export function routeTicketMoney(
  beneficiary: Beneficiary | null | undefined,
): TicketRouting {
  if (!beneficiary) return { ok: true };

  if (!beneficiary.stripeConnectAccountId) {
    return {
      ok: false,
      reason: `${beneficiary.name} hasn't finished connecting its Stripe account, so tickets for this event can't be sold yet. Nothing is charged until that's done.`,
    };
  }

  return {
    ok: true,
    destinationAccountId: beneficiary.stripeConnectAccountId,
    beneficiaryTaxStatus: beneficiary.taxStatus,
  };
}

/**
 * Whether a receipt for this purchase has to carry charitable-deduction
 * language. Only 501(c)(3) beneficiaries do.
 *
 * NOTE: the amount deductible is the ticket price MINUS the fair market
 * value of what the buyer receives (the evening, the food), which is a
 * number a CPA sets per event — not something this code can compute. This
 * only answers whether the question applies at all.
 */
export function needsCharitableReceipt(taxStatus?: string): boolean {
  return taxStatus === "501c3";
}
