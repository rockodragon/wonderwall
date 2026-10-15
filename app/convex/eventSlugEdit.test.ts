import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { update } from "./events";

const RICK = "users:rick";
const start = Date.now() + 7 * 86400000;
const base = { description: "d", datetime: start, tags: [], requiresApproval: false, status: "published", createdAt: 1, updatedAt: 1 };

function world(extra: Record<string, unknown> = {}) {
  return makeCtx(
    {
      users: [{ _id: RICK }],
      profiles: [{ _id: "profiles:rick", userId: RICK, name: "Rick" }],
      events: [
        { _id: "events:a", title: "Creative Renaissance", organizerId: RICK, ...base, ...extra },
        { _id: "events:b", title: "Other", organizerId: RICK, slug: "taken-nov1", ...base },
      ],
    },
    RICK,
  );
}
const args = (o: Record<string, unknown>) => ({
  eventId: "events:a", title: "Creative Renaissance", description: "d", datetime: start, tags: [], requiresApproval: false, ...o,
});

describe("saving an event's ticket link with a slug", () => {
  it("saves a Stripe link on an event with no slug yet", async () => {
    const ctx = world();
    await run(update, ctx, args({ externalTicketUrl: "https://buy.stripe.com/abc", externalTicketPriceCents: 2000, ticketTiers: [], slug: "" }));
    const row = await ctx.db.get("events:a" as never) as any;
    expect(row.externalTicketUrl).toBe("https://buy.stripe.com/abc");
    expect(row.slug).toMatch(/^creative-renaissance-/);
  });

  it("keeps a typed slug and refuses a taken one in words", async () => {
    const ctx = world();
    await run(update, ctx, args({ slug: "Renaissance Nov6" }));
    expect(((await ctx.db.get("events:a" as never)) as any).slug).toBe("renaissance-nov6");
    await expect(run(update, ctx, args({ slug: "taken-nov1" }))).rejects.toMatchObject({ data: { code: "slug_taken" } });
  });
});
