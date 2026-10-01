// Pure-logic tests for the backing-received email builder (memberships.ts).
// No Convex, no network — same shape as gigEmails.test.ts and
// projectTeam.test.ts's buildClaimEmail tests.

import { describe, expect, it } from "vitest";
import { buildBackingReceivedEmail, buildClassPurchasedEmail } from "./memberships";

describe("buildBackingReceivedEmail", () => {
  const input = {
    supporterName: `Sam "Sax" <Reed>`,
    visible: true,
    projectTitle: `Jazz <Night>`,
    amountCents: 2500,
    recurring: false,
    linkUrl: "/projects/abc",
  };

  it("subject/previewText/heading are plain text, CTA is 'See the project'", () => {
    const email = buildBackingReceivedEmail(input);
    expect(email.subject).toBe(`Sam "Sax" <Reed> backed Jazz <Night>`);
    expect(email.heading).toBe("New backing");
    expect(email.ctaText).toBe("See the project");
    expect(email.ctaUrl).toBe("/projects/abc");
  });

  it("escapes the supporter name and project title in the body", () => {
    const email = buildBackingReceivedEmail(input);
    expect(email.body).not.toContain("<Reed>");
    expect(email.body).toContain("&lt;Reed&gt;");
    expect(email.body).toContain("<strong>Sam &quot;Sax&quot; &lt;Reed&gt;</strong>");
    expect(email.body).toContain("<strong>Jazz &lt;Night&gt;</strong>");
    expect(email.body).toContain("$25.00");
  });

  it("shows 'Someone' instead of the name when the backer isn't visible", () => {
    const email = buildBackingReceivedEmail({ ...input, visible: false });
    expect(email.subject).toBe("Someone backed Jazz <Night>");
    expect(email.body).toContain("<strong>Someone</strong>");
    expect(email.body).not.toContain("Reed");
  });

  it("adds 'a month' wording only when the backing is recurring", () => {
    expect(buildBackingReceivedEmail(input).body).not.toContain("a month");
    expect(buildBackingReceivedEmail({ ...input, recurring: true }).body).toContain("$25.00 a month");
  });
});

describe("buildClassPurchasedEmail", () => {
  const input = {
    buyerName: `Sam "Sax" <Reed>`,
    classTitle: `Intro to <Jazz>`,
    amountCents: 4500,
    linkUrl: "/offerings/off1",
  };

  it("subject/heading are plain text, CTA is 'See the class'", () => {
    const email = buildClassPurchasedEmail(input);
    expect(email.subject).toBe(`Sam "Sax" <Reed> signed up for Intro to <Jazz>`);
    expect(email.ctaText).toBe("See the class");
    expect(email.ctaUrl).toBe("/offerings/off1");
  });

  it("escapes the buyer name and class title in the body", () => {
    const email = buildClassPurchasedEmail(input);
    expect(email.body).not.toContain("<Reed>");
    expect(email.body).toContain("&lt;Reed&gt;");
    expect(email.body).not.toContain("<Jazz>");
    expect(email.body).toContain("&lt;Jazz&gt;");
    expect(email.body).toContain("$45.00");
  });
});
