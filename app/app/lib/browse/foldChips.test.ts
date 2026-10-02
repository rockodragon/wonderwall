import { describe, expect, it } from "vitest";
import { visibleChips } from "./foldChips";

const opts = { gap: 8, moreWidth: 60 };

describe("visibleChips", () => {
  it("keeps every chip when they all fit, with no room held for More", () => {
    // 3 chips of 100 + 2 gaps = 316
    expect(visibleChips([100, 100, 100], { ...opts, available: 316 })).toEqual([0, 1, 2]);
  });

  it("folds from the end and leaves room for the More button", () => {
    // More 60 + (8+100) + (8+100) = 276 fits in 300; a third would be 384.
    expect(visibleChips([100, 100, 100, 100], { ...opts, available: 300 })).toEqual([0, 1]);
  });

  it("folds nothing that would have fit without More, even when More wouldn't fit beside it", () => {
    expect(visibleChips([100, 100], { ...opts, available: 208 })).toEqual([0, 1]);
  });

  it("never folds the active chip, and keeps the others in order", () => {
    // Chip 3 is on. More 60 + (8+100) for chip 3 = 168; chip 0 adds 108 = 276; chip 1 would pass 300.
    expect(visibleChips([100, 100, 100, 100], { ...opts, available: 300, activeIndex: 3 })).toEqual([0, 3]);
  });

  it("shows only the active chip when nothing else fits", () => {
    expect(visibleChips([100, 100, 100], { ...opts, available: 120, activeIndex: 2 })).toEqual([2]);
  });

  it("shows nothing but More when no chip fits and none is active", () => {
    expect(visibleChips([100, 100], { ...opts, available: 80 })).toEqual([]);
  });

  it("handles an empty row", () => {
    expect(visibleChips([], { ...opts, available: 100 })).toEqual([]);
  });
});
