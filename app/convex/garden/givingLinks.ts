// An org's give buttons on its fund page (fund.$slug.tsx): a one-time
// Payment Link and, optionally, a monthly one. Both are the org's own Stripe
// links (buy.stripe.com); the gifts land in its account and its webhook
// (apGifts.ts for AP) records them.
//   npx convex run garden/givingLinks:setGivingLinks '{"slug":"abiding-practice","oneTime":"https://buy.stripe.com/…","monthly":"https://buy.stripe.com/…"}' [--prod]

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export function checkPaymentLink(url: string): string {
  const parsed = new URL(url.trim());
  if (parsed.protocol !== "https:" || parsed.hostname !== "buy.stripe.com") {
    throw new Error(`Not a Stripe Payment Link: ${url}`);
  }
  return parsed.toString();
}

export const setGivingLinks = internalMutation({
  args: {
    slug: v.string(),
    oneTime: v.optional(v.string()),
    monthly: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!org) throw new Error(`No org "${args.slug}"`);
    const patch: { paymentLinkUrl?: string; monthlyPaymentLinkUrl?: string } = {};
    if (args.oneTime) patch.paymentLinkUrl = checkPaymentLink(args.oneTime);
    if (args.monthly) patch.monthlyPaymentLinkUrl = checkPaymentLink(args.monthly);
    await ctx.db.patch(org._id, patch);
    return { slug: org.slug, ...patch };
  },
});
