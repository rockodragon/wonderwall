import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GARDEN_MARK, GardenLockup } from "./GardenMark";
import { GARDEN } from "./brands";

describe("GardenLockup", () => {
  it("shows the disc beside the name only while GARDEN_MARK is on", () => {
    const html = renderToStaticMarkup(<GardenLockup fontSize={16} grow />);
    expect(html).toContain(GARDEN.name);
    // With no mark there is no svg and no gap: the lockup is the wordmark alone.
    if (GARDEN_MARK === "none") {
      expect(html).not.toContain("<svg");
      expect(html).toContain("gap:0");
    } else {
      expect(html).toContain("<svg");
      expect(html).toContain("gap:5px");
    }
  });
});
