import { describe, expect, it } from "vitest";
import { photoPlan } from "./shrinkImage";

const MB = 1024 * 1024;

describe("photoPlan", () => {
  it("scales a big camera JPEG to 2560 on the long edge", () => {
    expect(photoPlan({ width: 7008, height: 4672, type: "image/jpeg", bytes: 11 * MB })).toEqual({
      width: 2560,
      height: 1707,
      mime: "image/jpeg",
    });
  });
  it("scales a tall photo by its height", () => {
    expect(photoPlan({ width: 3000, height: 6000, type: "image/jpeg", bytes: 2 * MB })).toEqual({
      width: 1280,
      height: 2560,
      mime: "image/jpeg",
    });
  });
  it("re-encodes a heavy photo within 2560 at the same size", () => {
    expect(photoPlan({ width: 2000, height: 1500, type: "image/jpeg", bytes: 5 * MB })).toEqual({
      width: 2000,
      height: 1500,
      mime: "image/jpeg",
    });
  });
  it("leaves a small photo alone", () => {
    expect(photoPlan({ width: 2560, height: 1440, type: "image/jpeg", bytes: 4_000_000 })).toBeNull();
  });
  it("keeps PNG and WebP in their format", () => {
    expect(photoPlan({ width: 5000, height: 3000, type: "image/png", bytes: MB })?.mime).toBe("image/png");
    expect(photoPlan({ width: 5000, height: 3000, type: "image/webp", bytes: MB })?.mime).toBe("image/webp");
    expect(photoPlan({ width: 5000, height: 3000, type: "image/heic", bytes: MB })?.mime).toBe("image/jpeg");
  });
  it("never touches GIF, SVG, video or audio", () => {
    for (const type of ["image/gif", "image/svg+xml", "video/mp4", "audio/mpeg", ""]) {
      expect(photoPlan({ width: 9000, height: 9000, type, bytes: 50 * MB })).toBeNull();
    }
  });
  it("ignores an unreadable size", () => {
    expect(photoPlan({ width: 0, height: 0, type: "image/jpeg", bytes: 50 * MB })).toBeNull();
  });
});
