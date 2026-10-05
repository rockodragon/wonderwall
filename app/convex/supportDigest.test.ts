// Pure-logic tests for the daily email (supportDigest.ts). No Convex, no network.

import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import { DIGEST_LOOKBACK_DAYS, DIGEST_MAX_LINES, buildSupportDigestEmail, digestLine, pickDigestRows } from "./supportDigest";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const MARA = "u-mara" as Id<"users">;
const JO = "u-jo" as Id<"users">;

function row(id: string, extra: Partial<{ userId: Id<"users">; type: string; createdAt: number; readAt: number; celebratedAt: number; digestedAt: number }> = {}) {
  return { id, userId: MARA, type: "encouragement", title: `Title ${id}`, message: "", createdAt: NOW - DAY, ...extra };
}

describe("pickDigestRows", () => {
  it("groups by person, oldest first", () => {
    const picked = pickDigestRows(
      [row("b", { createdAt: NOW - 2 * 3600_000 }), row("a", { createdAt: NOW - 5 * 3600_000 }), row("j", { userId: JO })],
      NOW,
    );
    expect(picked.get(MARA)?.map((r) => r.id)).toEqual(["a", "b"]);
    expect(picked.get(JO)?.map((r) => r.id)).toEqual(["j"]);
  });

  it("takes cheers, offers, backings and gifts, never awards or anything else", () => {
    const rows = ["encouragement", "help_offered", "backing_received", "gift_received", "fund_award", "grant_proposal_approved", "new_follower"].map((type) =>
      row(type, { type }),
    );
    expect(pickDigestRows(rows, NOW).get(MARA)?.map((r) => r.id)).toEqual([
      "encouragement",
      "help_offered",
      "backing_received",
      "gift_received",
    ]);
  });

  it("leaves out what was already sent, read in Messages, or closed on the canvas", () => {
    const rows = [row("sent", { digestedAt: NOW - 1 }), row("read", { readAt: NOW - 1 }), row("closed", { celebratedAt: NOW - 1 }), row("new")];
    expect(pickDigestRows(rows, NOW).get(MARA)?.map((r) => r.id)).toEqual(["new"]);
  });

  it("skips stale news and leaves out people with nothing", () => {
    const rows = [row("old", { userId: JO, createdAt: NOW - (DIGEST_LOOKBACK_DAYS + 1) * DAY })];
    expect(pickDigestRows(rows, NOW).size).toBe(0);
  });
});

describe("digestLine", () => {
  it("quotes their words for a cheer or an offer", () => {
    expect(digestLine({ type: "encouragement", title: "Dana cheered on Small Acts", message: "Keep going." })).toBe(
      "Dana cheered on Small Acts: “Keep going.”",
    );
  });

  it("adds the rest of a money notice after a dash", () => {
    expect(digestLine({ type: "backing_received", title: "Dana backed Small Acts", message: "$25.00 a month" })).toBe(
      "Dana backed Small Acts — $25.00 a month",
    );
  });

  it("is just the title when there's nothing more, and escapes what people typed", () => {
    expect(digestLine({ type: "gift_received", title: "Sam gave you $4.71", message: " " })).toBe("Sam gave you $4.71");
    expect(digestLine({ type: "encouragement", title: "<b>Dana</b> cheered", message: "a & b" })).toBe(
      "&lt;b&gt;Dana&lt;/b&gt; cheered: “a &amp; b”",
    );
  });
});

describe("buildSupportDigestEmail", () => {
  const line = (n: number) => ({ type: "encouragement", title: `Person ${n} cheered on Small Acts`, message: "" });

  it("uses the one thing's own words when there's one", () => {
    const email = buildSupportDigestEmail([line(1)]);
    expect(email.subject).toBe("Person 1 cheered on Small Acts");
    expect(email.heading).toBe(email.subject);
    expect(email.body).toBe("Person 1 cheered on Small Acts");
    expect(email).toMatchObject({ ctaText: "See it", ctaUrl: "/today" });
  });

  it("names the first and counts the rest when there are more", () => {
    const email = buildSupportDigestEmail([line(1), line(2), line(3)]);
    expect(email.subject).toBe("Person 1 cheered on Small Acts, and 2 more");
    expect(email.body.split("<br><br>")).toHaveLength(3);
    expect(email.ctaText).toBe("See them");
  });

  it("lists ten, then says how many more", () => {
    const rows = Array.from({ length: DIGEST_MAX_LINES + 3 }, (_, i) => line(i + 1));
    const lines = buildSupportDigestEmail(rows).body.split("<br><br>");
    expect(lines).toHaveLength(DIGEST_MAX_LINES + 1);
    expect(lines.at(-1)).toBe("And 3 more.");
  });
});
