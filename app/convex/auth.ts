import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import type { DataModel } from "./_generated/dataModel";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile(params) {
        return {
          email: params.email as string,
          name: (params.name as string) || undefined,
        };
      },
    }),
    Google,
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      // Only run for new user creation
      if (args.existingUserId) return;

      const userId = args.userId;

      // Get the user to extract name
      const user = await ctx.db.get(userId);
      const name = (user as { name?: string })?.name || "New User";

      // Check if profile already exists
      const existingProfile = await (ctx.db as any)
        .query("profiles")
        .withIndex("by_userId", (q: any) => q.eq("userId", userId))
        .first();

      if (!existingProfile) {
        const now = Date.now();
        await (ctx.db as any).insert("profiles", {
          userId,
          name,
          jobFunctions: [],
          createdAt: now,
          updatedAt: now,
        });
      }
    },
  },
});
