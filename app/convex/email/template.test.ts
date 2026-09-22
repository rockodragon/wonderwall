// Pure-logic tests for the notification email template: escaping, the
// unsubscribe footer, the text rendering, brand copy, and the hard
// contrast-colour rule. No Convex, no network.

import { describe, expect, it } from "vitest";
import { escapeHtml, renderNotificationEmail } from "./template";

const BASE_URL = "https://creatives.exchange";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("New event application")).toBe("New event application");
  });
});

describe("renderNotificationEmail", () => {
  it("escapes heading and previewText but leaves trusted body HTML intact", () => {
    const { html } = renderNotificationEmail({
      heading: `<script>alert(1)</script>`,
      previewText: `"quoted" & <tagged>`,
      body: `<strong>Sam</strong> sent you a message.`,
      baseUrl: BASE_URL,
    });

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;quoted&quot; &amp; &lt;tagged&gt;");
    // Trusted body HTML passes through unescaped.
    expect(html).toContain("<strong>Sam</strong> sent you a message.");
  });

  it("escapes ctaText the same way", () => {
    const { html } = renderNotificationEmail({
      heading: "New message",
      previewText: "preview",
      body: "body",
      ctaText: `View & "Reply"`,
      ctaUrl: "/messages/abc",
      baseUrl: BASE_URL,
    });
    expect(html).toContain("View &amp; &quot;Reply&quot;");
  });

  it("prefixes ctaUrl with baseUrl", () => {
    const { html, text } = renderNotificationEmail({
      heading: "New message",
      previewText: "preview",
      body: "body",
      ctaText: "View Message",
      ctaUrl: "/messages/abc123",
      baseUrl: BASE_URL,
    });
    expect(html).toContain('href="https://creatives.exchange/messages/abc123"');
    expect(text).toContain("View Message: https://creatives.exchange/messages/abc123");
  });

  it("includes the unsubscribe link only when unsubscribeUrl is given", () => {
    const withToken = renderNotificationEmail({
      heading: "Digest",
      previewText: "preview",
      body: "body",
      baseUrl: BASE_URL,
      unsubscribeUrl: `${BASE_URL}/unsubscribe/abc123`,
    });
    expect(withToken.html).toContain("Manage email preferences or unsubscribe");
    expect(withToken.html).toContain(`${BASE_URL}/unsubscribe/abc123`);
    expect(withToken.text).toContain("Manage email preferences or unsubscribe");

    const withoutToken = renderNotificationEmail({
      heading: "Digest",
      previewText: "preview",
      body: "body",
      baseUrl: BASE_URL,
    });
    expect(withoutToken.html).not.toContain("Manage email preferences or unsubscribe");
    expect(withoutToken.text).not.toContain("Manage email preferences or unsubscribe");
  });

  it("renders a plain-text version that strips tags and converts <br> to newlines", () => {
    const { text } = renderNotificationEmail({
      heading: "New message",
      previewText: "preview",
      body: `<strong>Sam</strong> sent you a message:<br><br>"Hello there"`,
      baseUrl: BASE_URL,
    });
    expect(text).not.toContain("<strong>");
    expect(text).not.toContain("<br>");
    expect(text).toContain("Sam sent you a message:");
    expect(text).toContain('"Hello there"');
    expect(text.startsWith("New message\n\n")).toBe(true);
  });

  it("never contains a retired brand name", () => {
    const { html, text } = renderNotificationEmail({
      heading: "New message",
      previewText: "preview",
      body: "body",
      ctaText: "View",
      ctaUrl: "/x",
      baseUrl: BASE_URL,
      unsubscribeUrl: `${BASE_URL}/unsubscribe/abc`,
    });
    for (const retired of ["The Exchange", "The Garden", "Wonderwall", "thecrossboard"]) {
      expect(html).not.toContain(retired);
      expect(text).not.toContain(retired);
    }
    expect(html).toContain("creatives.exchange — projects, classes and support for creatives");
    expect(text).toContain("creatives.exchange — projects, classes and support for creatives");
  });

  it("uses the fixed contrast-safe colours", () => {
    const { html } = renderNotificationEmail({
      heading: "New message",
      previewText: "preview",
      body: "body",
      ctaText: "View",
      ctaUrl: "/x",
      baseUrl: BASE_URL,
      unsubscribeUrl: `${BASE_URL}/unsubscribe/abc`,
    });
    // Heading/body text: #111111 (≥9:1 on white).
    expect(html).toContain("color:#111111");
    // Secondary/footer text: #444444 (≥6:1 on white).
    expect(html).toContain("color:#444444");
    // Button: #111111 background, #ffffff text.
    expect(html).toContain("background:#111111;color:#ffffff");
    // Page background.
    expect(html).toContain("background:#f4f4f2");
    // Nothing lighter/greyer than these is used for text.
    expect(html).not.toMatch(/color:#(9ca3af|6b7280|d1d5db)/);
  });
});
