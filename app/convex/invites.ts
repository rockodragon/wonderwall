import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const code = generateCode();

    await ctx.db.insert("invites", {
      inviterId: userId,
      code,
      createdAt: Date.now(),
    });

    return code;
  },
});

export const getMyInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("invites")
      .withIndex("by_inviterId", (q) => q.eq("inviterId", userId))
      .collect();
  },
});

export const validate = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (!invite) return { valid: false, reason: "Invalid invite code" };
    if (invite.usedBy) return { valid: false, reason: "Invite already used" };

    return { valid: true };
  },
});

export const redeem = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (!invite) throw new Error("Invalid invite code");
    if (invite.usedBy) throw new Error("Invite already used");

    await ctx.db.patch(invite._id, {
      usedBy: userId,
      usedAt: Date.now(),
    });

    return true;
  },
});
