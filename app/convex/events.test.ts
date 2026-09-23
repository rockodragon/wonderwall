// Pure-logic tests for events.ts: end-time validation and ticket-tier
// shape/normalization. No Convex, no network — same style as
// garden/eventRsvps.test.ts.

import { describe, expect, it } from "vitest";
import {
  MAX_TICKET_TIERS,
  normalizeMediaUrl,
  normalizeTicketTiers,
  validateEndTime,
  type TicketTierInput,
} from "./events";

describe("normalizeMediaUrl", () => {
  it("treats blank as no link", () => {
    expect(normalizeMediaUrl(undefined)).toEqual({ mediaUrl: undefined });
    expect(normalizeMediaUrl("   ")).toEqual({ mediaUrl: undefined });
  });

  it("stores a pasted reel in its canonical form, share token dropped", () => {
    expect(
      normalizeMediaUrl("https://www.instagram.com/reel/DdSHmHWSDFn/?stkn=bG0xZ2VsM2dmMDM0"),
    ).toEqual({ mediaUrl: "https://www.instagram.com/reel/DdSHmHWSDFn/" });
  });

  it("gives a bare host its scheme and keeps an ordinary page as typed", () => {
    expect(normalizeMediaUrl("vimeo.com/123456789")).toEqual({
      mediaUrl: "https://vimeo.com/123456789",
    });
    expect(normalizeMediaUrl("https://example.com/flyer")).toEqual({
      mediaUrl: "https://example.com/flyer",
    });
  });

  it("refuses a link that is not a web address", () => {
    expect(normalizeMediaUrl("javascript:alert(1)").error).toBeTruthy();
    expect(normalizeMediaUrl("javascript:alert(1)").mediaUrl).toBeUndefined();
  });
});

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
