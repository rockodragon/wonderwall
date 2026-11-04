import { describe, it, expect } from "vitest";
import {
  mergeGuests,
  summarizeGuests,
  guestsToCsv,
  paidLabel,
  roleFromProfile,
  guestMix,
  guestRoleCount,
  guestTagKeys,
  guestKeyOf,
  isTaggableGuestKey,
} from "./eventGuests";
import { formatCents } from "./money";

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
    expect(formatCents(2550)).toBe("$25.50");
  });
  it("writes whole dollars plain, cents when there are some, and groups thousands", () => {
    expect(formatCents(2500)).toBe("$25");
    expect(formatCents(1250)).toBe("$12.50");
    expect(formatCents(150000)).toBe("$1,500");
    expect(formatCents(150050)).toBe("$1,500.50");
  });
  it("escapes csv cells", () => {
    const csv = guestsToCsv([
      { key: "k", userId: null, name: 'Smith, "J"', email: "j@x.com", status: "going", paidCents: null, tickets: 1, guestNames: null, applicationId: null, message: null, addedAt: 0 },
    ]);
    expect(csv.split("\n")[1]).toBe('"Smith, ""J""",j@x.com,,going,1,,Free,1970-01-01');
  });
  it("counts every ticket as going, and lists the other guests' names", () => {
    const rows = mergeGuests([
      { name: "A", email: "a@x.com", status: "going", paidCents: 7500, tickets: 3, guestNames: "Ann, Ben", addedAt: 1 },
      { name: "B", email: "b@x.com", status: "going", addedAt: 2 },
    ]);
    expect(summarizeGuests(rows)).toEqual({ going: 4, paid: 1, collectedCents: 7500 });
    expect(guestsToCsv(rows).split("\n")[1]).toBe('A,a@x.com,,going,3,"Ann, Ben",$75,1970-01-01');
    expect(guestsToCsv([{ ...rows[0], role: "patron" }]).split("\n")[1]).toContain("a@x.com,Patron,going");
  });
});

describe("guest roles", () => {
  it("reads a profile: church first, then the signup pick, then the roles held", () => {
    expect(roleFromProfile({ primaryRole: "creative" }, true)).toBe("church");
    expect(roleFromProfile({ primaryRole: "creative", partnerRole: true }, false)).toBe("creative");
    expect(roleFromProfile({ primaryRole: "patron" }, false)).toBe("patron");
    expect(roleFromProfile({ patronRole: true }, false)).toBe("patron");
    expect(roleFromProfile({ partnerRole: true, patronRole: true }, false)).toBe("partner");
    expect(roleFromProfile({ primaryRole: "creative" }, false)).toBe("creative");
    expect(roleFromProfile({}, false)).toBe("unknown");
    expect(roleFromProfile(null, false)).toBe("unknown");
  });
  it("counts going tickets by role, with no role as unknown", () => {
    const mix = guestMix([
      { status: "going", tickets: 3, role: "patron" },
      { status: "going", tickets: 1, role: "creative" },
      { status: "going", tickets: 2 },
      { status: "pending", tickets: 1, role: "church" },
    ]);
    expect(mix).toEqual({ creative: 1, patron: 3, partner: 0, church: 0, host: 0, unknown: 2 });
  });
  it("says counts the way a host reads them", () => {
    expect(guestRoleCount("church", 1)).toBe("1 church");
    expect(guestRoleCount("church", 0)).toBe("0 churches");
    expect(guestRoleCount("creative", 12)).toBe("12 creatives");
    expect(guestRoleCount("unknown", 27)).toBe("27 unknown");
  });
  it("files a tag under the row's key, its account and its email", () => {
    const [row] = mergeGuests([
      { name: "Di", email: "Di@x.com", status: "going", addedAt: 1 },
      { userId: "u9", name: "Di", email: "di@x.com", status: "going", addedAt: 2 },
    ]);
    expect(row.key).toBe("e:di@x.com");
    expect(guestTagKeys(row)).toEqual(["e:di@x.com", "u:u9"]);
    expect(guestKeyOf({ email: " Di@X.com " })).toBe("e:di@x.com");
    expect(guestKeyOf({ userId: "u9", email: "di@x.com" })).toBe("u:u9");
    expect(guestKeyOf({ email: "" })).toBeNull();
  });
  it("lets a host tag only keys mergeGuests makes", () => {
    expect(isTaggableGuestKey("u:abc")).toBe(true);
    expect(isTaggableGuestKey("e:a@x.com")).toBe(true);
    expect(isTaggableGuestKey("x:3")).toBe(false);
    expect(isTaggableGuestKey("e:nope")).toBe(false);
    expect(isTaggableGuestKey("u:" + "a".repeat(400))).toBe(false);
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

describe("userId and message", () => {
  it("keep the account and the join note so a host can reply", () => {
    const rows = mergeGuests([
      { name: "Di", email: "di@x.com", status: "going", paidCents: 2500, addedAt: 1 },
      { userId: "u9", name: "Di", email: "di@x.com", status: "going", message: "Can't wait", addedAt: 2 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "u9", message: "Can't wait" });
  });
  it("are null for a guest with no account", () => {
    const rows = mergeGuests([{ name: "Ed", email: "ed@x.com", status: "going", addedAt: 1 }]);
    expect(rows[0]).toMatchObject({ userId: null, message: null });
  });
});
