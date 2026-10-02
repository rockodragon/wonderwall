import { describe, expect, it } from "vitest";
import { isTicketedEvent, paidPriceCents } from "./eventTickets";

describe("paidPriceCents", () => {
  it("is the price of a paid event", () => {
    expect(paidPriceCents({ accessType: "paid", priceCents: 1500 })).toBe(1500);
  });

  it("is null for a free event, or a paid one with no price", () => {
    expect(paidPriceCents({ accessType: "open", priceCents: 1500 })).toBeNull();
    expect(paidPriceCents({ accessType: "paid", priceCents: 0 })).toBeNull();
    expect(paidPriceCents({ accessType: "paid" })).toBeNull();
    expect(paidPriceCents({})).toBeNull();
  });
});

describe("isTicketedEvent", () => {
  it("counts tiers, a Payment Link, and a paid price", () => {
    expect(isTicketedEvent({ ticketTiers: [{}] })).toBe(true);
    expect(isTicketedEvent({ externalTicketUrl: "https://buy.stripe.com/x" })).toBe(true);
    expect(isTicketedEvent({ accessType: "paid", priceCents: 500 })).toBe(true);
  });

  it("doesn't count a free event", () => {
    expect(isTicketedEvent({})).toBe(false);
    expect(isTicketedEvent({ ticketTiers: [], externalTicketUrl: "", accessType: "open" })).toBe(false);
    expect(isTicketedEvent({ ticketTiers: null, externalTicketUrl: null, accessType: null, priceCents: null })).toBe(false);
  });
});
