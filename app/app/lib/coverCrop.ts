// The cover framer's geometry, as pure functions so the preview and the saved
// file come from the same numbers (docs/features/cover-4x5.md).

/** Width over height of a cover: portrait 4:5, the Instagram feed shape. */
export const COVER_ASPECT = 4 / 5;

/** True when a picture is already 4:5, give or take 3%. */
export function isCoverShape(w: number, h: number): boolean {
  if (!(w > 0) || !(h > 0)) return false;
  return Math.abs(w / h - COVER_ASPECT) / COVER_ASPECT <= 0.03;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
}

/**
 * The source rectangle of a 4:5 crop of a w × h picture.
 *
 * At zoom 1 it is the largest 4:5 rectangle that fits inside the picture, so
 * it covers the shorter side. Zoom z divides its size by z. `x` and `y` run
 * from 0 to 1 and place the crop across the slack left over (0.5, 0.5 is
 * centred). Zoom below 1 counts as 1; x and y are clamped to 0..1.
 */
export function cropRect({
  w,
  h,
  zoom,
  x,
  y,
}: {
  w: number;
  h: number;
  zoom: number;
  x: number;
  y: number;
}): { sx: number; sy: number; sw: number; sh: number } {
  const z = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
  // Largest 4:5 rect inside the picture.
  let sw: number;
  let sh: number;
  if (w / h > COVER_ASPECT) {
    sh = h;
    sw = h * COVER_ASPECT;
  } else {
    sw = w;
    sh = w / COVER_ASPECT;
  }
  sw /= z;
  sh /= z;
  return {
    sx: clamp01(x) * (w - sw),
    sy: clamp01(y) * (h - sh),
    sw,
    sh,
  };
}

/** w × h scaled down so the long side is at most `maxLong`. Never scaled up. Whole pixels. */
export function wholeSize(
  w: number,
  h: number,
  maxLong: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxLong / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}
