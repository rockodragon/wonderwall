import { describe, expect, it } from "vitest";
import { fitFontSize, storyLayout } from "./storyImage";

describe("storyLayout", () => {
  it("keeps everything between Instagram's bars, top to bottom in order", () => {
    for (const hasWorks of [true, false]) {
      const at = storyLayout(hasWorks);
      const tops = [at.label, at.photo, at.name, at.handle, ...(at.works === null ? [] : [at.works]), at.qr, at.address];
      expect(tops[0], String(hasWorks)).toBeGreaterThanOrEqual(250);
      // The address is the last line, 56px tall.
      expect(at.address + 56, String(hasWorks)).toBeLessThanOrEqual(1670);
      expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    }
  });

  it("leaves the works out, and moves down to the middle, when there are none", () => {
    expect(storyLayout(true).works).not.toBeNull();
    expect(storyLayout(false).works).toBeNull();
    expect(storyLayout(false).label).toBeGreaterThan(storyLayout(true).label);
  });
});

describe("fitFontSize", () => {
  const measure = (text: string) => (size: number) => text.length * size * 0.5;

  it("is the largest size that fits", () => {
    expect(fitFontSize(measure("Ana"), 960, 88, 56)).toBe(88);
    // 40 characters fit 960 at 48 and below: the floor is 56.
    expect(fitFontSize(measure("x".repeat(40)), 960, 88, 56)).toBe(56);
    expect(fitFontSize(measure("x".repeat(24)), 960, 88, 56)).toBe(80);
  });
});
