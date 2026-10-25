// Shrinks a picture in the browser before it's stored. Stored files go to
// every visitor exactly as uploaded, so a phone photo used as a cover or a
// face is drawn smaller here first. Covers (useCoverPick) and avatars
// (useFileUpload's `square`) both go through here.

import { cropRect } from "./coverCrop";

/** How wide an avatar is stored. Every face is shown as a circle, 96px at
 *  the largest (the profile header), so 512 stays sharp on a 3x screen with
 *  room to spare. */
export const AVATAR_PX = 512;

const JPEG_QUALITY = 0.86;

export const UNREADABLE_PICTURE = "This picture can't be read here. Try a JPG or PNG.";

/** Loads a picture. `onload`, not `img.decode()`: Chrome never settles
 *  decode() for a page that's hidden, as it can be while a phone's photo
 *  picker is open. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read the picture"));
    img.src = url;
  });
}

/** Draws onto a width × height canvas and encodes it as a JPEG. A dark fill
 *  goes under any transparent pixels of a PNG. */
export async function drawJpeg(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  // Size first: resizing a canvas resets its drawing settings.
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, width, height);
  draw(ctx);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Couldn't encode the picture");
  return blob;
}

/** The centred square of a picture as a JPEG, at most `size` pixels wide
 *  (never scaled up). Throws when the browser can't read the picture. */
export async function squareJpeg(file: Blob, size: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error("Couldn't read the picture");
    const r = cropRect({ w, h, zoom: 1, x: 0.5, y: 0.5, aspect: 1 });
    const side = Math.max(1, Math.round(Math.min(size, r.sw)));
    return await drawJpeg(side, side, (ctx) => ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, side, side));
  } finally {
    URL.revokeObjectURL(url);
  }
}
