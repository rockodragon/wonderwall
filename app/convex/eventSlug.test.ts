import { describe, expect, it } from "vitest";
import { cleanSlug, dateTag, eventSlugBase } from "./eventSlug";

// Nov 7 2026, 10am Pacific
const NOV7 = Date.UTC(2026, 10, 7, 18, 0);

describe("event slugs", () => {
  it("tags the date in San Diego time", () => {
    expect(dateTag(NOV7)).toBe("nov7");
    // 2am UTC Nov 8 is still Nov 7 in San Diego
    expect(dateTag(Date.UTC(2026, 10, 8, 2, 0))).toBe("nov7");
  });

  it("makes a short readable base from the title", () => {
    expect(eventSlugBase("Creative Renaissance - San Diego", NOV7)).toBe("creative-renaissance-san-nov7");
    expect(eventSlugBase("The Art of the Deal", NOV7)).toBe("art-deal-nov7");
    expect(eventSlugBase("Café & Crème Night!", NOV7)).toBe("cafe-crème-night-nov7".replace("crème", "creme"));
  });

  it("falls back when the title has nothing to use", () => {
    expect(eventSlugBase("!!!", NOV7)).toBe("event-nov7");
  });

  it("cleans a typed address", () => {
    expect(cleanSlug("  Renaissance Nov6! ")).toBe("renaissance-nov6");
  });
});
