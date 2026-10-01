// Fund plus-up link helpers for the Sophia Fund's own Stripe Payment Links
// (member-directed-giving.md, "The plus-up"). No server imports, so /give
// can build the link in the browser; the AP webhook (apGifts.ts) parses
// what comes back on `client_reference_id` and attributes the gift to the
// member and the monthly amount that prompted it. Same shape and reasoning
// as ticketLink.ts's buildTicketLink/parseTicketRef.

const REF_ID_RE = /^[A-Za-z0-9_-]+$/;
const REF_MAX_LENGTH = 200; // Stripe's client_reference_id limit

export interface GiftRef {
  memberGiftId: string;
  userId: string;
}

/** `gift-<memberGiftId>-u-<userId>` on the Payment Link. Convex ids are
 * alphanumeric with no hyphens, so `-u-` splits unambiguously. */
export function buildFundPlusUpLink(
  paymentLinkUrl: string,
  ref: GiftRef,
  opts: { email?: string } = {},
): string {
  const value = `gift-${ref.memberGiftId}-u-${ref.userId}`.slice(0, REF_MAX_LENGTH);
  const url = new URL(paymentLinkUrl);
  url.searchParams.set("client_reference_id", value);
  if (opts.email) url.searchParams.set("prefilled_email", opts.email);
  return url.toString();
}

/** Inverse of buildFundPlusUpLink; null for anything that isn't exactly
 * that shape, so an unrelated session is none of our business. */
export function parseGiftRef(ref: string | null | undefined): GiftRef | null {
  if (!ref || !ref.startsWith("gift-")) return null;
  const parts = ref.slice(5).split("-u-");
  if (parts.length !== 2) return null;
  const [memberGiftId, userId] = parts;
  if (!memberGiftId || !REF_ID_RE.test(memberGiftId)) return null;
  if (!userId || !REF_ID_RE.test(userId)) return null;
  return { memberGiftId, userId };
}
