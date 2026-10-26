import { describe, expect, it } from "vitest";
import {
  JOIN_TO_SEE_EVERYONE,
  SHORT_SEARCH_HINT,
  cappedLine,
  directoryEnd,
  directoryNear,
  moreCreativesLine,
  searchHint,
} from "./directoryPage";

const page = (shown: number, total: number, visitor: boolean) => ({ people: Array.from({ length: shown }), total, visitor });

describe("directoryEnd — what follows the last card", () => {
  it("Load more for a member with more to see", () => {
    expect(directoryEnd(page(24, 100, false))).toEqual({ kind: "more", remaining: 76 });
    expect(directoryEnd(page(48, 49, false))).toEqual({ kind: "more", remaining: 1 });
  });

  it("the way to join for a visitor who has seen their page", () => {
    expect(directoryEnd(page(24, 100, true))).toEqual({ kind: "join", remaining: 76 });
  });

  it("nothing once everyone who matches is on show, signed in or not", () => {
    expect(directoryEnd(page(24, 24, false))).toBeNull();
    expect(directoryEnd(page(7, 7, true))).toBeNull();
    expect(directoryEnd(page(0, 0, true))).toBeNull();
  });

  it("nothing while the first answer loads", () => {
    expect(directoryEnd(undefined)).toBeNull();
  });

  it("no Load more once a member has as many as one call returns (DIRECTORY_MAX), but how many more and to narrow it", () => {
    expect(directoryEnd(page(999, 1500, false))).toEqual({ kind: "more", remaining: 501 });
    expect(directoryEnd(page(1000, 1500, false))).toEqual({ kind: "capped", remaining: 500 });
    expect(directoryEnd(page(1000, 1000, false))).toBeNull();
    expect(cappedLine(200)).toBe("200 more creatives here. Search or pick a discipline to find them.");
  });
});

describe("the join line", () => {
  it("says how many more, in the plural only when there are", () => {
    expect(moreCreativesLine(76)).toBe("76 more creatives here.");
    expect(moreCreativesLine(1)).toBe("1 more creative here.");
    expect(`${moreCreativesLine(76)} ${JOIN_TO_SEE_EVERYONE}`).toBe("76 more creatives here. Join free to see everyone.");
  });
});

describe("searchHint — a visitor's search too short to run", () => {
  it("tells a visitor who typed one letter that it isn't a search", () => {
    expect(SHORT_SEARCH_HINT).toBe("Type 2 or more letters to search.");
    expect(searchHint("J", true)).toBe(SHORT_SEARCH_HINT);
    expect(searchHint(" J ", true)).toBe(SHORT_SEARCH_HINT);
  });

  it("says nothing once it runs, with nothing typed, to a member, or while loading", () => {
    expect(searchHint("Jo", true)).toBeNull();
    expect(searchHint("", true)).toBeNull();
    expect(searchHint("   ", true)).toBeNull();
    expect(searchHint(undefined, true)).toBeNull();
    expect(searchHint("J", false)).toBeNull();
    expect(searchHint("J", undefined)).toBeNull();
  });
});

describe("directoryNear — Near me as the server is asked it", () => {
  it("rounds the position to the precision profiles are measured at", () => {
    expect(directoryNear({ pos: { lat: 36.162712, lng: -86.781601 }, radius: 25 })).toEqual({ lat: 36.16, lng: -86.78, radius: 25 });
  });

  it("is nothing when Near me is off", () => {
    expect(directoryNear(null)).toBeUndefined();
    expect(directoryNear(undefined)).toBeUndefined();
  });
});
