import { describe, expect, it } from "vitest";
import { NAMED_FUNDS, SOPHIA_FUND_SLUG, availableCents } from "./namedFunds";

describe("availableCents", () => {
  it("adds the Sophia Fund's seed to the ledger balance", () => {
    expect(availableCents(SOPHIA_FUND_SLUG, 250_000)).toBe((NAMED_FUNDS[SOPHIA_FUND_SLUG].seedCents ?? 0) + 250_000);
    expect(availableCents(SOPHIA_FUND_SLUG, 0)).toBe(1_000_000);
  });

  it("is just the balance for a fund with no seed", () => {
    expect(availableCents("some-other-fund", 12_300)).toBe(12_300);
  });
});
