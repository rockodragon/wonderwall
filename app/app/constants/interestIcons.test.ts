import { describe, expect, it } from "vitest";
import { INTERESTS } from "./interests";
import { FALLBACK_INTEREST_ICON, INTEREST_ICONS, interestIcon } from "./interestIcons";

describe("INTEREST_ICONS", () => {
  it("has an icon for every interest", () => {
    for (const interest of INTERESTS) {
      expect(INTEREST_ICONS[interest], interest).toBeDefined();
    }
  });

  it("has nothing for an interest that isn't on the list", () => {
    expect(Object.keys(INTEREST_ICONS).sort()).toEqual([...INTERESTS].sort());
  });
});

describe("interestIcon", () => {
  it("gives each interest its own icon", () => {
    for (const interest of INTERESTS) expect(interestIcon(interest)).toBe(INTEREST_ICONS[interest]);
  });

  it("falls back for anything unmapped", () => {
    expect(interestIcon("Basket weaving")).toBe(FALLBACK_INTEREST_ICON);
    expect(interestIcon("")).toBe(FALLBACK_INTEREST_ICON);
  });
});
