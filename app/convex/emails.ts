"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getEmailProvider } from "./email/index";
import { renderNotificationEmail } from "./email/template";
import { chooseFromName, defaultSenderFor } from "./email/sender";

const emailCategoryValidator = v.union(
  v.literal("activity"),
  v.literal("digest"),
  v.literal("announcements"),
  v.literal("transactional"),
);

const emailSenderValidator = v.union(v.literal("platform"), v.literal("community"));

/**
 * Send an email notification via the configured provider (Resend, or the
 * console provider when no API key is set — see convex/email/).
 * Called from mutations via ctx.scheduler.runAfter(0, ...).
 *
 * `sender` picks the From display name (convex/email/sender.ts): "community"
 * sends under a community's name, "platform" under the default
 * "TheCreative.exchange". Unset, it follows `category` — activity, digest and
 * announcements are community; transactional is platform. Pass it only to
 * break that rule (waitlist approval is transactional but comes from the
 * community). Which community: `communityId` if given and active, else the
 * recipient's own (`recipientUserId`), else The Garden — see
 * pickSenderCommunity. The sending address is the same either way.
 */
export const sendNotificationEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    previewText: v.string(),
    heading: v.string(),
    body: v.string(),
    ctaText: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
    category: v.optional(emailCategoryValidator),
    unsubscribeToken: v.optional(v.string()),
    sender: v.optional(emailSenderValidator),
    // The community this email is about; the From name is that community's.
    communityId: v.optional(v.id("hostOrgs")),
    // The recipient, when they have an account: with no communityId (or one
    // that isn't active), the From name is the recipient's own community.
    recipientUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const to = args.to.trim().toLowerCase();

    const suppressed = await ctx.runQuery(internal.emailDeliveries.isSuppressed, { email: to });
    if (suppressed) {
      console.log(`[email] skipping send to suppressed address: ${to}`);
      return;
    }

    // Read the community's name from its row so a rename carries over; when
    // there's no community to name this is null and the default sender name
    // is kept.
    const sender = args.sender ?? defaultSenderFor(args.category);
    const communityName =
      sender === "community"
        ? await ctx.runQuery(internal.emailDeliveries.getCommunitySenderName, {
            communityId: args.communityId,
            userId: args.recipientUserId,
          })
        : null;
    const fromName = chooseFromName({ sender, communityName });

    const baseUrl = process.env.SITE_URL || "https://thecreative.exchange";

    const unsubscribeUrl = args.unsubscribeToken
      ? `${baseUrl}/unsubscribe/${args.unsubscribeToken}`
      : undefined;

    const { html, text } = renderNotificationEmail({
      heading: args.heading,
      body: args.body,
      previewText: args.previewText,
      ctaText: args.ctaText,
      ctaUrl: args.ctaUrl,
      baseUrl,
      unsubscribeUrl,
      brandName: fromName,
    });

    // The footer link is the frontend page (SITE_URL). The one-click POST
    // target (RFC 8058) is the Convex HTTP route in http.ts, which lives on
    // the deployment's .convex.site origin — CONVEX_SITE_URL is set by the
    // runtime. The frontend can't answer a bodiless POST.
    const httpBase = process.env.CONVEX_SITE_URL;
    const headers: Record<string, string> | undefined =
      args.unsubscribeToken && httpBase
        ? {
            "List-Unsubscribe": `<${httpBase}/unsubscribe/${args.unsubscribeToken}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined;

    const provider = getEmailProvider();

    const result = await provider.send({
      to,
      subject: args.subject,
      html,
      text,
      headers,
      fromName,
    });

    if (!result.ok) {
      console.error(`Failed to send email via ${provider.name}:`, result.error);
      return;
    }

    // The console provider returns no id — nothing to track delivery events
    // against, so skip recording it.
    if (result.id) {
      await ctx.runMutation(internal.emailDeliveries.recordSend, {
        providerId: result.id,
        provider: provider.name,
        to,
        subject: args.subject,
        category: args.category,
      });
    }
  },
});

/**
 * The one-time sign-in code email (convex/auth.ts's "email-otp" provider).
 * Transactional and user-initiated: no unsubscribe footer and no suppression
 * check. Unlike sendNotificationEmail it throws when the provider fails, so
 * the person sees "couldn't send" instead of waiting for a code that isn't
 * coming. With no email key configured it logs the message (console provider),
 * code included, so local sign-in works.
 */
export const sendSignInCode = internalAction({
  // siteName: "The Garden" when the code was asked for on one of its
  // addresses (auth.ts): the email's words, header and sender name say so.
  // Unset, the email is exactly the platform's, as before.
  args: { to: v.string(), code: v.string(), siteName: v.optional(v.string()) },
  handler: async (_ctx, { to, code, siteName }) => {
    const baseUrl = process.env.SITE_URL || "https://thecreative.exchange";
    const whose = siteName ? `Your code for ${siteName} is` : "Your TheCreative.exchange code is";
    const line = `${whose} ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`;
    const { html } = renderNotificationEmail({
      heading: `Your code: ${code}`,
      body: `<p style="margin:0">${whose} <strong>${code}</strong>. It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`,
      previewText: `Your code: ${code}`,
      baseUrl,
      ...(siteName ? { brandName: siteName } : {}),
    });
    const provider = getEmailProvider();
    const result = await provider.send({
      to: to.trim().toLowerCase(),
      subject: `Your code: ${code}`,
      html,
      text: line,
      ...(siteName ? { fromName: siteName } : {}),
    });
    if (!result.ok) {
      console.error(`Failed to send sign-in code via ${provider.name}:`, result.error);
      throw new Error("Couldn't send the email.");
    }
  },
});
