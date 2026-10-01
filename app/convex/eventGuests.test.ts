import { describe, it, expect } from "vitest";
import { mergeGuests, summarizeGuests, guestsToCsv, formatDollars } from "./eventGuests";

describe("mergeGuests", () => {
  it("merges an RSVP and a ticket purchase by email", () => {
    const rows = mergeGuests([
      { name: "Ann", email: "Ann@x.com", status: "going", addedAt: 5 },
      { name: "Ann", email: "ann@x.com", status: "going", paidCents: 2500, addedAt: 9 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].paidCents).toBe(2500);
    expect(rows[0].addedAt).toBe(5);
  });
  it("merges by userId and picks up an email", () => {
    const rows = mergeGuests([
      { userId: "u1", name: "Bo", status: "pending", addedAt: 1 },
      { userId: "u1", name: "Bo", email: "bo@x.com", status: "going", addedAt: 2 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "going", email: "bo@x.com" });
  });
  it("keeps different people apart", () => {
    expect(mergeGuests([
      { name: "A", email: "a@x.com", status: "going", addedAt: 1 },
      { name: "B", email: "b@x.com", status: "going", addedAt: 2 },
    ])).toHaveLength(2);
  });
});

describe("summary and csv", () => {
  it("counts going, paid and collected", () => {
    const rows = mergeGuests([
      { name: "A", email: "a@x.com", status: "going", paidCents: 2500, addedAt: 1 },
      { name: "B", email: "b@x.com", status: "going", addedAt: 2 },
      { name: "C", email: "c@x.com", status: "pending", paidCents: 900, addedAt: 3 },
    ]);
    expect(summarizeGuests(rows)).toEqual({ going: 2, paid: 1, collectedCents: 2500 });
    expect(formatDollars(2550)).toBe("$25.50");
  });
  it("escapes csv cells", () => {
    const csv = guestsToCsv([
      { key: "k", name: 'Smith, "J"', email: "j@x.com", status: "going", paidCents: null, tickets: 1, guestNames: null, addedAt: 0 },
    ]);
    expect(csv.split("\n")[1]).toBe('"Smith, ""J""",j@x.com,going,1,,Free,1970-01-01');
  });
  it("counts every ticket as going, and lists the other guests' names", () => {
    const rows = mergeGuests([
      { name: "A", email: "a@x.com", status: "going", paidCents: 7500, tickets: 3, guestNames: "Ann, Ben", addedAt: 1 },
      { name: "B", email: "b@x.com", status: "going", addedAt: 2 },
    ]);
    expect(summarizeGuests(rows)).toEqual({ going: 4, paid: 1, collectedCents: 7500 });
    expect(guestsToCsv(rows).split("\n")[1]).toBe('A,a@x.com,going,3,"Ann, Ben",$75,1970-01-01');
  });
});
