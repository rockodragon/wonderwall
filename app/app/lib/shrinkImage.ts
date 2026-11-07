// Shrinks a picture in the browser before it's stored. Stored files go to
// every visitor exactly as uploaded, so a phone photo used as a cover or a
// face is drawn smaller here first. Covers (useCoverPick) and avatars
// (useFileUpload's `square`) both go through here.

import { cropRect, wholeSize } from "./coverCrop";

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
 *  goes under any transparent pixels of a PNG. With `keepAlpha` the canvas
 *  stays transparent and is encoded as `mime` (PNG or WebP). */
export async function drawJpeg(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  keepAlpha?: "image/png" | "image/webp",
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  // Size first: resizing a canvas resets its drawing settings.
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.imageSmoothingQuality = "high";
  if (!keepAlpha) {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, width, height);
  }
  draw(ctx);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, keepAlpha ?? "image/jpeg", JPEG_QUALITY),
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

/** Photos longer than this on the long edge are scaled down to it. */
export const PHOTO_MAX_LONG = 2560;
/** A photo already within PHOTO_MAX_LONG is re-encoded when it weighs more. */
export const PHOTO_REENCODE_BYTES = 4_000_000;

export type PhotoPlan = { width: number; height: number; mime: "image/jpeg" | "image/png" | "image/webp" };

/** Whether a picture should be shrunk before upload, and to what size and
 *  format. Null leaves it as it is: not a photo format (GIF may be animated,
 *  SVG is vector), or already small. PNG and WebP keep their format so
 *  transparency survives; everything else becomes a JPEG. */
export function photoPlan(p: { width: number; height: number; type: string; bytes: number }): PhotoPlan | null {
  const type = p.type.toLowerCase();
  if (!type.startsWith("image/") || type === "image/gif" || type.startsWith("image/svg")) return null;
  if (!(p.width > 0) || !(p.height > 0)) return null;
  const long = Math.max(p.width, p.height);
  if (long <= PHOTO_MAX_LONG && p.bytes <= PHOTO_REENCODE_BYTES) return null;
  const { width, height } = wholeSize(p.width, p.height, PHOTO_MAX_LONG);
  const mime = type === "image/png" ? "image/png" : type === "image/webp" ? "image/webp" : "image/jpeg";
  return { width, height, mime };
}

const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** A big photo scaled down (see photoPlan), as a File with the same name and
 *  the extension of its new format. Anything that shouldn't or can't be
 *  shrunk (not a photo, already small, HEIC the browser can't read, a corrupt
 *  file, a result no smaller) comes back as the original: shrinking never
 *  blocks an upload. EXIF orientation is applied to the pixels. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  try {
    if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type.startsWith("image/svg")) return file;
    let bitmap: ImageBitmap | null = null;
    let img: HTMLImageElement | null = null;
    let url: string | null = null;
    try {
      let w: number;
      let h: number;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        w = bitmap.width;
        h = bitmap.height;
      } catch {
        url = URL.createObjectURL(file);
        img = await loadImage(url);
        w = img.naturalWidth;
        h = img.naturalHeight;
      }
      const plan = photoPlan({ width: w, height: h, type: file.type, bytes: file.size });
      if (!plan) return file;
      const source = (bitmap ?? img) as CanvasImageSource;
      const keep = plan.mime === "image/jpeg" ? undefined : plan.mime;
      const blob = await drawJpeg(plan.width, plan.height, (ctx) => ctx.drawImage(source, 0, 0, plan.width, plan.height), keep);
      const scaled = plan.width !== w || plan.height !== h;
      if (!scaled && blob.size >= file.size) return file;
      const name = (file as File).name;
      if (!name) return blob;
      const ext = EXTENSION[blob.type] ?? "jpg";
      return new File([blob], name.replace(/\.[^./\\]+$/, "") + "." + ext, { type: blob.type });
    } finally {
      bitmap?.close();
      if (url) URL.revokeObjectURL(url);
    }
  } catch {
    return file;
  }
}
