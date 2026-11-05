import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail } from "./errors";
import { safeHref } from "./garden/richText";
import { currentUserId, getProfileByUserId, requireOwnProfileRow, requireProfile, requireUserId } from "./helpers";

/** The link as it is stored, or a refusal a person can read. */
function storedLinkUrl(raw: string): string {
  const url = safeHref(raw);
  if (!url) fail("invalid_input", "That isn't a link. Paste the address of the page.");
  return url;
}

export const getMyLinks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return [];

    const profile = await getProfileByUserId(ctx, userId);

    if (!profile) return [];

    const links = await ctx.db
      .query("links")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    return links.sort((a, b) => a.order - b.order);
  },
});

export const add = mutation({
  args: {
    label: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const url = storedLinkUrl(args.url);

    const profile = await requireProfile(ctx, userId);

    // Get current max order
    const links = await ctx.db
      .query("links")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    const maxOrder =
      links.length > 0 ? Math.max(...links.map((l) => l.order)) : -1;

    return await ctx.db.insert("links", {
      profileId: profile._id,
      label: args.label,
      url,
      order: maxOrder + 1,
    });
  },
});

export const update = mutation({
  args: {
    linkId: v.id("links"),
    label: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, row: link, profile } = await requireOwnProfileRow(ctx, "links", args.linkId);

    await ctx.db.patch(args.linkId, {
      label: args.label,
      url: storedLinkUrl(args.url),
    });
  },
});

export const remove = mutation({
  args: { linkId: v.id("links") },
  handler: async (ctx, args) => {
    const { userId, row: link, profile } = await requireOwnProfileRow(ctx, "links", args.linkId);

    await ctx.db.delete(args.linkId);
  },
});

export const reorder = mutation({
  args: {
    linkIds: v.array(v.id("links")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const profile = await requireProfile(ctx, userId);

    // Only the person's own links, as artifacts.reorder does (this used to
    // reorder whatever ids it was handed, anyone's).
    for (let i = 0; i < args.linkIds.length; i++) {
      const link = await ctx.db.get(args.linkIds[i]);
      if (link && link.profileId === profile._id) {
        await ctx.db.patch(args.linkIds[i], { order: i });
      }
    }
  },
});
