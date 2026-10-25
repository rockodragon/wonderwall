// QR codes for the share kit (components/ProfileShareKit.tsx): the code as
// a grid, drawn as an SVG, onto a canvas, or as a PNG. The grid comes from
// qrcode-generator (MIT, Kazuhiko Arase, no dependencies). Only the share
// kit imports this, and the kit is loaded when its panel opens, so the
// library never rides in the profile page's own bundle.

import qrcode from "qrcode-generator";

/** Dark squares on white: the contrast every scanner reads. */
export const QR_DARK = "#121212";
export const QR_LIGHT = "#ffffff";
/** Light squares around the code. The standard asks for four. */
export const QR_QUIET = 4;

/** The code as rows of squares, true for dark. Medium error correction
 *  (15%): a printed code survives a smudge or a fold. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** The code as an SVG: one square per module, quiet zone included. Each run
 *  of dark squares in a row is one rectangle in a single path. */
export function qrSvg(matrix: readonly (readonly boolean[])[], quiet = QR_QUIET): string {
  const total = matrix.length + quiet * 2;
  let d = "";
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c++;
      d += `M${start + quiet} ${r + quiet}h${c - start}v1h-${c - start}z`;
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total * 8}" height="${total * 8}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${QR_LIGHT}"/><path d="${d}" fill="${QR_DARK}"/></svg>`
  );
}

/** The PNG's size: whole pixels per square, at least `minPx` across. */
export function qrPixelSize(moduleCount: number, minPx: number, quiet = QR_QUIET): { cell: number; size: number } {
  const total = moduleCount + quiet * 2;
  const cell = Math.max(1, Math.ceil(minPx / total));
  return { cell, size: cell * total };
}

/** Draws the code into a `size`-pixel square at (x, y), quiet zone
 *  included. Edges are rounded to whole pixels so no seams show between
 *  squares. `light: null` leaves the background as it is. */
export function drawQr(
  ctx: CanvasRenderingContext2D,
  matrix: readonly (readonly boolean[])[],
  x: number,
  y: number,
  size: number,
  { quiet = QR_QUIET, light = QR_LIGHT as string | null } = {},
): void {
  const total = matrix.length + quiet * 2;
  const at = (i: number) => Math.round((i * size) / total);
  if (light) {
    ctx.fillStyle = light;
    ctx.fillRect(x, y, size, size);
  }
  ctx.fillStyle = QR_DARK;
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      const x0 = at(c + quiet);
      const y0 = at(r + quiet);
      ctx.fillRect(x + x0, y + y0, at(c + quiet + 1) - x0, at(r + quiet + 1) - y0);
    }),
  );
}

/** The code as a PNG at least `minPx` square, for print. */
export async function qrPng(matrix: readonly (readonly boolean[])[], minPx = 2048): Promise<Blob> {
  const { size } = qrPixelSize(matrix.length, minPx);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  drawQr(ctx, matrix, 0, 0, size);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't draw the QR code");
  return blob;
}
