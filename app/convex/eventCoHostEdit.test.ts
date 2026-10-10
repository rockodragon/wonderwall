// A co-host edits everything an organizer does (Rick, 2026-10-10: David, a
// co-host, "should be able to make any edits, including description,
// dates, location, setup"): the real events.update, addCoHost and
// removeCoHost against the in-memory ctx. Only cancelling stays the
// organizer's.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { addCoHost, cancel, removeCoHost, update } from "./events";

const RICK = "users:rick";
const DAVID = "users:david";
const DAY = 24 * 60 * 60 * 1000;
const start = Date.now() + 7 * DAY;

function world() {
  return makeCtx(
    {
      users: [{ _id: RICK }, { _id: DAVID }, { _id: "users:jo" }],
      profiles: [
        { _id: "profiles:rick", userId: RICK, name: "Rick" },
        { _id: "profiles:david", userId: DAVID, name: "David" },
        { _id: "profiles:jo", userId: "users:jo", name: "Jo" },
      ],
      events: [
        {
          _id: "events:cr",
          title: "Creative Renaissance",
          description: "Old words",
          datetime: start,
          organizerId: RICK,
          coHostIds: [DAVID],
          status: "published",
          tags: [],
          requiresApproval: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
    DAVID,
  );
}

describe("a co-host", () => {
  it("changes the description, dates, location and tickets", async () => {
    const ctx = world();
    await run(update, ctx, {
      eventId: "events:cr",
      title: "Creative Renaissance — San Diego",
      description: "New words",
      datetime: start + DAY,
      endTime: start + DAY + 3 * 60 * 60 * 1000,
      location: "The Grove",
      locationType: "in_person",
      tags: ["art"],
      requiresApproval: false,
      ticketTiers: [{ name: "General", priceCents: 2500 }],
    });
    const saved = ctx.store.events[0];
    expect(saved).toMatchObject({
      title: "Creative Renaissance — San Diego",
      description: "New words",
      datetime: start + DAY,
      location: "The Grove",
    });
    expect(saved.ticketTiers).toEqual([expect.objectContaining({ name: "General", priceCents: 2500 })]);
  });

  it("adds and removes co-hosts", async () => {
    const ctx = world();
    await run(addCoHost, ctx, { eventId: "events:cr", userId: "users:jo" });
    expect(ctx.store.events[0].coHostIds).toEqual([DAVID, "users:jo"]);
    await run(removeCoHost, ctx, { eventId: "events:cr", userId: "users:jo" });
    expect(ctx.store.events[0].coHostIds).toEqual([DAVID]);
  });

  it("can't cancel it", async () => {
    await expect(run(cancel, world(), { eventId: "events:cr" })).rejects.toThrow(/Not authorized/);
  });
});
