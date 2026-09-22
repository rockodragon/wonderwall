"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
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
  handler: async (_ctx, args) => {
    const baseUrl = process.env.SITE_URL || "https://creatives.exchange";

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
      to: args.to,
      subject: args.subject,
      html,
      text,
      headers,
    });

    if (!result.ok) {
      console.error(`Failed to send email via ${provider.name}:`, result.error);
    }
  },
});
