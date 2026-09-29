// Ticket link helpers for AP's Stripe Payment Link. No server imports, so
// the event page (app/routes/event.tsx) can use buildTicketLink in the
// browser; the webhook (apGifts.ts) uses parseTicketRef.

// ——— Ticket link: builds the URL a buyer clicks, and parses what comes
// back on `client_reference_id` ———

const TICKET_REF_ID_RE = /^[A-Za-z0-9_-]+$/;
const TICKET_REF_MAX_LENGTH = 200; // Stripe's client_reference_id limit

export interface TicketRef {
  eventId: string;
  userId?: string;
}

/** Appends `client_reference_id` (and `prefilled_email` when known) to an
 * event's externalTicketUrl (events.ts's normalizeExternalTicket already
 * verified it's a buy.stripe.com link). The ref format is
 * `evt-<eventId>` or `evt-<eventId>-u-<userId>` — Convex ids are already
 * alphanumeric with no hyphens, so splitting on the first `-u-` is
 * unambiguous; parseTicketRef below is the inverse. */
export function buildTicketLink(
  externalTicketUrl: string,
  eventId: string,
  opts: { userId?: string; email?: string } = {},
): string {
  const ref = (opts.userId ? `evt-${eventId}-u-${opts.userId}` : `evt-${eventId}`).slice(
    0,
    TICKET_REF_MAX_LENGTH,
  );
  const url = new URL(externalTicketUrl);
  url.searchParams.set("client_reference_id", ref);
  if (opts.email) url.searchParams.set("prefilled_email", opts.email);
  return url.toString();
}

/** Inverse of buildTicketLink. Anything that isn't exactly that shape
 * (a ref from an unrelated Payment Link, or a malformed one) returns null
 * so the webhook treats the session as none of its business rather than
 * guessing at a partial match. */
export function parseTicketRef(ref: string | null | undefined): TicketRef | null {
  if (!ref || !ref.startsWith("evt-")) return null;

  const rest = ref.slice(4);
  const parts = rest.split("-u-");
  if (parts.length > 2) return null;

  const [eventId, userId] = parts;
  if (!eventId || !TICKET_REF_ID_RE.test(eventId)) return null;
  if (userId !== undefined && !TICKET_REF_ID_RE.test(userId)) return null;

  return { eventId, userId };
}

// ——— Checkout session ids (the claim-by-session flow in eventRsvps.ts) ———

const CHECKOUT_SESSION_RE = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;

export function isCheckoutSessionId(id: unknown): id is string {
  return typeof id === "string" && CHECKOUT_SESSION_RE.test(id);
}

export type TicketClaimResult =
  | "claimed" // attached to this account now
  | "already_yours"
  | "not_found" // webhook hasn't landed yet (or never will) — try again later
  | "taken"; // on another account
