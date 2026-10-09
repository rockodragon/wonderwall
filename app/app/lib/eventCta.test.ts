import { describe, expect, it } from "vitest";
import { ctaLabel, eventCta, eventPriceCents, type EventCtaEvent } from "./eventCta";

const HOUR = 60 * 60 * 1000;
const START = new Date(2026, 10, 6, 18).getTime();
const BEFORE = START - 24 * HOUR;
const DURING = START + HOUR;
const AFTER = START + 24 * HOUR;

function event(extra: Partial<EventCtaEvent> = {}): EventCtaEvent {
  return { datetime: START, endTime: START + 3 * HOUR, requiresApproval: false, ...extra };
}

const TIERS = [{ priceCents: 2500 }, { priceCents: 4000 }];

describe("eventCta", () => {
  it("cancelled beats everything", () => {
    const busy = event({
      status: "cancelled",
      externalTicketUrl: "https://buy.stripe.com/x",
      ticketTiers: TIERS,
      requiresApproval: true,
    });
    expect(eventCta(busy, { now: BEFORE, application: { status: "accepted" } })).toEqual({ kind: "cancelled" });
    expect(eventCta(busy, { now: AFTER })).toEqual({ kind: "cancelled" });
  });

  it("is ended once the event has ended, and not while it is on", () => {
    const e = event({ externalTicketUrl: "https://www.eventbrite.com/e/1", ticketTiers: TIERS });
    expect(eventCta(e, { now: AFTER })).toEqual({ kind: "ended" });
    expect(eventCta(e, { now: DURING }).kind).toBe("external");
    expect(eventCta(event(), { now: DURING })).toEqual({ kind: "join" });
  });

  it("without a clock it is never ended", () => {
    expect(eventCta(event(), {}).kind).toBe("join");
  });

  it("is external when a link is set and the event has not ended", () => {
    const cta = eventCta(event({ externalTicketUrl: "https://www.eventbrite.com/e/salon-123", externalTicketPriceCents: 1500 }), { now: BEFORE });
    expect(cta).toEqual({
      kind: "external",
      href: "https://www.eventbrite.com/e/salon-123",
      host: "eventbrite.com",
      priceCents: 1500,
      stripe: false,
      paypal: false,
    });
  });

  it("an external link with no price has none; a Stripe link says so", () => {
    expect(eventCta(event({ externalTicketUrl: "https://partiful.com/e/abc" }), { now: BEFORE })).toMatchObject({
      kind: "external",
      host: "partiful.com",
      priceCents: null,
      stripe: false,
    });
    expect(eventCta(event({ externalTicketUrl: "https://buy.stripe.com/test_abc" }), { now: BEFORE })).toMatchObject({
      kind: "external",
      host: "buy.stripe.com",
      stripe: true,
      paypal: false,
    });
  });

  it("a PayPal pay link says so", () => {
    expect(eventCta(event({ externalTicketUrl: "https://www.paypal.com/ncp/payment/BVJYP3SUBYXWS" }), { now: BEFORE })).toMatchObject({
      kind: "external",
      host: "paypal.com",
      stripe: false,
      paypal: true,
    });
    // Any other PayPal page is just a link out.
    expect(eventCta(event({ externalTicketUrl: "https://www.paypal.com/donate/?hosted_button_id=X" }), { now: BEFORE })).toMatchObject({
      kind: "external",
      paypal: false,
    });
  });

  it("an external link beats the viewer's own application and the tiers", () => {
    const e = event({ externalTicketUrl: "https://partiful.com/e/abc", ticketTiers: TIERS });
    expect(eventCta(e, { now: BEFORE, application: { status: "accepted" } }).kind).toBe("external");
  });

  it("ignores a link that is not https (nothing to send anyone to)", () => {
    expect(eventCta(event({ externalTicketUrl: "javascript:alert(1)" }), { now: BEFORE }).kind).toBe("join");
    expect(eventCta(event({ externalTicketUrl: "http://partiful.com/e/abc" }), { now: BEFORE }).kind).toBe("join");
    expect(eventCta(event({ externalTicketUrl: "  " }), { now: BEFORE }).kind).toBe("join");
  });

  it("is tiers for tiered tickets and a plain paid price, keeping the viewer's way in", () => {
    expect(eventCta(event({ ticketTiers: TIERS }), { now: BEFORE })).toEqual({ kind: "tiers", entry: { kind: "join" } });
    expect(eventCta(event({ accessType: "paid", priceCents: 1500, requiresApproval: true }), { now: BEFORE })).toEqual({
      kind: "tiers",
      entry: { kind: "apply" },
    });
    expect(eventCta(event({ ticketTiers: TIERS }), { now: BEFORE, who: "guest" })).toEqual({
      kind: "tiers",
      entry: { kind: "guestRsvp" },
    });
  });

  it("an empty tier list and a free event are not tiers", () => {
    expect(eventCta(event({ ticketTiers: [] }), { now: BEFORE }).kind).toBe("join");
    expect(eventCta(event({ accessType: "open", priceCents: 1500 }), { now: BEFORE }).kind).toBe("join");
    expect(eventCta(event({ accessType: "paid", priceCents: 0 }), { now: BEFORE }).kind).toBe("join");
  });

  it("needs approval -> apply, else join", () => {
    expect(eventCta(event({ requiresApproval: true }), { now: BEFORE })).toEqual({ kind: "apply" });
    expect(eventCta(event(), { now: BEFORE })).toEqual({ kind: "join" });
  });

  it("a guest RSVPs; a host has nothing to press; unknown sign-in has nothing yet", () => {
    expect(eventCta(event(), { now: BEFORE, who: "guest" })).toEqual({ kind: "guestRsvp" });
    expect(eventCta(event(), { now: BEFORE, isOrganizer: true })).toEqual({ kind: "none" });
    expect(eventCta(event(), { now: BEFORE, who: "unknown" })).toEqual({ kind: "none" });
  });

  it("shows the viewer's own application, however it stands", () => {
    expect(eventCta(event({ requiresApproval: true }), { now: BEFORE, application: { status: "accepted" } })).toEqual({ kind: "applied", status: "accepted" });
    expect(eventCta(event(), { now: BEFORE, application: { status: "declined" } })).toEqual({ kind: "applied", status: "declined" });
    expect(eventCta(event(), { now: BEFORE, application: { status: "pending" } })).toEqual({ kind: "applied", status: "pending" });
    expect(eventCta(event(), { now: BEFORE, application: { status: "waitlisted" } })).toEqual({ kind: "applied", status: "pending" });
  });
});

describe("eventPriceCents", () => {
  it("prefers the other site's price, then the cheapest tier, then a paid price", () => {
    expect(eventPriceCents({ externalTicketPriceCents: 1500, ticketTiers: TIERS })).toBe(1500);
    expect(eventPriceCents({ ticketTiers: TIERS })).toBe(2500);
    expect(eventPriceCents({ externalTicketPriceCents: null, ticketTiers: TIERS, accessType: "paid", priceCents: 900 })).toBe(2500);
    expect(eventPriceCents({ accessType: "paid", priceCents: 900 })).toBe(900);
  });

  it("is null when nothing has a price", () => {
    expect(eventPriceCents({})).toBeNull();
    expect(eventPriceCents({ ticketTiers: [], accessType: "open", priceCents: 900 })).toBeNull();
    expect(eventPriceCents({ accessType: "paid", priceCents: 0 })).toBeNull();
    expect(eventPriceCents({ externalTicketPriceCents: undefined, ticketTiers: null })).toBeNull();
  });
});

describe("eventCta: a full event", () => {
  it("offers the waitlist, or says full, and never turns away someone already in", () => {
    const full = { now: BEFORE, full: true, waitlistOn: true };
    expect(eventCta(event(), full)).toEqual({ kind: "waitlist" });
    expect(eventCta(event(), { ...full, waitlistOn: false })).toEqual({ kind: "full" });
    expect(eventCta(event(), { ...full, waitlisted: true })).toEqual({ kind: "waitlisted" });
    expect(eventCta(event(), { ...full, application: { status: "accepted" } })).toEqual({ kind: "applied", status: "accepted" });
    expect(eventCta(event(), { ...full, who: "guest" })).toEqual({ kind: "waitlist" });
    expect(eventCta(event({ ticketTiers: TIERS }), full)).toEqual({ kind: "tiers", entry: { kind: "waitlist" } });
    expect(ctaLabel(eventCta(event(), full))).toBe("Join the waitlist");
  });
});

describe("ctaLabel", () => {
  it("says what the button on a list card says", () => {
    const at = (extra: Partial<EventCtaEvent>) => ctaLabel(eventCta(event(extra), { now: BEFORE }));
    expect(at({ ticketTiers: TIERS })).toBe("Get tickets");
    expect(at({ externalTicketUrl: "https://buy.stripe.com/x" })).toBe("Get tickets");
    expect(at({ externalTicketUrl: "https://www.paypal.com/ncp/payment/BVJYP3SUBYXWS" })).toBe("Get tickets");
    expect(at({ externalTicketUrl: "https://partiful.com/e/abc", externalTicketPriceCents: 1500 })).toBe("Get tickets");
    expect(at({ externalTicketUrl: "https://partiful.com/e/abc" })).toBe("RSVP");
    expect(at({ requiresApproval: true })).toBe("Apply to Attend");
    expect(at({})).toBe("I'm going");
    expect(at({ status: "cancelled" })).toBe("See event");
    expect(ctaLabel(eventCta(event(), { now: AFTER }))).toBe("See event");
  });
});
