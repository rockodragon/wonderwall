// Pure-logic tests for the daily email (supportDigest.ts). No Convex, no network.

import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  DIGEST_LOOKBACK_DAYS,
  DIGEST_MAX_LINES,
  buildSupportDigestEmail,
  digestLine,
  digestLinks,
  pickDigestRows,
} from "./supportDigest";

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
    expect(digestLine({ type: "encouragement", title: "Dana cheered on Small Acts", message: "Keep going." }, [])).toBe(
      "Dana cheered on Small Acts: “Keep going.”",
    );
  });

  it("adds the rest of a money notice after a dash", () => {
    expect(digestLine({ type: "backing_received", title: "Dana backed Small Acts", message: "$25.00 a month" }, [])).toBe(
      "Dana backed Small Acts — $25.00 a month",
    );
  });

  it("is just the title when there's nothing more, and escapes what people typed", () => {
    expect(digestLine({ type: "gift_received", title: "Sam gave you $4.71", message: " " }, [])).toBe("Sam gave you $4.71");
    expect(digestLine({ type: "encouragement", title: "<b>Dana</b> cheered", message: "a & b" }, [])).toBe(
      "&lt;b&gt;Dana&lt;/b&gt; cheered: “a &amp; b”",
    );
  });
});

describe("digestLine links", () => {
  const A = (href: string, text: string) => `<a href="${href}" style="color:#111111;text-decoration:underline">${text}</a>`;
  const cheer = { type: "encouragement", title: "Dana cheered on Small Acts", message: "Keep going." };
  const dana = { text: "Dana", href: "/profile/p1" };
  const smallActs = { text: "Small Acts", href: "/story/small-acts" };

  it("links the person and the project in the title, and not their words", () => {
    expect(digestLine(cheer, [dana, smallActs])).toBe(
      `${A("/profile/p1", "Dana")} cheered on ${A("/story/small-acts", "Small Acts")}: “Keep going.”`,
    );
    // Their words are never linked, even when they name the project.
    expect(digestLine({ ...cheer, message: "Love Small Acts" }, [smallActs])).toBe(
      `Dana cheered on ${A("/story/small-acts", "Small Acts")}: “Love Small Acts”`,
    );
  });

  it("links a money notice's title and leaves the rest of it plain", () => {
    const backed = { type: "backing_received", title: "Dana backed Small Acts", message: "$25.00 a month" };
    expect(digestLine(backed, [dana, smallActs])).toBe(
      `${A("/profile/p1", "Dana")} backed ${A("/story/small-acts", "Small Acts")} — $25.00 a month`,
    );
  });

  it("escapes the text and the href, and matches names with & or quotes in them", () => {
    const title = "Fish & Chips cheered on <Small> Acts";
    expect(
      digestLine({ type: "encouragement", title, message: "" }, [
        { text: "Fish & Chips", href: "/profile/a&b" },
        { text: "<Small> Acts", href: "/story/x" },
      ]),
    ).toBe(`${A("/profile/a&amp;b", "Fish &amp; Chips")} cheered on ${A("/story/x", "&lt;Small&gt; Acts")}`);
  });

  it("can't match inside an escaped character", () => {
    // The escaped title has "amp" in "&amp;"; the link has to land on the word.
    expect(digestLine({ type: "encouragement", title: "Dana & Sam cheered on amp", message: "" }, [{ text: "amp", href: "/story/amp" }])).toBe(
      `Dana &amp; Sam cheered on ${A("/story/amp", "amp")}`,
    );
  });

  it("leaves a link out when its text isn't in the title", () => {
    expect(digestLine(cheer, [{ text: "Someone else", href: "/profile/p9" }, smallActs])).toBe(
      `Dana cheered on ${A("/story/small-acts", "Small Acts")}: “Keep going.”`,
    );
    expect(digestLine(cheer, [])).toBe("Dana cheered on Small Acts: “Keep going.”");
  });

  it("never links Someone", () => {
    const hidden = { type: "encouragement", title: "Someone cheered on Small Acts", message: "" };
    expect(digestLine(hidden, [{ text: "Someone", href: "/profile/p1" }, smallActs])).toBe(
      `Someone cheered on ${A("/story/small-acts", "Small Acts")}`,
    );
  });

  it("links only the first occurrence of a name", () => {
    expect(digestLine({ type: "encouragement", title: "Dana cheered on Dana's Garden", message: "" }, [dana])).toBe(
      `${A("/profile/p1", "Dana")} cheered on Dana&#39;s Garden`,
    );
  });

  it("never links the same words twice, or puts a link inside a link", () => {
    // The person and the project share a word: the project's link takes the
    // next free occurrence rather than nesting inside the person's.
    const out = digestLine({ type: "encouragement", title: "Dana cheered on Dana", message: "" }, [
      dana,
      { text: "Dana", href: "/story/dana" },
    ]);
    expect(out).toBe(`${A("/profile/p1", "Dana")} cheered on ${A("/story/dana", "Dana")}`);
    expect(out.match(/<a /g)).toHaveLength(2);
    // Nothing free left: the second link is dropped.
    expect(digestLine({ type: "encouragement", title: "Dana cheered", message: "" }, [dana, { text: "Dana", href: "/story/dana" }])).toBe(
      `${A("/profile/p1", "Dana")} cheered`,
    );
  });
});

describe("digestLinks", () => {
  const from = { userId: "u1" as Id<"users">, profileId: "p1" as Id<"profiles">, name: "Dana", imageUrl: null };
  const project = { title: "Small Acts", href: "/story/small-acts" };

  it("links the person to their profile and the project to its page", () => {
    expect(digestLinks({ from, project })).toEqual([
      { text: "Dana", href: "/profile/p1" },
      { text: "Small Acts", href: "/story/small-acts" },
    ]);
  });

  it("has nothing for a person or project that isn't there", () => {
    expect(digestLinks({ from: null, project })).toEqual([{ text: "Small Acts", href: "/story/small-acts" }]);
    expect(digestLinks({ from, project: null })).toEqual([{ text: "Dana", href: "/profile/p1" }]);
    expect(digestLinks({ from: null, project: null })).toEqual([]);
  });
});

describe("buildSupportDigestEmail", () => {
  const line = (n: number) => ({ type: "encouragement", title: `Person ${n} cheered on Small Acts`, message: "", links: [] });

  it("uses the one thing's own words when there's one", () => {
    const email = buildSupportDigestEmail([line(1)]);
    expect(email.subject).toBe("Person 1 cheered on Small Acts");
    expect(email.heading).toBe(email.subject);
    expect(email.body).toBe("Person 1 cheered on Small Acts");
    expect(email).toMatchObject({ ctaText: "See it", ctaUrl: "/today" });
  });

  it("puts each row's links in the body, and none in the subject or heading", () => {
    const email = buildSupportDigestEmail([
      { ...line(1), links: [{ text: "Person 1", href: "/profile/p1" }, { text: "Small Acts", href: "/story/small-acts" }] },
      line(2),
    ]);
    const [first, second] = email.body.split("<br><br>");
    expect(first).toContain('<a href="/profile/p1" style="color:#111111;text-decoration:underline">Person 1</a>');
    expect(first).toContain('<a href="/story/small-acts" style="color:#111111;text-decoration:underline">Small Acts</a>');
    expect(second).not.toContain("<a ");
    expect(email.subject).toBe("Person 1 cheered on Small Acts, and 1 more");
    expect(email.heading).not.toContain("<a ");
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
