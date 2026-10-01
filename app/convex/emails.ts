"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getEmailProvider } from "./email/index";
import { renderNotificationEmail } from "./email/template";

const emailCategoryValidator = v.union(
  v.literal("activity"),
  v.literal("digest"),
  v.literal("announcements"),
  v.literal("transactional"),
);

/**
 * Send an email notification via the configured provider (Resend, or the
 * console provider when no API key is set — see convex/email/).
 * Called from mutations via ctx.scheduler.runAfter(0, ...).
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
  },
  handler: async (ctx, args) => {
    const to = args.to.trim().toLowerCase();

    const suppressed = await ctx.runQuery(internal.emailDeliveries.isSuppressed, { email: to });
    if (suppressed) {
      console.log(`[email] skipping send to suppressed address: ${to}`);
      return;
    }

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
  args: { to: v.string(), code: v.string() },
  handler: async (_ctx, { to, code }) => {
    const baseUrl = process.env.SITE_URL || "https://thecreative.exchange";
    const line = `Your TheCreative.exchange code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`;
    const { html } = renderNotificationEmail({
      heading: `Your code: ${code}`,
      body: `<p style="margin:0">Your TheCreative.exchange code is <strong>${code}</strong>. It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`,
      previewText: `Your code: ${code}`,
      baseUrl,
    });
    const provider = getEmailProvider();
    const result = await provider.send({
      to: to.trim().toLowerCase(),
      subject: `Your code: ${code}`,
      html,
      text: line,
    });
    if (!result.ok) {
      console.error(`Failed to send sign-in code via ${provider.name}:`, result.error);
      throw new Error("Couldn't send the email.");
    }
  },
});
