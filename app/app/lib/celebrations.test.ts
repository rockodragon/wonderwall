import { afterEach, describe, expect, it, vi } from "vitest";
import {
  awardsToCelebrate,
  celebratedIds,
  celebrationButton,
  celebrationCardId,
  celebrationIcon,
  celebrationIdOf,
  celebrationKicker,
  celebrationLinks,
  isAward,
  leadsWithAmount,
  leadsWithTheirWords,
  linkParts,
  rememberCelebrated,
} from "./celebrations";

describe("card ids", () => {
  it("round-trips a notification id and ignores other cards", () => {
    expect(celebrationCardId("abc")).toBe("celebration:abc");
    expect(celebrationIdOf("celebration:abc")).toBe("abc");
    expect(celebrationIdOf("update:abc")).toBeNull();
    expect(celebrationIdOf("celebration:")).toBeNull();
    expect(celebrationIdOf(null)).toBeNull();
  });
});

describe("what the card says", () => {
  it("names each kind plainly", () => {
    expect(celebrationKicker("encouragement")).toBe("Cheer");
    expect(celebrationKicker("help_offered")).toBe("Offer of help");
    expect(celebrationKicker("fund_award")).toBe("Award");
    expect(celebrationKicker("something_new")).toBe("For you");
  });

  it("leads with their words only for a cheer or an offer that has some", () => {
    expect(leadsWithTheirWords({ type: "encouragement", message: "Go!" })).toBe(true);
    expect(leadsWithTheirWords({ type: "help_offered", message: "A camera" })).toBe(true);
    expect(leadsWithTheirWords({ type: "encouragement", message: "  " })).toBe(false);
    expect(leadsWithTheirWords({ type: "backing_received", message: "$25.00" })).toBe(false);
  });

  it("counts fund awards and approved proposals as awards", () => {
    expect(isAward({ type: "fund_award" })).toBe(true);
    expect(isAward({ type: "grant_proposal_approved" })).toBe(true);
    expect(isAward({ type: "backing_received" })).toBe(false);
  });
});

describe("telling the kinds apart", () => {
  it("gives each kind its own mark", () => {
    expect(celebrationIcon("encouragement")).toBe("clap");
    expect(celebrationIcon("help_offered")).toBe("handshake");
    expect(celebrationIcon("backing_received")).toBe("coins");
    expect(celebrationIcon("gift_received")).toBe("gift");
    expect(celebrationIcon("fund_award")).toBe("trophy");
    expect(celebrationIcon("grant_proposal_approved")).toBe("trophy");
    expect(celebrationIcon("new_follower")).toBeNull();
  });

  it("leads with the amount for money, never for someone's words", () => {
    expect(leadsWithAmount({ type: "backing_received", amountCents: 2500 })).toBe(true);
    expect(leadsWithAmount({ type: "fund_award", amountCents: 50_000 })).toBe(true);
    expect(leadsWithAmount({ type: "gift_received", amountCents: null })).toBe(false);
    expect(leadsWithAmount({ type: "gift_received" })).toBe(false);
    expect(leadsWithAmount({ type: "encouragement", amountCents: 100 })).toBe(false);
  });
});

describe("links on the names", () => {
  it("links the person, the project and the fund, and never Someone", () => {
    expect(
      celebrationLinks({
        from: { userId: "u", profileId: "p1", name: "Dana Lee", imageUrl: null },
        project: { title: "Small Acts", href: "/projects/x" },
        fund: { name: "The Sophia Fund", href: "/fund/abiding-practice" },
      }),
    ).toEqual([
      { text: "Dana Lee", href: "/profile/p1" },
      { text: "Small Acts", href: "/projects/x" },
      { text: "The Sophia Fund", href: "/fund/abiding-practice" },
    ]);
    expect(celebrationLinks({ from: null })).toEqual([]);
  });

  it("cuts text into plain and linked parts, in order", () => {
    const links = [
      { text: "Small Acts", href: "/projects/x" },
      { text: "Dana Lee", href: "/profile/p1" },
    ];
    expect(linkParts("Dana Lee cheered on Small Acts", links)).toEqual([
      { text: "Dana Lee", href: "/profile/p1" },
      { text: " cheered on " },
      { text: "Small Acts", href: "/projects/x" },
    ]);
  });

  it("links a name once, leaves out names that aren't there, and keeps text with no links whole", () => {
    expect(linkParts("Dana and Dana", [{ text: "Dana", href: "/a" }])).toEqual([
      { text: "Dana", href: "/a" },
      { text: " and Dana" },
    ]);
    expect(linkParts("Someone cheered", [{ text: "Dana", href: "/a" }])).toEqual([{ text: "Someone cheered" }]);
    expect(linkParts("", [])).toEqual([]);
  });

  it("lets the longer name win where two overlap", () => {
    // A project named "Dana" inside "Dana Lee" doesn't take the person's link.
    expect(linkParts("Dana Lee cheered on Dana", [{ text: "Dana", href: "/project" }, { text: "Dana Lee", href: "/person" }])).toEqual([
      { text: "Dana Lee", href: "/person" },
      { text: " cheered on " },
      { text: "Dana", href: "/project" },
    ]);
  });
});

describe("the button", () => {
  const from = { userId: "u1", profileId: "p1", name: "Dana", imageUrl: null };

  it("says thanks to a named person", () => {
    expect(celebrationButton({ from, linkUrl: "/projects/x" })).toEqual({ kind: "thanks", label: "Say thanks", userId: "u1" });
  });

  it("otherwise goes where the notification points, labelled by where that is", () => {
    expect(celebrationButton({ from: null, linkUrl: "/fund/abiding-practice" })).toEqual({ kind: "link", label: "See the fund", href: "/fund/abiding-practice" });
    expect(celebrationButton({ from: null, linkUrl: "/story/small-acts" })).toMatchObject({ label: "See the project" });
    expect(celebrationButton({ from: null, linkUrl: "/settings?tab=money" })).toMatchObject({ label: "Get paid" });
    expect(celebrationButton({ from: null, linkUrl: "/give" })).toMatchObject({ label: "See it" });
    expect(celebrationButton({ from: null, linkUrl: null })).toBeNull();
  });
});

describe("confetti once per award", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("picks the awards not yet celebrated", () => {
    const list = [
      { _id: "a", type: "fund_award" },
      { _id: "b", type: "encouragement" },
      { _id: "c", type: "grant_proposal_approved" },
    ];
    expect(awardsToCelebrate(list, new Set(["a"]))).toEqual(["c"]);
  });

  it("remembers what it celebrated, and copes with storage that throws", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    });
    rememberCelebrated(["a"]);
    rememberCelebrated(["b"]);
    expect([...celebratedIds()]).toEqual(["a", "b"]);

    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(celebratedIds().size).toBe(0);
    expect(() => rememberCelebrated(["c"])).not.toThrow();
  });
});
