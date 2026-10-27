import { describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { redeemBySlug } from "./invites";

function world(viewerId = "users:new") {
  return makeCtx({
    users: [{ _id: "users:host", email: "host@example.com" }, { _id: "users:new", email: "new@example.com" }],
    profiles: [
      { _id: "profiles:host", userId: "users:host", name: "Host", inviteSlug: "HOST12", adminCode: "ADMIN12", inviteUsageCount: 0 },
      { _id: "profiles:new", userId: "users:new", name: "New member" },
    ],
    hostOrgs: [{ _id: "hostOrgs:garden", slug: "the-garden", name: "The Garden", status: "active" }],
  }, viewerId);
}

describe("personal invite redemption", () => {
  it("counts and measures one acceptance per pair across slug/admin-code retries", async () => {
    const ctx = world();
    const schedule = vi.spyOn(ctx.scheduler, "runAfter");
    expect(await run(redeemBySlug, ctx, { slug: "HOST12" })).toBe(true);
    const scheduled = schedule.mock.calls.length;
    expect(await run(redeemBySlug, ctx, { slug: "ADMIN12" })).toBe(true);
    expect(ctx.store.invites).toHaveLength(1);
    expect(ctx.store.profiles[0].inviteUsageCount).toBe(1);
    expect(ctx.store.notifications).toHaveLength(1);
    expect(ctx.store.favorites).toHaveLength(2);
    expect(ctx.store.favorites.every((f: any) => f.origin === "invite")).toBe(true);
    expect(ctx.store.productEvents.filter((e: any) => e.event === "invite_redeemed")).toMatchObject([{
      userId: "users:new", properties: { inviter_user_id: "users:host", inviter_profile_id: "profiles:host", community_id: "hostOrgs:garden", interaction_source: "invite_slug" },
    }]);
    expect(schedule.mock.calls).toHaveLength(scheduled);
  });

  it("does not restore an intentionally removed follow on a repeated invite", async () => {
    const ctx = world();
    await run(redeemBySlug, ctx, { slug: "HOST12" });
    const follow = ctx.store.favorites.find((f: any) => f.userId === "users:new");
    await ctx.db.delete(follow._id);
    await run(redeemBySlug, ctx, { slug: "HOST12" });
    expect(ctx.store.favorites).toHaveLength(1);
    expect(ctx.store.profiles[0].inviteUsageCount).toBe(1);
  });

  it("refuses self-redemption without manufacturing network growth", async () => {
    const ctx = world("users:host");
    await expect(run(redeemBySlug, ctx, { slug: "HOST12" })).rejects.toThrow("own invite");
    expect(ctx.store.invites ?? []).toEqual([]);
    expect(ctx.store.favorites ?? []).toEqual([]);
    expect(ctx.store.productEvents ?? []).toEqual([]);
  });
});
