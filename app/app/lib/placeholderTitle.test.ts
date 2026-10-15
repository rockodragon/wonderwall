import { describe, expect, it } from "vitest";
import { isPlaceholderTitle, shownTitle } from "./placeholderTitle";

describe("placeholder titles", () => {
  it("treats the migration's defaults as no title", () => {
    for (const t of ["Untitled image", "untitled video", " Untitled ", "Untitled link", "", undefined, null]) {
      expect(isPlaceholderTitle(t)).toBe(true);
    }
  });
  it("keeps real titles", () => {
    expect(shownTitle("Hands, ink on paper")).toBe("Hands, ink on paper");
    expect(shownTitle("Untitled No. 3")).toBe("Untitled No. 3");
    expect(shownTitle("Untitled image")).toBeUndefined();
  });
});
