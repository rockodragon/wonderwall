import { describe, expect, it } from "vitest";
import { JOIN_TO_SEE_EVERYONE, directoryEnd, directoryNear, moreCreativesLine } from "./directoryPage";

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
});

describe("the join line", () => {
  it("says how many more, in the plural only when there are", () => {
    expect(moreCreativesLine(76)).toBe("76 more creatives here.");
    expect(moreCreativesLine(1)).toBe("1 more creative here.");
    expect(`${moreCreativesLine(76)} ${JOIN_TO_SEE_EVERYONE}`).toBe("76 more creatives here. Join free to see everyone.");
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
