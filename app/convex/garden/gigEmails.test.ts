// Pure-logic tests for the live-booking email builders in gigs.ts
// (docs/features/live-booking.md §10). No Convex, no network — same shape
// as projectTeam.test.ts's buildClaimEmail tests.

import { describe, expect, it } from "vitest";
import {
  buildArtistWithdrewEmail,
  buildBookedEmail,
  buildCancelledEmail,
  buildOfferedDatesEmail,
  buildPaidEmail,
  buildPaidConfirmedEmail,
  buildTimeChangedEmail,
  buildUnbookedEmail,
} from "./gigs";

describe("buildBookedEmail", () => {
  const input = {
    venueName: `The <Blue> Room`,
    gigTitle: `Fri & Sat Nights`,
    dateLabel: "Fri, Oct 3",
    dateTimeLabel: "Fri, Oct 3 · 8:00–10:00 PM",
    linkUrl: "/projects/abc",
    hasPayout: true,
  };

  it("subject and CTA are plain text / the link url", () => {
    const email = buildBookedEmail(input);
    expect(email.subject).toBe("You're booked: Fri & Sat Nights on Fri, Oct 3");
    expect(email.heading).toBe("You're booked");
    expect(email.ctaText).toBe("See the date");
    expect(email.ctaUrl).toBe("/projects/abc");
  });

  it("escapes venue name and gig title in the body", () => {
    const email = buildBookedEmail(input);
    expect(email.body).not.toContain("<Blue>");
    expect(email.body).toContain("&lt;Blue&gt;");
    expect(email.body).toContain("<strong>The &lt;Blue&gt; Room</strong>");
    expect(email.body).toContain("<strong>Fri &amp; Sat Nights</strong>");
  });

  it("adds the payout-setup sentence only when the artist has no payout handle", () => {
    expect(buildBookedEmail({ ...input, hasPayout: true }).body).not.toContain("Add how you get paid");
    expect(buildBookedEmail({ ...input, hasPayout: false }).body).toContain(
      "Add how you get paid under Settings so the venue can pay you.",
    );
  });
});

describe("buildOfferedDatesEmail", () => {
  const input = {
    artistName: `Sam "Sax" <Reed>`,
    gigTitle: `Jazz Night`,
    dateLabels: ["Fri, Oct 3", "Fri, Oct 10"],
    linkUrl: "/projects/xyz",
  };

  it("subject is plain text (unescaped), CTA is 'Review the offer'", () => {
    const email = buildOfferedDatesEmail(input);
    expect(email.subject).toBe(`Sam "Sax" <Reed> offered dates for Jazz Night`);
    expect(email.ctaText).toBe("Review the offer");
    expect(email.ctaUrl).toBe("/projects/xyz");
  });

  it("escapes the artist name and gig title, and lists the dates", () => {
    const email = buildOfferedDatesEmail(input);
    expect(email.body).not.toContain("<Reed>");
    expect(email.body).toContain("&lt;Reed&gt;");
    expect(email.heading).toBe(`Sam &quot;Sax&quot; &lt;Reed&gt; offered dates`);
    expect(email.body).toContain("Fri, Oct 3, Fri, Oct 10");
  });

  it("falls back to a plain sentence when there are no dates", () => {
    const email = buildOfferedDatesEmail({ ...input, dateLabels: [] });
    expect(email.body).toContain("for <strong>Jazz Night</strong>.");
    expect(email.body).not.toContain(":");
  });

  it("escapes and appends the note when present", () => {
    const email = buildOfferedDatesEmail({ ...input, note: `works for me <script>` });
    expect(email.body).toContain(`"works for me &lt;script&gt;"`);
    expect(email.body).not.toContain("<script>");
  });

  it("omits the note block when there is no note", () => {
    const email = buildOfferedDatesEmail(input);
    expect(email.body).not.toContain('"');
  });
});

describe("buildCancelledEmail", () => {
  const input = {
    venueName: `Rick's & Sons`,
    gigTitle: `House Band`,
    dateLabel: "Sat, Oct 4",
    linkUrl: "/projects/c1",
  };

  it("escapes venue and title, CTA is 'See the gig'", () => {
    const email = buildCancelledEmail(input);
    expect(email.body).toContain("&amp;");
    expect(email.ctaText).toBe("See the gig");
    expect(email.subject).toBe("Rick's & Sons cancelled Sat, Oct 4");
  });
});

describe("buildArtistWithdrewEmail", () => {
  const input = {
    artistName: `<DJ> Kay`,
    gigTitle: `Open Mic`,
    dateLabel: "Sun, Oct 5",
    linkUrl: "/projects/w1",
  };

  it("escapes the artist name, CTA is 'See the gig'", () => {
    const email = buildArtistWithdrewEmail(input);
    expect(email.body).not.toContain("<DJ>");
    expect(email.body).toContain("&lt;DJ&gt; Kay");
    expect(email.ctaText).toBe("See the gig");
    expect(email.subject).toBe("<DJ> Kay can't make Sun, Oct 5");
  });
});

describe("buildPaidEmail", () => {
  const input = {
    venueName: `The <Blue> Room`,
    gigTitle: `Fri & Sat Nights`,
    dateLabel: "Fri, Oct 3",
    amountCents: 15000,
    method: `Venmo <@rick>`,
    linkUrl: "/projects/abc",
  };

  it("escapes venue, title, and method; CTA is 'Confirm payment'", () => {
    const email = buildPaidEmail(input);
    expect(email.body).not.toContain("<Blue>");
    expect(email.body).toContain("&lt;Blue&gt;");
    expect(email.body).not.toContain("<@rick>");
    expect(email.body).toContain("&lt;@rick&gt;");
    expect(email.body).toContain("$150.00");
    expect(email.ctaText).toBe("Confirm payment");
    expect(email.subject).toBe("The <Blue> Room marked Fri & Sat Nights on Fri, Oct 3 as paid");
  });
});

describe("buildPaidConfirmedEmail", () => {
  const input = {
    artistName: `Sam "Sax" <Reed>`,
    gigTitle: `Jazz Night`,
    dateLabel: "Fri, Oct 3",
    linkUrl: "/projects/xyz",
  };

  it("escapes the artist name and title; CTA is 'See the gig'", () => {
    const email = buildPaidConfirmedEmail(input);
    expect(email.body).not.toContain("<Reed>");
    expect(email.body).toContain("&lt;Reed&gt;");
    expect(email.ctaText).toBe("See the gig");
    expect(email.subject).toBe(`Sam "Sax" <Reed> confirmed payment for Fri, Oct 3`);
  });
});

describe("buildTimeChangedEmail", () => {
  const input = {
    venueName: `Rick's & Sons`,
    gigTitle: `House Band`,
    dateLabel: "Sat, Oct 4",
    newTimeRange: "9:00–11:00 PM",
    linkUrl: "/projects/c1",
  };

  it("escapes venue and title, includes the new time, CTA is 'See the gig'", () => {
    const email = buildTimeChangedEmail(input);
    expect(email.body).toContain("&amp;");
    expect(email.body).toContain("9:00–11:00 PM");
    expect(email.ctaText).toBe("See the gig");
    expect(email.subject).toBe("New time for House Band on Sat, Oct 4");
  });
});

describe("buildUnbookedEmail", () => {
  const input = {
    venueName: `The <Blue> Room`,
    gigTitle: `Fri & Sat Nights`,
    dateLabel: "Fri, Oct 3",
    linkUrl: "/projects/abc",
  };

  it("escapes venue and title, CTA is 'See the gig'", () => {
    const email = buildUnbookedEmail(input);
    expect(email.body).not.toContain("<Blue>");
    expect(email.body).toContain("&lt;Blue&gt;");
    expect(email.body).toContain("reopened");
    expect(email.ctaText).toBe("See the gig");
    expect(email.subject).toBe("The <Blue> Room reopened Fri, Oct 3");
  });
});
