import { describe, expect, it } from "vitest";
import { CLAIMS } from "../constants/claims";
import { SOPHIA_FUND_SLUG } from "../lib/namedFunds";
import { fundFrom, toDeskInput, type DeskRaw } from "./deskInput";

const money = (cents: number) => `$${cents / 100}`;

describe("fundFrom", () => {
  it("adds the seed the Sophia Fund holds outside the ledger to its balance", () => {
    const fund = fundFrom({ org: { slug: SOPHIA_FUND_SLUG, name: "Abiding Practice" }, balanceCents: 250_000 });
    expect(fund).toEqual({
      slug: SOPHIA_FUND_SLUG,
      name: "The Sophia Fund",
      orgName: "Abiding Practice",
      availableCents: 1_250_000,
      openCall: CLAIMS.sophiaSchedule,
    });
  });

  it("has no card for an org that isn't a named fund, or no page", () => {
    expect(fundFrom({ org: { slug: "somewhere-else", name: "Elsewhere" }, balanceCents: 5 })).toBeNull();
    expect(fundFrom(null)).toBeNull();
    expect(fundFrom(undefined)).toBeNull();
  });
});

describe("toDeskInput", () => {
  const empty: DeskRaw = { updates: undefined, events: undefined, projects: undefined, fundPage: undefined, favorites: undefined, giving: undefined };

  it("reads a desk that hasn't loaded as an empty one", () => {
    expect(toDeskInput(empty, 42, money)).toEqual({
      now: 42,
      updates: [],
      events: [],
      people: [],
      projects: [],
      fund: null,
      grant: null,
      formatMoney: money,
    });
  });

  it("takes the followed people, skipping holes", () => {
    const input = toDeskInput(
      {
        ...empty,
        favorites: {
          profiles: [null, { profile: { _id: "p1", name: "Dana", imageUrl: null, interests: ["music"] } }],
        },
      },
      0,
      money,
    );
    expect(input.people).toEqual([{ _id: "p1", name: "Dana", imageUrl: null, interests: ["music"] }]);
  });

  it("hands the Updates through in the order the server gave", () => {
    const updates = [
      { _id: "u2", title: "Second", body: "b", imageUrl: null, actionLabel: null, actionUrl: null },
      { _id: "u1", title: "First", body: "b", imageUrl: "https://img/u1.jpg", actionLabel: "Go", actionUrl: "/events" },
    ];
    expect(toDeskInput({ ...empty, updates }, 0, money).updates).toEqual(updates);
  });

  it("offers the first open grant and no other", () => {
    expect(toDeskInput({ ...empty, giving: { open: [{ amountCents: 500 }, { amountCents: 900 }] } }, 0, money).grant).toEqual({ amountCents: 500 });
    expect(toDeskInput({ ...empty, giving: { open: [] } }, 0, money).grant).toBeNull();
    expect(toDeskInput({ ...empty, giving: null }, 0, money).grant).toBeNull();
  });
});
