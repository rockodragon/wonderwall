// Pure-logic tests for the class-purchase email builder (memberships.ts).
// No Convex, no network — same shape as gigEmails.test.ts and
// projectTeam.test.ts's buildClaimEmail tests.

import { describe, expect, it } from "vitest";
import { buildClassPurchasedEmail } from "./memberships";

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
