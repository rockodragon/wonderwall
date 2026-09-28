// Pure-logic tests for events.ts: end-time validation and ticket-tier
// shape/normalization. No Convex, no network — same style as
// garden/eventRsvps.test.ts.

import { describe, expect, it } from "vitest";
import {
  MAX_TICKET_TIERS,
  normalizeExternalTicket,
  normalizeTicketTiers,
  validateEndTime,
  isFreeEvent,
  type TicketTierInput,
} from "./events";

// The pasted media link's canonical form is shared with artifacts and
// projects, so its cases live with the helper: linkPreview.test.ts.

const START = new Date("2026-11-06T18:00:00").getTime();

describe("validateEndTime", () => {
  it("no end time is valid (existing single-timestamp events keep working)", () => {
    expect(validateEndTime(START, undefined)).toBeNull();
  });

  it("end after start is valid", () => {
    expect(validateEndTime(START, START + 3 * 60 * 60 * 1000)).toBeNull();
  });

  it("end equal to start is rejected", () => {
    expect(validateEndTime(START, START)).toMatch(/after the start/);
  });

  it("end before start is rejected", () => {
    expect(validateEndTime(START, START - 1)).toMatch(/after the start/);
  });
});

describe("normalizeTicketTiers", () => {
  const general: TicketTierInput = { name: "General", priceCents: 2500 };

  it("undefined and empty both normalize to no field at all", () => {
    expect(normalizeTicketTiers(undefined)).toEqual({ tiers: undefined });
    expect(normalizeTicketTiers([])).toEqual({ tiers: undefined });
  });

  it("keeps a valid tier list in order (General $25 · Patron $100 · Table $500)", () => {
    const { tiers, error } = normalizeTicketTiers([
      general,
      { name: "Patron", priceCents: 10000, description: "Front row" },
      { name: "Table", priceCents: 50000, quantity: 10 },
    ]);
    expect(error).toBeUndefined();
    expect(tiers?.map((t) => t.name)).toEqual(["General", "Patron", "Table"]);
    expect(tiers?.[2]).toEqual({
      name: "Table",
      priceCents: 50000,
      description: undefined,
      quantity: 10,
    });
  });

  it("trims names and drops empty descriptions", () => {
    const { tiers } = normalizeTicketTiers([
      { name: "  General  ", priceCents: 2500, description: "   " },
    ]);
    expect(tiers?.[0].name).toBe("General");
    expect(tiers?.[0].description).toBeUndefined();
  });

  it("rejects a nameless tier", () => {
    expect(normalizeTicketTiers([{ name: "  ", priceCents: 2500 }]).error).toMatch(
      /needs a name/,
    );
  });

  it("rejects duplicate tier names (case-insensitively)", () => {
    expect(
      normalizeTicketTiers([general, { name: "general", priceCents: 5000 }]).error,
    ).toMatch(/Duplicate/);
  });

  it.each([0, 49, -100, 25.5])(
    "rejects price %s cents (below Stripe's $0.50 minimum or non-integer)",
    (priceCents) => {
      expect(
        normalizeTicketTiers([{ name: "General", priceCents }]).error,
      ).toMatch(/at least \$0\.50/);
    },
  );

  it.each([0, -1, 2.5])("rejects invalid quantity cap %s", (quantity) => {
    expect(
      normalizeTicketTiers([{ name: "General", priceCents: 2500, quantity }])
        .error,
    ).toMatch(/quantity/);
  });

  it("rejects more than the max tier count", () => {
    const many = Array.from({ length: MAX_TICKET_TIERS + 1 }, (_, i) => ({
      name: `Tier ${i}`,
      priceCents: 2500,
    }));
    expect(normalizeTicketTiers(many).error).toMatch(/At most/);
  });
});

describe("normalizeExternalTicket", () => {
  it("no url clears both fields, even if a price was sent", () => {
    expect(normalizeExternalTicket({})).toEqual({});
    expect(normalizeExternalTicket({ url: "  ", priceCents: 2500 })).toEqual({});
  });

  it("accepts a Stripe Payment Link with a price", () => {
    const result = normalizeExternalTicket({
      url: "https://buy.stripe.com/test_abc123",
      priceCents: 2500,
    });
    expect(result).toEqual({
      externalTicketUrl: "https://buy.stripe.com/test_abc123",
      externalTicketPriceCents: 2500,
    });
  });

  it("accepts a Stripe Payment Link with no price (variable-price link)", () => {
    const result = normalizeExternalTicket({ url: "https://buy.stripe.com/test_abc123" });
    expect(result.error).toBeUndefined();
    expect(result.externalTicketPriceCents).toBeUndefined();
  });

  it("trims the url", () => {
    const result = normalizeExternalTicket({ url: "  https://buy.stripe.com/test_abc123  " });
    expect(result.externalTicketUrl).toBe("https://buy.stripe.com/test_abc123");
  });

  it.each([
    "http://buy.stripe.com/test_abc123", // wrong protocol
    "https://stripe.com/test_abc123", // wrong host
    "https://evil.com/buy.stripe.com", // host spoofing attempt in the path
    "not a url",
  ])("rejects a non-Stripe-Payment-Link url: %s", (url) => {
    expect(normalizeExternalTicket({ url }).error).toMatch(/buy\.stripe\.com/);
  });

  it.each([0, -100, 25.5])("rejects an invalid price %s", (priceCents) => {
    expect(
      normalizeExternalTicket({ url: "https://buy.stripe.com/test_abc123", priceCents }).error,
    ).toMatch(/whole number of cents/);
  });
});

// isEventPublic's pure half (garden/eventVisibility.ts): a free event (no
// tiers) is always public and needs no membership lookup at all. The
// membership-dependent half (a ticketed event's organizer must be able to
// sell tickets) hits the DB via getGardenUser/can, so it isn't covered
// here — there's no convex-test harness in this repo (grep turned up
// nothing under convex/), only this pure-function style. See
// garden/capabilities.test.ts for the event.sellTickets matrix row that
// half relies on.
describe("isFreeEvent (ticket-gated visibility, garden/eventVisibility.ts)", () => {
  it("no ticketTiers field at all is free", () => {
    expect(isFreeEvent({ ticketTiers: undefined })).toBe(true);
  });

  it("an empty ticketTiers array is free", () => {
    expect(isFreeEvent({ ticketTiers: [] })).toBe(true);
  });

  it("any ticket tier makes it not free", () => {
    expect(
      isFreeEvent({
        ticketTiers: [{ name: "General", priceCents: 2500 }],
      }),
    ).toBe(false);
  });
});
