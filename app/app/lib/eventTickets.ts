// Whether an event sells tickets, read the same way by the events grid
// (components/EventCard.tsx) and the desk (desk/deskCards.ts). Pure.
//
// routes/event.tsx reads tiers and the Payment Link separately, each for its
// own card, and does not read accessType/priceCents at all; it keeps its own
// checks.

/** The price on a paid event, in cents, or null for a free one. */
export function paidPriceCents(e: { accessType?: string | null; priceCents?: number | null }): number | null {
  return e.accessType === "paid" && (e.priceCents ?? 0) > 0 ? (e.priceCents as number) : null;
}

/** Tiered tickets, a Payment Link, or a plain paid price: a ticket to buy
 *  rather than a seat to take. */
export function isTicketedEvent(e: {
  ticketTiers?: readonly unknown[] | null;
  externalTicketUrl?: string | null;
  accessType?: string | null;
  priceCents?: number | null;
}): boolean {
  return (e.ticketTiers?.length ?? 0) > 0 || !!e.externalTicketUrl || paidPriceCents(e) !== null;
}
