// Where a photo was taken stays with the artist. Phones and cameras write GPS
// coordinates into a photo's metadata, portfolio pieces become public story
// pages, and stored files are served from open links — so an uploaded studio
// photo could hand anyone the studio's address. uploadToStorage
// (lib/uploadFile.ts) runs every image through here before it leaves the
// browser.
//
// Only the location goes. Orientation, camera details and the artist's own
// copyright and credit lines stay, and so does every pixel: re-encoding would
// drop those and soften the picture, so the bytes are edited in place. The
// EXIF GPS block is emptied and XMP location values are blanked to spaces;
// the file keeps its size and everything else.
//
// Best effort: a file this can't read goes up unchanged rather than failing
// the upload.

const EXIF_HEADER = bytesOf("Exif\0\0");
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const XMP_JPEG_HEADER = bytesOf("http://ns.adobe.com/");
const XMP_PNG_KEYWORD = bytesOf("XML:com.adobe.xmp");
const GPS_IFD_TAG = 0x8825;
// Bytes per value for each TIFF field type (1 BYTE … 12 DOUBLE).
const TIFF_TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
// XMP repeats the coordinates as text, as an attribute
// (exif:GPSLatitude="34,1.2N") or an element (<exif:GPSLatitude>…</…>).
const XMP_GPS = /(?:exif|exifEX):GPS\w*\s*=\s*(["'])([^"']*)\1|<((?:exif|exifEX):GPS\w*)>([^<]*)<\/\3>/g;

/** Removes the location from an image's metadata, in place. True when
 *  anything was removed. */
export function stripLocation(bytes: Uint8Array): boolean {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return fromJpeg(bytes);
    if (startsWith(bytes, 0, PNG_SIGNATURE)) return fromPng(bytes);
    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return fromWebp(bytes);
    return fromAnyContainer(bytes);
  } catch {
    return false;
  }
}

/** The blob to upload: the same image without where it was taken. Anything
 *  that isn't an image passes through untouched. */
export async function withoutLocation(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith("image/")) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return stripLocation(bytes) ? new Blob([bytes], { type: blob.type }) : blob;
}

function fromJpeg(bytes: Uint8Array): boolean {
  let changed = false;
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2; // markers with no length
      continue;
    }
    // Scan data begins: metadata segments all come before it.
    if (marker === 0xda || marker === 0xd9) break;
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    if (end > bytes.length) break;
    const data = at + 4;
    if (marker === 0xe1 && startsWith(bytes, data, EXIF_HEADER)) {
      changed = emptyGpsBlock(bytes, data + EXIF_HEADER.length, end) || changed;
    } else if (marker === 0xe1 && startsWith(bytes, data, XMP_JPEG_HEADER)) {
      changed = blankXmpLocation(bytes, data, end) || changed;
    }
    at = end;
  }
  return changed;
}

function fromPng(bytes: Uint8Array): boolean {
  const view = viewOf(bytes);
  let changed = false;
  let at = PNG_SIGNATURE.length;
  while (at + 12 <= bytes.length) {
    const type = ascii(bytes, at + 4, 4);
    const data = at + 8;
    const end = data + view.getUint32(at);
    if (end + 4 > bytes.length) break;
    let touched = false;
    if (type === "eXIf") {
      const tiff = startsWith(bytes, data, EXIF_HEADER) ? data + EXIF_HEADER.length : data;
      touched = emptyGpsBlock(bytes, tiff, end);
    } else if (type === "iTXt" && startsWith(bytes, data, XMP_PNG_KEYWORD)) {
      touched = blankXmpLocation(bytes, data, end);
    }
    // A PNG chunk carries a checksum of its type and data.
    if (touched) view.setUint32(end, crc32(bytes.subarray(at + 4, end)));
    changed = touched || changed;
    if (type === "IEND") break;
    at = end + 4;
  }
  return changed;
}

function fromWebp(bytes: Uint8Array): boolean {
  const view = viewOf(bytes);
  let changed = false;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const type = ascii(bytes, at, 4);
    const size = view.getUint32(at + 4, true);
    const data = at + 8;
    const end = data + size;
    if (end > bytes.length) break;
    if (type === "EXIF") {
      const tiff = startsWith(bytes, data, EXIF_HEADER) ? data + EXIF_HEADER.length : data;
      changed = emptyGpsBlock(bytes, tiff, end) || changed;
    } else if (type === "XMP ") {
      changed = blankXmpLocation(bytes, data, end) || changed;
    }
    at = end + (size & 1); // chunks are padded to an even length
  }
  return changed;
}

// HEIC, AVIF, TIFF and anything else: find the EXIF and XMP blocks by their
// own signatures rather than walking the container.
function fromAnyContainer(bytes: Uint8Array): boolean {
  let changed = isTiffAt(bytes, 0) && emptyGpsBlock(bytes, 0, bytes.length);
  for (let at = bytes.indexOf(EXIF_HEADER[0]); at >= 0; at = bytes.indexOf(EXIF_HEADER[0], at + 1)) {
    const tiff = at + EXIF_HEADER.length;
    if (startsWith(bytes, at, EXIF_HEADER) && isTiffAt(bytes, tiff)) {
      changed = emptyGpsBlock(bytes, tiff, bytes.length) || changed;
    }
  }
  const text = latin1(bytes);
  const xmpStart = text.indexOf("<x:xmpmeta");
  const xmpEnd = text.indexOf("</x:xmpmeta>", xmpStart);
  if (xmpStart >= 0 && xmpEnd > xmpStart) changed = blankXmpLocation(bytes, xmpStart, xmpEnd) || changed;
  return changed;
}

/** Empties the GPS block of the TIFF structure starting at `tiff` (the same
 *  structure sits inside JPEG, PNG, WebP and HEIC). A GPS block with no
 *  fields is valid TIFF, so readers see a photo with no location. */
function emptyGpsBlock(bytes: Uint8Array, tiff: number, end: number): boolean {
  if (!isTiffAt(bytes, tiff) || tiff + 8 > end) return false;
  const view = viewOf(bytes);
  const little = bytes[tiff] === 0x49;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const ifd0 = tiff + u32(tiff + 4);
  if (ifd0 + 2 > end) return false;
  for (let i = 0; i < u16(ifd0); i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > end) return false;
    if (u16(entry) !== GPS_IFD_TAG) continue;
    const gps = tiff + u32(entry + 8);
    if (gps + 2 > end) return false;
    const fields = u16(gps);
    const fieldsEnd = gps + 2 + fields * 12;
    if (fieldsEnd > end) return false;
    for (let f = 0; f < fields; f++) {
      const field = gps + 2 + f * 12;
      const size = (TIFF_TYPE_SIZE[u16(field + 2)] ?? 0) * u32(field + 4);
      // Values over 4 bytes (the coordinates themselves) live elsewhere.
      if (size > 4) {
        const value = tiff + u32(field + 8);
        if (value + size <= end) bytes.fill(0, value, value + size);
      }
    }
    // The field count, the fields and the next-block pointer, all zero.
    bytes.fill(0, gps, Math.min(fieldsEnd + 4, end));
    return fields > 0;
  }
  return false;
}

function blankXmpLocation(bytes: Uint8Array, start: number, end: number): boolean {
  const text = latin1(bytes.subarray(start, end));
  let changed = false;
  for (const match of text.matchAll(XMP_GPS)) {
    const value = match[2] ?? match[4] ?? "";
    if (!value.trim()) continue;
    const opener = match[2] !== undefined ? match[1] : ">";
    const at = start + (match.index ?? 0) + match[0].indexOf(opener) + 1;
    bytes.fill(0x20, at, at + value.length);
    changed = true;
  }
  return changed;
}

function isTiffAt(bytes: Uint8Array, at: number): boolean {
  const little = bytes[at] === 0x49 && bytes[at + 1] === 0x49 && bytes[at + 2] === 0x2a && bytes[at + 3] === 0;
  const big = bytes[at] === 0x4d && bytes[at + 1] === 0x4d && bytes[at + 2] === 0 && bytes[at + 3] === 0x2a;
  return little || big;
}

function startsWith(bytes: Uint8Array, at: number, prefix: ArrayLike<number>): boolean {
  if (at + prefix.length > bytes.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[at + i] !== prefix[i]) return false;
  return true;
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

// One character per byte, so a match's index is its byte offset.
function latin1(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return text;
}

function bytesOf(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

let crcTable: Uint32Array | undefined;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
