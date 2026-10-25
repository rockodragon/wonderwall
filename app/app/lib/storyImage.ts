// The Instagram story picture in the share kit (components/ProfileShareKit.tsx):
// 1080 × 1920, drawn on a canvas in the browser and saved as a PNG. The
// person's photo, name and @handle, up to three recent works, the QR code and
// the address written out, in the desk's colors (desk/tokens.ts).
//
// Stored pictures come from /media, which answers with
// Access-Control-Allow-Origin: * (functions/media/[id].ts), so they're loaded
// with crossOrigin="anonymous" and the canvas stays exportable. A picture that
// doesn't load, or won't share, is left out and the rest is drawn without it.

import { DESK, DESK_SANS } from "../desk/tokens";
import { cropRect } from "./coverCrop";
import { initialsOf } from "./initials";
import type { Work } from "./profileShare";
import { drawQr } from "./qrCode";

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/** Instagram covers the top and bottom of a story with its own bars, so
 *  everything sits between these. */
const SAFE_TOP = 250;
const SAFE_BOTTOM = 1670;

const LABEL = 34;
const PHOTO = 260;
const NAME = 96;
const HANDLE = 60;
const TILE = 280;
const TILE_GAP = 28;
const QR = 360;
const ADDRESS = 56;
const GAP = { label: 60, photo: 48, name: 4, handle: 56, works: 64, qr: 36 };

export interface StoryLayout {
  label: number;
  photo: number;
  name: number;
  handle: number;
  /** Top of the row of works; null when there are none to show. */
  works: number | null;
  qr: number;
  address: number;
}

/** Where each part goes, top edges, as one column centered between the
 *  bars. Without works the column is shorter and moves down to the middle. */
export function storyLayout(hasWorks: boolean): StoryLayout {
  const heights = [
    LABEL + GAP.label,
    PHOTO + GAP.photo,
    NAME + GAP.name,
    HANDLE + GAP.handle,
    hasWorks ? TILE + GAP.works : 0,
    QR + GAP.qr,
    ADDRESS,
  ];
  const total = heights.reduce((a, b) => a + b, 0);
  let y = SAFE_TOP + Math.max(0, (SAFE_BOTTOM - SAFE_TOP - total) / 2);
  const tops = heights.map((h) => {
    const top = y;
    y += h;
    return top;
  });
  return {
    label: tops[0],
    photo: tops[1],
    name: tops[2],
    handle: tops[3],
    works: hasWorks ? tops[4] : null,
    qr: tops[5],
    address: tops[6],
  };
}

/** The largest font size from `max` down to `min` at which `measure` says
 *  the text fits `width`; `min` when nothing does. */
export function fitFontSize(measure: (size: number) => number, width: number, max: number, min: number): number {
  for (let size = max; size > min; size -= 2) {
    if (measure(size) <= width) return size;
  }
  return min;
}

/** A picture for the canvas, or null when it doesn't load in time or won't
 *  share its pixels. (lib/shrinkImage.ts loadImage reads the person's own
 *  files, which need no crossOrigin and no time limit.) */
function loadSharedImage(url: string, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

/** The web fonts the app loads (root.tsx), so the canvas doesn't fall back
 *  to the system's while they're still on their way. */
async function fontsReady(): Promise<void> {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts) return;
  await Promise.race([
    Promise.all([fonts.load(`700 88px Inter`), fonts.load(`500 44px Inter`)]).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The picture's centered square, scaled into a w × h box. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = cropRect({ w: img.naturalWidth, h: img.naturalHeight, zoom: 1, x: 0.5, y: 0.5, aspect: w / h });
  ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, x, y, w, h);
}

/** The Exchange mark (public/favicon.svg): two bars crossing. */
function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 48;
  for (const [angle, color] of [
    [-18, DESK.text],
    [18, DESK.accent],
  ] as const) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.fillStyle = color;
    roundedRect(ctx, -4 * s, -21 * s, 8 * s, 42 * s, 4 * s);
    ctx.fill();
    ctx.restore();
  }
}

/** Text centered on the story, shrunk to fit the width, and cut with "…"
 *  if even the smallest size doesn't fit. */
function centeredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  top: number,
  weight: number,
  max: number,
  min: number,
  color: string,
) {
  const width = STORY_WIDTH - 120;
  const font = (size: number) => `${weight} ${size}px ${DESK_SANS}`;
  const size = fitFontSize(
    (s) => {
      ctx.font = font(s);
      return ctx.measureText(text).width;
    },
    width,
    max,
    min,
  );
  ctx.font = font(size);
  let shown = text;
  while (shown.length > 1 && ctx.measureText(shown).width > width) shown = `${shown.slice(0, -2).trimEnd()}…`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(shown, STORY_WIDTH / 2, top);
}

export interface StoryInput {
  name: string;
  handle: string;
  photoUrl: string | null;
  /** At most three are drawn. */
  works: readonly Work[];
  /** The QR code's squares (lib/qrCode.ts qrMatrix). */
  qr: readonly (readonly boolean[])[];
  /** The address as written under the code: thecreative.exchange/@handle. */
  address: string;
}

function draw(
  ctx: CanvasRenderingContext2D,
  input: StoryInput,
  photo: HTMLImageElement | null,
  works: HTMLImageElement[],
) {
  const at = storyLayout(works.length > 0);
  const mid = STORY_WIDTH / 2;

  ctx.fillStyle = DESK.page;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // The mark beside the site's name.
  ctx.font = `600 30px ${DESK_SANS}`;
  const label = "THECREATIVE.EXCHANGE";
  // Letter spacing where the browser has it (not every Safari does).
  const spaced = "letterSpacing" in ctx;
  if (spaced) ctx.letterSpacing = "6px";
  const labelWidth = ctx.measureText(label).width;
  const markSize = 40;
  const rowLeft = mid - (markSize + 16 + labelWidth) / 2;
  drawMark(ctx, rowLeft + markSize / 2, at.label + LABEL / 2, markSize);
  ctx.fillStyle = DESK.muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rowLeft + markSize + 16, at.label + LABEL / 2 + 1);
  if (spaced) ctx.letterSpacing = "0px";

  // The photo, round; the initials without one.
  ctx.save();
  ctx.beginPath();
  ctx.arc(mid, at.photo + PHOTO / 2, PHOTO / 2, 0, Math.PI * 2);
  ctx.clip();
  if (photo) {
    drawCover(ctx, photo, mid - PHOTO / 2, at.photo, PHOTO, PHOTO);
  } else {
    ctx.fillStyle = DESK.lineStrong;
    ctx.fillRect(mid - PHOTO / 2, at.photo, PHOTO, PHOTO);
    ctx.fillStyle = DESK.text;
    ctx.font = `600 100px ${DESK_SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsOf(input.name), mid, at.photo + PHOTO / 2 + 4);
  }
  ctx.restore();

  centeredText(ctx, input.name, at.name, 700, 88, 56, DESK.text);
  centeredText(ctx, `@${input.handle}`, at.handle, 500, 48, 36, DESK.muted);

  // Up to three works in a row.
  if (at.works !== null) {
    const shown = works.slice(0, 3);
    const rowWidth = shown.length * TILE + (shown.length - 1) * TILE_GAP;
    shown.forEach((img, i) => {
      const x = mid - rowWidth / 2 + i * (TILE + TILE_GAP);
      ctx.save();
      roundedRect(ctx, x, at.works!, TILE, TILE, 20);
      ctx.clip();
      drawCover(ctx, img, x, at.works!, TILE, TILE);
      ctx.restore();
    });
  }

  // The code on a white card; its quiet zone is the card's margin.
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, mid - QR / 2, at.qr, QR, QR, 28);
  ctx.fill();
  drawQr(ctx, input.qr, mid - QR / 2, at.qr, QR, { light: null });

  centeredText(ctx, input.address, at.address, 600, 46, 32, DESK.accent);
}

async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't draw the story picture");
  return blob;
}

/** Draws the story picture and encodes it as a PNG. */
export async function drawStory(input: StoryInput): Promise<Blob> {
  const [photo, works] = await Promise.all([
    input.photoUrl ? loadSharedImage(input.photoUrl) : Promise.resolve(null),
    Promise.all(input.works.slice(0, 3).map((w) => loadSharedImage(w.imageUrl))),
    fontsReady(),
  ]);
  const loaded = works.filter((w): w is HTMLImageElement => w !== null);

  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.imageSmoothingQuality = "high";
  draw(ctx, input, photo, loaded);
  try {
    return await encode(canvas);
  } catch {
    // A picture that loaded but won't share its pixels: draw it again without any.
    draw(ctx, input, null, []);
    return await encode(canvas);
  }
}
