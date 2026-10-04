import { describe, expect, it } from "vitest";
import { isWideCover } from "./useImageAspect";

describe("isWideCover", () => {
  it("treats 4:5, square and unknown as a poster", () => {
    expect(isWideCover(0.8)).toBe(false);
    expect(isWideCover(1)).toBe(false);
    expect(isWideCover(null)).toBe(false);
  });

  it("treats anything wider than 6:5 as a banner", () => {
    expect(isWideCover(1.21)).toBe(true);
    expect(isWideCover(16 / 9)).toBe(true);
  });
});
