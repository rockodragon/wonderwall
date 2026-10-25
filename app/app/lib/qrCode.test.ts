import { describe, expect, it } from "vitest";
import { QR_QUIET, qrMatrix, qrPixelSize, qrSvg } from "./qrCode";

const URL = "https://thecreative.exchange/@ana.reyes?ref=qr";

describe("qrMatrix", () => {
  it("is a square grid with the three finder squares in their corners", () => {
    const m = qrMatrix(URL);
    const n = m.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect((n - 17) % 4).toBe(0);
    expect(m.every((row) => row.length === n)).toBe(true);
    // Each finder is a dark 7x7 ring around a dark 3x3 centre.
    for (const [r, c] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ]) {
      expect(m[r][c] && m[r + 6][c + 6] && m[r + 3][c + 3]).toBe(true);
      expect(m[r + 1][c + 1]).toBe(false);
    }
  });

  it("gives the same code for the same text", () => {
    expect(qrMatrix(URL)).toEqual(qrMatrix(URL));
  });
});

describe("qrSvg", () => {
  it("draws every dark square once, inside a quiet zone", () => {
    const m = qrMatrix(URL);
    const total = m.length + QR_QUIET * 2;
    const svg = qrSvg(m);
    expect(svg).toContain(`viewBox="0 0 ${total} ${total}"`);
    expect(svg).toContain('shape-rendering="crispEdges"');
    const d = /<path d="([^"]+)"/.exec(svg)![1];
    const area = [...d.matchAll(/h(\d+)v1/g)].reduce((sum, run) => sum + Number(run[1]), 0);
    expect(area).toBe(m.flat().filter(Boolean).length);
    // The top-left finder's first run starts at the quiet zone's edge.
    expect(d.startsWith(`M${QR_QUIET} ${QR_QUIET}h7v1`)).toBe(true);
  });
});

describe("qrPixelSize", () => {
  it("is whole pixels per square, at least the size asked for", () => {
    for (const modules of [21, 29, 33, 57]) {
      const { cell, size } = qrPixelSize(modules, 1024);
      expect(Number.isInteger(cell)).toBe(true);
      expect(size).toBe(cell * (modules + QR_QUIET * 2));
      expect(size).toBeGreaterThanOrEqual(1024);
    }
    expect(qrPixelSize(29, 2048).size).toBeGreaterThanOrEqual(2048);
  });
});
