"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";

/**
 * Send an email notification via Resend.
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
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log("RESEND_API_KEY not set, skipping email");
      return;
    }

    const resend = new Resend(apiKey);

    const baseUrl = process.env.SITE_URL || "https://www.thecrossboard.org";
    const ctaHtml = args.ctaUrl
      ? `<a href="${baseUrl}${args.ctaUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin-top:16px">${args.ctaText || "View on TheCrossBoard"}</a>`
      : "";

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px">
      <span style="font-size:20px;font-weight:700;color:#111">TheCrossBoard</span>
    </div>
    <!-- Card -->
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
      <h1 style="margin:0 0 12px;font-size:18px;color:#111">${args.heading}</h1>
      <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6">${args.body}</p>
      ${ctaHtml}
    </div>
    <!-- Footer -->
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:24px">
      TheCrossBoard — Jobs, portfolios & collabs for Kingdom-minded creatives
    </p>
  </div>
  <span style="display:none">${args.previewText}</span>
</body>
</html>`.trim();

    const { error } = await resend.emails.send({
      from: "TheCrossBoard <hello@thecrossboard.org>",
      to: [args.to],
      subject: args.subject,
      html,
    });

    if (error) {
      console.error("Failed to send email:", error.message);
    }
  },
});
