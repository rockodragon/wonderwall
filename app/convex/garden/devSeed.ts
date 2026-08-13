// Operator seeding (idempotent). Run: npx convex run garden/devSeed:seedHostOrg
import { internalMutation } from "../_generated/server";

export const seedHostOrg = internalMutation({
  args: {},
  handler: async (ctx: any) => {
    const existing = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q: any) => q.eq("slug", "the-garden"))
      .unique();
    if (existing) return { ok: true, existed: true, id: existing._id };
    const id = await ctx.db.insert("hostOrgs", {
      name: "The Garden",
      slug: "the-garden",
      kind: "platform",
      createdAt: Date.now(),
    });
    return { ok: true, existed: false, id };
  },
});
