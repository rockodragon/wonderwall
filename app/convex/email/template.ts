// Pure notification-email template. No Node SDKs — importable from plain
// Convex code and from vitest.
//
// Contract: `body` is trusted HTML (callers already escape user text and
// pass tags like <strong> through deliberately). `heading`, `previewText`
// and `ctaText` are PLAIN TEXT — this file HTML-escapes them itself, so
// callers must NOT pre-escape those three fields (that would double-escape).
//
// Contrast (HARD RULE — do not loosen without re-checking real ratios):
// body text #111111 on #ffffff (~18.1:1, well over the 9:1 floor for body
// text); secondary/footer text #444444 on #ffffff (~9.7:1, over the 6:1
// floor for secondary text); button #111111 background with #ffffff text.
// Page background #f4f4f2 sits outside the white content card, never
// behind body text.

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TAGLINE = "creatives.exchange — projects, classes and support for creatives";

export interface RenderNotificationEmailArgs {
  heading: string;
  body: string;
  previewText: string;
  ctaText?: string;
  ctaUrl?: string;
  baseUrl: string;
  unsubscribeUrl?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

function stripTagsToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderNotificationEmail(args: RenderNotificationEmailArgs): RenderedEmail {
  const { heading, body, previewText, ctaText, baseUrl, unsubscribeUrl } = args;
  const ctaUrl = args.ctaUrl ? `${baseUrl}${args.ctaUrl}` : undefined;

  const safeHeading = escapeHtml(heading);
  const safePreviewText = escapeHtml(previewText);
  const safeCtaText = ctaText ? escapeHtml(ctaText) : undefined;

  const ctaHtml =
    ctaUrl && safeCtaText
      ? `<a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background:#111111;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin-top:20px">${safeCtaText}</a>`
      : "";

  const unsubscribeHtml = unsubscribeUrl
    ? `<p style="margin:6px 0 0;font-size:13px;color:#444444;line-height:1.6"><a href="${unsubscribeUrl}" style="color:#444444;text-decoration:underline">Manage email preferences or unsubscribe</a></p>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeHeading}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="text-align:left;margin-bottom:20px">
      <span style="font-size:16px;font-weight:700;color:#111111">creatives.exchange</span>
    </div>
    <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e5e0">
      <h1 style="margin:0 0 14px;font-size:19px;line-height:1.4;color:#111111">${safeHeading}</h1>
      <div style="margin:0;font-size:15px;color:#111111;line-height:1.6">${body}</div>
      ${ctaHtml}
    </div>
    <div style="margin-top:24px">
      <p style="margin:0;font-size:13px;color:#444444;line-height:1.6">${TAGLINE}</p>
      ${unsubscribeHtml}
    </div>
  </div>
  <span style="display:none;max-height:0;overflow:hidden">${safePreviewText}</span>
</body>
</html>`.trim();

  const textParts = [heading, "", stripTagsToText(body)];
  if (ctaUrl && ctaText) {
    textParts.push("", `${ctaText}: ${ctaUrl}`);
  }
  textParts.push("", TAGLINE);
  if (unsubscribeUrl) {
    textParts.push("Manage email preferences or unsubscribe: " + unsubscribeUrl);
  }
  const text = textParts.join("\n").trim();

  return { html, text };
}
