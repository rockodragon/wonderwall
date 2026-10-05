// Pure-logic tests for the canvas's celebration cards (notifications.ts). No
// Convex, no network.

import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import { CELEBRATION_TYPES } from "./celebrationTypes";
import {
  CELEBRATION_DAYS,
  MAX_CELEBRATIONS,
  fundSlugFromLink,
  pickCelebrations,
  projectHref,
  projectRefFromLink,
  toCelebration,
} from "./notifications";

const row = (id: string, type: string, createdAt: number, celebratedAt?: number) => ({ id, type, createdAt, celebratedAt });
// Every row above is within the month before this.
const NOW = 1_000;
const DAY = 24 * 60 * 60 * 1000;

describe("pickCelebrations", () => {
  it("keeps every celebration type", () => {
    const rows = CELEBRATION_TYPES.map((t, i) => row(t, t, i));
    expect(pickCelebrations(rows, NOW)).toHaveLength(CELEBRATION_TYPES.length);
  });

  it("leaves out everything else", () => {
    const rows = [
      row("a", "new_message", 5),
      row("b", "encouragement", 4),
      row("c", "grant_proposal_decided", 3),
      row("d", "backing_received", 2),
      row("e", "update", 1),
    ];
    expect(pickCelebrations(rows, NOW).map((r) => r.id)).toEqual(["b", "d"]);
  });

  it("puts the newest first, whatever order they arrive in", () => {
    const rows = [row("old", "encouragement", 1), row("new", "fund_award", 9), row("mid", "help_offered", 5)];
    expect(pickCelebrations(rows, NOW).map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });

  it("stops at eight, dropping the oldest", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`n${i}`, "encouragement", i));
    const picked = pickCelebrations(rows, NOW);
    expect(picked).toHaveLength(MAX_CELEBRATIONS);
    expect(MAX_CELEBRATIONS).toBe(8);
    expect(picked[0].id).toBe("n11");
    expect(picked[7].id).toBe("n4");
  });

  it("doesn't count other types toward the cap", () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => row(`m${i}`, "new_message", 100 + i)),
      row("c", "encouragement", 1),
    ];
    expect(pickCelebrations(rows, NOW).map((r) => r.id)).toEqual(["c"]);
  });

  it("leaves out the ones already done, read or not", () => {
    const rows = [row("done", "encouragement", 5, 6), row("open", "encouragement", 4)];
    expect(pickCelebrations(rows, NOW).map((r) => r.id)).toEqual(["open"]);
  });

  it("lets one nobody closed go after a month", () => {
    const now = 100 * DAY;
    const rows = [row("fresh", "fund_award", now - DAY), row("stale", "fund_award", now - (CELEBRATION_DAYS + 1) * DAY)];
    expect(pickCelebrations(rows, now).map((r) => r.id)).toEqual(["fresh"]);
  });

  it("does not reorder the list it was given", () => {
    const rows = [row("a", "encouragement", 1), row("b", "encouragement", 2)];
    pickCelebrations(rows, NOW);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("toCelebration", () => {
  const note = {
    _id: "n1" as Id<"notifications">,
    type: "encouragement",
    title: "Dana cheered on Small Acts",
    message: "Keep going!",
    linkUrl: "/story/small-acts",
    createdAt: 42,
  };

  const nothing = { from: null, project: null, fund: null };

  it("returns exactly the fields the canvas reads", () => {
    const from = {
      userId: "u1" as Id<"users">,
      profileId: "p1" as Id<"profiles">,
      name: "Dana",
      imageUrl: "https://example.com/dana.jpg",
    };
    const project = { title: "Small Acts", href: "/story/small-acts" };
    expect(
      toCelebration({ ...note, readAt: undefined, userId: "owner" } as typeof note, { from, project, fund: null }),
    ).toEqual({
      _id: "n1",
      type: "encouragement",
      title: "Dana cheered on Small Acts",
      message: "Keep going!",
      linkUrl: "/story/small-acts",
      createdAt: 42,
      from,
      project,
      fund: null,
      amountCents: null,
    });
  });

  it("uses null, not undefined, for a missing link, sender, project, fund and amount", () => {
    const { linkUrl: _link, ...noLink } = note;
    const card = toCelebration(noLink, nothing);
    expect(card.linkUrl).toBeNull();
    expect(card.from).toBeNull();
    expect(card.project).toBeNull();
    expect(card.fund).toBeNull();
    expect(card.amountCents).toBeNull();
  });

  it("carries the amount and the fund's name for an award", () => {
    const fund = { name: "The Sophia Fund", href: "/fund/abiding-practice" };
    const card = toCelebration(
      { ...note, type: "fund_award", linkUrl: "/fund/abiding-practice", amountCents: 50_000 },
      { ...nothing, fund },
    );
    expect(card.amountCents).toBe(50_000);
    expect(card.fund).toEqual(fund);
  });

  it("keeps an amount of zero rather than turning it into null", () => {
    expect(toCelebration({ ...note, amountCents: 0 }, nothing).amountCents).toBe(0);
  });
});

describe("projectRefFromLink", () => {
  it("reads a project id out of /projects/<id>", () => {
    expect(projectRefFromLink("/projects/abc123")).toEqual({ id: "abc123" });
  });

  it("reads a story slug out of /story/<slug>", () => {
    expect(projectRefFromLink("/story/small-acts")).toEqual({ slug: "small-acts" });
  });

  it("ignores a query string, a hash and a trailing slash", () => {
    expect(projectRefFromLink("/story/small-acts?ref=email#top")).toEqual({ slug: "small-acts" });
    expect(projectRefFromLink("/projects/abc123/")).toEqual({ id: "abc123" });
  });

  it("finds no project in any other link", () => {
    expect(projectRefFromLink(undefined)).toBeNull();
    expect(projectRefFromLink("")).toBeNull();
    expect(projectRefFromLink("/give")).toBeNull();
    expect(projectRefFromLink("/fund/abiding-practice")).toBeNull();
    expect(projectRefFromLink("/projects/abc123/edit")).toBeNull();
    expect(projectRefFromLink("/offerings/o1")).toBeNull();
  });
});

describe("fundSlugFromLink", () => {
  it("reads the slug out of /fund/<slug>", () => {
    expect(fundSlugFromLink("/fund/abiding-practice")).toBe("abiding-practice");
    expect(fundSlugFromLink("/fund/garden?x=1")).toBe("garden");
  });

  it("finds no fund in any other link", () => {
    expect(fundSlugFromLink(undefined)).toBeNull();
    expect(fundSlugFromLink("/give")).toBeNull();
    expect(fundSlugFromLink("/funds/garden")).toBeNull();
    expect(fundSlugFromLink("/fund/")).toBeNull();
  });
});

describe("projectHref", () => {
  it("prefers the public story, else the project page", () => {
    expect(projectHref({ _id: "p1", storySlug: "small-acts" })).toBe("/story/small-acts");
    expect(projectHref({ _id: "p1" })).toBe("/projects/p1");
    expect(projectHref({ _id: "p1", storySlug: "" })).toBe("/projects/p1");
  });
});
