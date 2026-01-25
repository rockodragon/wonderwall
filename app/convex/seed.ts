import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";

/**
 * Seed script to bootstrap the app with an initial admin user and invite codes.
 *
 * Run via Convex dashboard or CLI:
 *   bunx convex run seed:bootstrap
 *
 * Or with custom values:
 *   bunx convex run seed:bootstrap '{"email":"admin@example.com","name":"Admin","numInvites":5}'
 */

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const bootstrap = internalMutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    numInvites: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const email = args.email || "admin@wonderwall.app";
    const name = args.name || "Admin";
    const numInvites = args.numInvites ?? 5;

    // Check if we already have users
    const existingUsers = await ctx.db.query("users").take(1);
    if (existingUsers.length > 0) {
      // Find admin user or use first user
      const adminProfile = await ctx.db
        .query("profiles")
        .filter((q) => q.eq(q.field("name"), name))
        .first();

      if (adminProfile) {
        // Generate more invites for existing admin
        const codes: string[] = [];
        for (let i = 0; i < numInvites; i++) {
          const code = generateCode();
          await ctx.db.insert("invites", {
            inviterId: adminProfile.userId,
            code,
            createdAt: Date.now(),
          });
          codes.push(code);
        }
        return {
          message: "Added invites to existing admin",
          userId: adminProfile.userId,
          profileId: adminProfile._id,
          inviteCodes: codes,
        };
      }

      // Use first user's profile
      const firstProfile = await ctx.db.query("profiles").first();
      if (firstProfile) {
        const codes: string[] = [];
        for (let i = 0; i < numInvites; i++) {
          const code = generateCode();
          await ctx.db.insert("invites", {
            inviterId: firstProfile.userId,
            code,
            createdAt: Date.now(),
          });
          codes.push(code);
        }
        return {
          message: "Added invites to first user",
          userId: firstProfile.userId,
          profileId: firstProfile._id,
          inviteCodes: codes,
        };
      }
    }

    // Create bootstrap user (this is a special case - user without auth)
    // Note: This user won't be able to log in via password auth
    // They exist only to generate initial invite codes
    const now = Date.now();

    const userId = await ctx.db.insert("users", {
      email,
      name,
    });

    const profileId = await ctx.db.insert("profiles", {
      userId,
      name,
      jobFunctions: [],
      plan: "paid", // Admin gets paid plan
      createdAt: now,
      updatedAt: now,
    });

    // Generate invite codes
    const codes: string[] = [];
    for (let i = 0; i < numInvites; i++) {
      const code = generateCode();
      await ctx.db.insert("invites", {
        inviterId: userId,
        code,
        createdAt: Date.now(),
      });
      codes.push(code);
    }

    return {
      message: "Bootstrap complete! Use these invite codes to sign up.",
      userId,
      profileId,
      inviteCodes: codes,
      note: "The admin user created cannot log in directly. Sign up with an invite code to create a real account.",
    };
  },
});

/**
 * Generate additional invite codes for any authenticated user.
 * This is a regular mutation that requires authentication.
 */
export const generateInvites = mutation({
  args: {
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { auth } = await import("./auth");
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const count = args.count ?? 3;
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = generateCode();
      await ctx.db.insert("invites", {
        inviterId: userId,
        code,
        createdAt: Date.now(),
      });
      codes.push(code);
    }

    return codes;
  },
});
