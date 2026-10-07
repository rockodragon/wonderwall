// What an event asks of the person looking at it, decided once. The event
// page's right column and phone block (routes/event.tsx), the events grid
// (components/EventCard.tsx), the desk's cards (desk/deskCards.ts) and the
// community list (routes/events_.garden._index.tsx) all read it from here, so
// they cannot disagree about whether an event sells tickets, sends people to
// another site, or just takes an RSVP. Pure.
//
// Order of the answer, first match wins:
//   cancelled   nothing to do; it is not happening
//   ended       over (convex/eventWindow.ts); one that's on right now isn't
//   external    the organizer's link to tickets or an RSVP on another site
//               (events.externalTicketUrl): Eventbrite, Partiful, a Stripe
//               Payment Link... `stripe` marks that last one, which keeps its
//               own wording and ticket-claim behavior
//   tiers       tickets sold on this site (ticket tiers, or a plain paid
//               price). `entry` is still the viewer's way in alongside them,
//               because a free RSVP works next to paid tiers
//   applied     the viewer already has an application or RSVP
//   apply       the event needs the host's approval
//   join        a signed-in viewer can join
//   guestRsvp   a signed-out viewer RSVPs with a code
//   none        nothing to offer yet: the viewer hosts it, or sign-in is
//               still resolving

import { eventHasEnded } from "../../convex/eventWindow";
import { isStripePaymentLink } from "../../convex/garden/ticketLink";

/** A ticket tier as the events table stores it (convex/schema.ts). */
export type EventTierLike = {
  name?: string;
  priceCents: number;
  description?: string;
  quantity?: number;
};

export type EventCtaEvent = {
  datetime: number;
  endTime?: number | null;
  status?: string | null;
  requiresApproval?: boolean | null;
  ticketTiers?: readonly EventTierLike[] | null;
  externalTicketUrl?: string | null;
  /** Display only: the real price lives on the other site. */
  externalTicketPriceCents?: number | null;
  accessType?: string | null;
  priceCents?: number | null;
};

export type EventCtaContext = {
  /** The clock. Leave it off and "ended" is never the answer (a caller with
   *  no clock of its own, such as the shortlist's lookup). */
  now?: number;
  /** "member" (the default) is signed in; "unknown" is sign-in still
   *  resolving, which must not flash the guest RSVP at a member. */
  who?: "member" | "guest" | "unknown";
  isOrganizer?: boolean;
  /** The viewer's own application or RSVP, if any (events.get userApplication). */
  application?: { status: string } | null;
};

export type ApplicationStatus = "accepted" | "declined" | "pending";

export type EventEntry =
  | { kind: "applied"; status: ApplicationStatus }
  | { kind: "apply" }
  | { kind: "join" }
  | { kind: "guestRsvp" }
  | { kind: "none" };

export type EventCta =
  | { kind: "cancelled" }
  | { kind: "ended" }
  | {
      kind: "external";
      href: string;
      /** "eventbrite.com": the host without www. */
      host: string;
      priceCents: number | null;
      /** A Stripe Payment Link (garden/ticketLink.ts isStripePaymentLink). */
      stripe: boolean;
    }
  | { kind: "tiers"; entry: EventEntry }
  | EventEntry;

// ——— Prices ———
// Shown with formatDollars (convex/eventGuests.ts): "$25", "$12.50", "$1,500".

/** The price on a paid event, in cents, or null for a free one. */
function paidPriceCents(e: Pick<EventCtaEvent, "accessType" | "priceCents">): number | null {
  return e.accessType === "paid" && (e.priceCents ?? 0) > 0 ? (e.priceCents as number) : null;
}

/** The headline price in cents, or null when none is known: the other
 *  site's price if the organizer set one, else the cheapest tier, else a
 *  plain paid price. What a card's price chip and a list's cost line show. */
export function eventPriceCents(
  e: Pick<EventCtaEvent, "externalTicketPriceCents" | "ticketTiers" | "accessType" | "priceCents">,
): number | null {
  const external = e.externalTicketPriceCents ?? 0;
  if (external > 0) return external;
  const tiers = e.ticketTiers ?? [];
  if (tiers.length > 0) {
    const cheapest = Math.min(...tiers.map((t) => t.priceCents));
    if (cheapest > 0) return cheapest;
  }
  return paidPriceCents(e);
}

// ——— The answer ———

/** "eventbrite.com" for https://www.eventbrite.com/e/1, or null for anything
 *  that isn't an https link. */
export function ticketLinkHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

function applicationStatus(status: string): ApplicationStatus {
  return status === "accepted" || status === "declined" ? status : "pending";
}

function entryCta(e: EventCtaEvent, ctx: EventCtaContext): EventEntry {
  if (ctx.application) return { kind: "applied", status: applicationStatus(ctx.application.status) };
  if (ctx.isOrganizer) return { kind: "none" };
  const who = ctx.who ?? "member";
  if (who === "guest") return { kind: "guestRsvp" };
  if (who === "unknown") return { kind: "none" };
  return e.requiresApproval ? { kind: "apply" } : { kind: "join" };
}

export function eventCta(e: EventCtaEvent, ctx: EventCtaContext = {}): EventCta {
  if (e.status === "cancelled") return { kind: "cancelled" };
  if (ctx.now !== undefined && eventHasEnded(e, ctx.now)) return { kind: "ended" };

  const href = e.externalTicketUrl?.trim();
  const host = href ? ticketLinkHost(href) : null;
  if (href && host) {
    const price = e.externalTicketPriceCents ?? 0;
    return {
      kind: "external",
      href,
      host,
      priceCents: price > 0 ? price : null,
      stripe: isStripePaymentLink(href),
    };
  }

  const entry = entryCta(e, ctx);
  const sellsHere = (e.ticketTiers?.length ?? 0) > 0 || paidPriceCents(e) !== null;
  return sellsHere ? { kind: "tiers", entry } : entry;
}

/** The words on a list card's button for this answer (the desk's). Tickets
 *  and the other site's RSVP link both send people to the event page. */
export function ctaLabel(cta: EventCta): string {
  switch (cta.kind) {
    case "cancelled":
    case "ended":
      return "See event";
    case "external":
      return cta.stripe || cta.priceCents !== null ? "Get tickets" : "RSVP";
    case "tiers":
      return "Get tickets";
    case "apply":
      return "Apply to Attend";
    case "applied":
    case "join":
    case "guestRsvp":
    case "none":
      return "I'm going";
  }
}
