import { describe, expect, it } from "vitest";
import { COVER_ASPECT, cropRect, isCoverShape, wholeSize } from "./coverCrop";

describe("isCoverShape", () => {
  it("accepts 4:5 and anything within 3% of it", () => {
    expect(isCoverShape(1080, 1350)).toBe(true);
    expect(isCoverShape(800, 1000)).toBe(true);
    // 3% either side of 0.8 is 0.776 to 0.824.
    expect(isCoverShape(1000 * 0.78, 1000)).toBe(true);
    expect(isCoverShape(1000 * 0.82, 1000)).toBe(true);
  });

  it("rejects wide, square, tall and 3:4", () => {
    expect(isCoverShape(1600, 900)).toBe(false);
    expect(isCoverShape(1000, 1000)).toBe(false);
    expect(isCoverShape(1000, 2000)).toBe(false);
    expect(isCoverShape(750, 1000)).toBe(false);
    expect(isCoverShape(1000 * 0.77, 1000)).toBe(false);
    expect(isCoverShape(1000 * 0.83, 1000)).toBe(false);
  });

  it("rejects sizes that are not real", () => {
    expect(isCoverShape(0, 100)).toBe(false);
    expect(isCoverShape(100, 0)).toBe(false);
    expect(isCoverShape(NaN, 100)).toBe(false);
  });
});

describe("cropRect", () => {
  const centred = { zoom: 1, x: 0.5, y: 0.5 };

  it("takes the full height of a wide picture, centred across the width", () => {
    const r = cropRect({ w: 1600, h: 900, ...centred });
    expect(r.sh).toBeCloseTo(900);
    expect(r.sw).toBeCloseTo(720);
    expect(r.sx).toBeCloseTo((1600 - 720) / 2);
    expect(r.sy).toBeCloseTo(0);
  });

  it("takes the full width of a tall picture, centred down the height", () => {
    const r = cropRect({ w: 1000, h: 2000, ...centred });
    expect(r.sw).toBeCloseTo(1000);
    expect(r.sh).toBeCloseTo(1250);
    expect(r.sx).toBeCloseTo(0);
    expect(r.sy).toBeCloseTo(375);
  });

  it("trims the sides of a square", () => {
    const r = cropRect({ w: 1000, h: 1000, ...centred });
    expect(r.sh).toBeCloseTo(1000);
    expect(r.sw).toBeCloseTo(800);
    expect(r.sx).toBeCloseTo(100);
    expect(r.sy).toBeCloseTo(0);
  });

  it("is the whole picture when it is already 4:5", () => {
    const r = cropRect({ w: 1080, h: 1350, ...centred });
    expect(r.sx).toBeCloseTo(0);
    expect(r.sy).toBeCloseTo(0);
    expect(r.sw).toBeCloseTo(1080);
    expect(r.sh).toBeCloseTo(1350);
  });

  it("always comes out 4:5", () => {
    for (const [w, h] of [
      [1600, 900],
      [1000, 2000],
      [1000, 1000],
      [3024, 4032],
    ]) {
      for (const zoom of [1, 1.7, 3]) {
        const r = cropRect({ w, h, zoom, x: 0.3, y: 0.8 });
        expect(r.sw / r.sh).toBeCloseTo(COVER_ASPECT, 10);
      }
    }
  });

  it("divides the crop by the zoom", () => {
    const r = cropRect({ w: 1600, h: 900, zoom: 2, x: 0.5, y: 0.5 });
    expect(r.sw).toBeCloseTo(360);
    expect(r.sh).toBeCloseTo(450);
    // Centred in the slack of both axes.
    expect(r.sx).toBeCloseTo((1600 - 360) / 2);
    expect(r.sy).toBeCloseTo((900 - 450) / 2);
  });

  it("places the crop across the slack with x and y", () => {
    const left = cropRect({ w: 1600, h: 900, zoom: 1, x: 0, y: 0 });
    expect(left.sx).toBeCloseTo(0);
    const right = cropRect({ w: 1600, h: 900, zoom: 1, x: 1, y: 1 });
    expect(right.sx + right.sw).toBeCloseTo(1600);
    expect(right.sy + right.sh).toBeCloseTo(900);
  });

  it("keeps the crop inside the picture at every corner and zoom", () => {
    for (const zoom of [1, 1.3, 2, 3]) {
      for (const x of [0, 0.5, 1]) {
        for (const y of [0, 0.5, 1]) {
          const r = cropRect({ w: 1234, h: 987, zoom, x, y });
          expect(r.sx).toBeGreaterThanOrEqual(-1e-9);
          expect(r.sy).toBeGreaterThanOrEqual(-1e-9);
          expect(r.sx + r.sw).toBeLessThanOrEqual(1234 + 1e-9);
          expect(r.sy + r.sh).toBeLessThanOrEqual(987 + 1e-9);
        }
      }
    }
  });

  it("clamps zoom below 1 to 1", () => {
    expect(cropRect({ w: 1600, h: 900, zoom: 0.4, x: 0.5, y: 0.5 })).toEqual(
      cropRect({ w: 1600, h: 900, zoom: 1, x: 0.5, y: 0.5 }),
    );
    expect(cropRect({ w: 1600, h: 900, zoom: -3, x: 0.5, y: 0.5 }).sh).toBeCloseTo(900);
  });

  it("clamps x and y to 0..1", () => {
    expect(cropRect({ w: 1600, h: 900, zoom: 2, x: -5, y: -5 })).toEqual(
      cropRect({ w: 1600, h: 900, zoom: 2, x: 0, y: 0 }),
    );
    expect(cropRect({ w: 1600, h: 900, zoom: 2, x: 9, y: 9 })).toEqual(
      cropRect({ w: 1600, h: 900, zoom: 2, x: 1, y: 1 }),
    );
  });
});

describe("wholeSize", () => {
  it("scales a big picture down so the long side fits", () => {
    expect(wholeSize(4000, 3000, 2160)).toEqual({ width: 2160, height: 1620 });
    expect(wholeSize(3000, 6000, 2160)).toEqual({ width: 1080, height: 2160 });
  });

  it("never scales up", () => {
    expect(wholeSize(800, 600, 2160)).toEqual({ width: 800, height: 600 });
    expect(wholeSize(2160, 1000, 2160)).toEqual({ width: 2160, height: 1000 });
  });

  it("returns whole pixels", () => {
    const { width, height } = wholeSize(4032, 3023, 2160);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
    expect(width).toBe(2160);
    expect(height).toBe(Math.round((3023 * 2160) / 4032));
  });

  it("keeps a sliver at least one pixel", () => {
    expect(wholeSize(10000, 1, 2160).height).toBe(1);
  });
});
