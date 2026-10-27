// Photos with a location in them, built byte by byte, and the readers that
// check it's gone. Shared by app/lib/imageLocation.test.ts (the stripper
// itself) and app/constants/promises.test.ts (the promise that rests on it),
// so both test the same file a phone would write.

// A TIFF block the way a phone writes one: IFD0 holds Orientation and a
// pointer to the GPS block; the GPS block holds latitude and longitude, each
// three rationals stored after the fields.
export const GPS_BLOCK = 38;
export const COORDINATES = { start: 92, end: 140 };
export const ORIENTATION_VALUE = 18; // offset of IFD0's first field value

export function tiff(little = true) {
  const bytes = new Uint8Array(140);
  const view = new DataView(bytes.buffer);
  const u16 = (at: number, v: number) => view.setUint16(at, v, little);
  const u32 = (at: number, v: number) => view.setUint32(at, v, little);
  const field = (at: number, tag: number, type: number, count: number, value: number) => {
    u16(at, tag);
    u16(at + 2, type);
    u32(at + 4, count);
    if (type === 3 && count === 1) u16(at + 8, value);
    else u32(at + 8, value);
  };
  bytes.set(little ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  u16(2, 42);
  u32(4, 8);
  u16(8, 2);
  field(10, 0x0112, 3, 1, 6); // Orientation: rotate 90°
  field(22, 0x8825, 4, 1, GPS_BLOCK);
  u16(GPS_BLOCK, 4);
  field(GPS_BLOCK + 2, 0x0001, 2, 2, 0); // LatitudeRef "N"
  bytes[GPS_BLOCK + 2 + 8] = 0x4e;
  field(GPS_BLOCK + 14, 0x0002, 5, 3, 92); // Latitude
  field(GPS_BLOCK + 26, 0x0003, 2, 2, 0); // LongitudeRef "W"
  bytes[GPS_BLOCK + 26 + 8] = 0x57;
  field(GPS_BLOCK + 38, 0x0004, 5, 3, 116); // Longitude
  [34, 1, 3, 1, 1234, 100, 118, 1, 14, 1, 5678, 100].forEach((n, i) => u32(92 + i * 4, n));
  return bytes;
}

export const text = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
export const concat = (...parts: ArrayLike<number>[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
export const be16 = (n: number) => [n >> 8, n & 0xff];

export const SCAN = [0x12, 0x34, 0x56, 0x78, 0x9a];

/** A JPEG holding these APP1 segments (EXIF, XMP), then its image data. */
export function jpeg(...app1s: Uint8Array[]) {
  const segments = app1s.map((data) => concat([0xff, 0xe1], be16(data.length + 2), data));
  const quantTable = concat([0xff, 0xdb], be16(4), [0, 1]);
  return concat([0xff, 0xd8], ...segments, quantTable, [0xff, 0xda], be16(2), SCAN, [0xff, 0xd9]);
}

/** The TIFF block's location, read back the way a viewer would. */
export function gpsFieldCount(bytes: Uint8Array, tiffStart: number, little = true): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(tiffStart + GPS_BLOCK, little);
}

export function coordinatesZeroed(bytes: Uint8Array, tiffStart: number): boolean {
  return bytes.subarray(tiffStart + COORDINATES.start, tiffStart + COORDINATES.end).every((b) => b === 0);
}
