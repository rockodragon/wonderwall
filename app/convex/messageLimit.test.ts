import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { coldLimitMessage, coldMessageLimit, isHostsGuest, sendMessage } from "./messaging";

describe("cold message limit", () => {
  it("gives members ten times the free limit", () => {
    expect(coldMessageLimit(false)).toBe(5);
    expect(coldMessageLimit(true)).toBe(50);
  });

  it("tells a free account that replies don't count and members get more", () => {
    expect(coldLimitMessage(false)).toContain("Replies don't count");
    expect(coldLimitMessage(false)).toContain("Members can send 50");
    expect(coldLimitMessage(true)).not.toContain("Members can send");
  });
});

// The real sendMessage against the in-memory ctx: a host on the free limit
// (5 cold messages a day) writing to people on their own event's guest list.
describe("a host writing to their own guests", () => {
  const HOST = "users:host";
  const strangers = Array.from({ length: 6 }, (_, i) => `users:s${i}`);
  const guests = ["users:rsvp", "users:applicant", "users:buyer"];

  function world() {
    return makeCtx(
      {
        users: [HOST, ...strangers, ...guests, "users:other"].map((id) => ({ _id: id })),
        profiles: [{ _id: "profiles:host", userId: HOST, name: "Host" }],
        events: [
          { _id: "events:mine", organizerId: HOST, title: "Mine", status: "published" },
          { _id: "events:theirs", organizerId: "users:other", title: "Theirs", status: "published" },
        ],
        eventRsvps: [
          { _id: "eventRsvps:1", eventId: "events:mine", userId: "users:rsvp", email: "r@x.com" },
          { _id: "eventRsvps:2", eventId: "events:theirs", userId: strangers[5], email: "s@x.com" },
        ],
        eventApplications: [
          { _id: "eventApplications:1", eventId: "events:mine", applicantId: "users:applicant", status: "pending" },
        ],
        ticketPurchases: [
          { _id: "ticketPurchases:1", eventId: "events:mine", userId: "users:buyer", status: "paid" },
        ],
      },
      HOST,
    );
  }
  const send = (ctx: unknown, recipientId: string) =>
    run(sendMessage, ctx, { recipientId, content: "Hi" });

  it("never counts toward the cold limit, and doesn't use it up", async () => {
    const ctx = world();
    for (const g of guests) await send(ctx, g);
    for (const s of strangers.slice(0, 5)) await send(ctx, s);
    // Five cold messages sent: the guests are still reachable…
    for (const g of guests) await send(ctx, g);
    // …and a sixth stranger isn't, even one who is a guest at someone else's event.
    await expect(send(ctx, strangers[5])).rejects.toThrow(/5 messages today/);
  });

  it("isHostsGuest: RSVPs, requests to join and paid tickets on events they host", async () => {
    const ctx = world();
    for (const g of guests) expect(await isHostsGuest(ctx, HOST as never, g as never)).toBe(true);
    expect(await isHostsGuest(ctx, HOST as never, strangers[5] as never)).toBe(false);
    expect(await isHostsGuest(ctx, "users:other" as never, "users:rsvp" as never)).toBe(false);
  });
});
