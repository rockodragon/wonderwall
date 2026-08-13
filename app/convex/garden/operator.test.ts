// Pure-logic tests for operator.ts's validation helpers. No Convex, no
// network — mirrors eventRsvps.test.ts/coverage.test.ts's style.

import { describe, expect, it } from "vitest";
import {
  isValidDurationMins,
  isValidPriceCents,
  isValidSeats,
  isValidSlug,
  normalizeCoverageCode,
  parseStartsAtMs,
} from "./operator";

describe("isValidSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(isValidSlug("tuesday-critique")).toBe(true);
    expect(isValidSlug("open-mic")).toBe(true);
    expect(isValidSlug("solo")).toBe(true);
  });

  it.each([
    "Tuesday-Critique", // uppercase
    "tuesday_critique", // underscore
    "tuesday--critique", // double hyphen
    "-tuesday", // leading hyphen
    "tuesday-", // trailing hyphen
    "tuesday critique", // space
    "",
  ])("rejects %j", (bad) => {
    expect(isValidSlug(bad)).toBe(false);
  });
});

describe("normalizeCoverageCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeCoverageCode("  grace-fall ")).toBe("GRACE-FALL");
  });

  it("empty/whitespace-only normalizes to empty string", () => {
    expect(normalizeCoverageCode("   ")).toBe("");
  });
});

describe("isValidSeats", () => {
  it("accepts positive whole numbers", () => {
    expect(isValidSeats(1)).toBe(true);
    expect(isValidSeats(25)).toBe(true);
  });

  it.each([0, -1, 1.5, NaN])("rejects %j", (bad) => {
    expect(isValidSeats(bad)).toBe(false);
  });
});

describe("isValidPriceCents", () => {
  it("accepts zero (free) and positive whole cents", () => {
    expect(isValidPriceCents(0)).toBe(true);
    expect(isValidPriceCents(4900)).toBe(true);
  });

  it.each([-1, 1.5, NaN])("rejects %j", (bad) => {
    expect(isValidPriceCents(bad)).toBe(false);
  });
});

describe("isValidDurationMins", () => {
  it("accepts positive whole minutes", () => {
    expect(isValidDurationMins(60)).toBe(true);
  });

  it.each([0, -30, 45.5, NaN])("rejects %j", (bad) => {
    expect(isValidDurationMins(bad)).toBe(false);
  });
});

describe("parseStartsAtMs", () => {
  it("parses a datetime-local value to epoch ms", () => {
    const ms = parseStartsAtMs("2026-08-20T19:00");
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).getUTCFullYear()).toBe(2026);
  });

  it("rejects an unparseable string", () => {
    expect(parseStartsAtMs("not-a-date")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(parseStartsAtMs("")).toBeNull();
    expect(parseStartsAtMs("   ")).toBeNull();
  });
});
