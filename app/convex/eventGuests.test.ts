import { describe, it, expect } from "vitest";
import { mergeGuests, summarizeGuests, guestsToCsv, formatDollars, paidLabel } from "./eventGuests";

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
  it("writes whole dollars plain, cents when there are some, and groups thousands", () => {
    expect(formatDollars(2500)).toBe("$25");
    expect(formatDollars(1250)).toBe("$12.50");
    expect(formatDollars(150000)).toBe("$1,500");
    expect(formatDollars(150050)).toBe("$1,500.50");
  });
  it("escapes csv cells", () => {
    const csv = guestsToCsv([
      { key: "k", name: 'Smith, "J"', email: "j@x.com", status: "going", paidCents: null, tickets: 1, guestNames: null, applicationId: null, addedAt: 0 },
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

describe("applicationId", () => {
  it("rides along so a host can approve from the list", () => {
    const rows = mergeGuests([{ userId: "u1", name: "Cy", status: "pending", applicationId: "app1", addedAt: 1 }]);
    expect(rows[0].applicationId).toBe("app1");
  });
});

describe("paidLabel and the PayPal mark", () => {
  it("says Sent to PayPal for someone who left for the organizer's PayPal, and Paid once there's money", () => {
    expect(paidLabel({ paidCents: null, sentToPayPal: true })).toBe("Sent to PayPal");
    expect(paidLabel({ paidCents: 3500, sentToPayPal: true })).toBe("Paid $35");
    expect(paidLabel({ paidCents: null })).toBe("Free");
  });
  it("keeps the mark when the same person shows up twice, and puts it in the CSV", () => {
    const rows = mergeGuests([
      { userId: "u1", name: "Ana", email: "a@x.com", status: "pending", addedAt: 1 },
      { userId: "u1", name: "Ana", email: "a@x.com", status: "going", sentToPayPal: true, addedAt: 2 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sentToPayPal).toBe(true);
    expect(guestsToCsv(rows).split("\n")[1]).toContain("Sent to PayPal");
  });
});
