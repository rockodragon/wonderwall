"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getEmailProvider } from "./email/index";
import { renderNotificationEmail } from "./email/template";
import { chooseFromName, defaultSenderFor } from "./email/sender";
import { CONTACT_LEASE_MS, emailSendValidators } from "./emailContactPolicy";

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
  args: emailSendValidators,
  handler: async (ctx, args) => {
    if (!args.contactId) {
      await ctx.runMutation(internal.emailDeliveries.queueLegacySend, args);
      return;
    }
    const claim = await ctx.runMutation(internal.emailDeliveries.claimForDispatch, { contactId: args.contactId });
    if (!claim.claimed) return;
    // A crashed action leaves a lease, not a permanent sending state. This
    // replay uses the same provider idempotency key and the next claim rechecks eligibility.
    await ctx.scheduler.runAfter(CONTACT_LEASE_MS + 1000, internal.emails.sendNotificationEmail, args);
    const to = claim.to;

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

    const unsubscribeToken = claim.unsubscribeToken ?? args.unsubscribeToken;
    const unsubscribeUrl = unsubscribeToken
      ? `${baseUrl}/unsubscribe/${unsubscribeToken}`
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
      unsubscribeToken && httpBase
        ? {
            "List-Unsubscribe": `<${httpBase}/unsubscribe/${unsubscribeToken}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined;

    const provider = getEmailProvider();
    if (provider.name === "console") {
      await ctx.runMutation(internal.emailDeliveries.finishDispatch, {
        contactId: args.contactId, attempt: claim.attempts, provider: provider.name,
        error: "email_provider_not_configured", retryable: false,
      });
      return;
    }
    try {
      const result = await provider.send({
        to, subject: args.subject, html, text, headers, fromName,
        idempotencyKey: `contact/${args.contactId}`,
      });
      const finished = await ctx.runMutation(internal.emailDeliveries.finishDispatch, {
        contactId: args.contactId, attempt: claim.attempts, provider: provider.name,
        ...(result.ok ? { providerId: result.id } : { error: result.error, retryable: result.retryable }),
      });
      if (finished.retryAt !== null) await ctx.scheduler.runAt(finished.retryAt, internal.emails.sendNotificationEmail, args);
    } catch {
      const finished = await ctx.runMutation(internal.emailDeliveries.finishDispatch, {
        contactId: args.contactId, attempt: claim.attempts, provider: provider.name,
        error: "email_provider_request_failed", retryable: true,
      });
      if (finished.retryAt !== null) await ctx.scheduler.runAt(finished.retryAt, internal.emails.sendNotificationEmail, args);
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
