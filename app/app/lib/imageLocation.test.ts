import { crc32 as zlibCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { stripLocation, withoutLocation } from "./imageLocation";

// A TIFF block the way a phone writes one: IFD0 holds Orientation and a
// pointer to the GPS block; the GPS block holds latitude and longitude, each
// three rationals stored after the fields.
const GPS_BLOCK = 38;
const COORDINATES = { start: 92, end: 140 };
const ORIENTATION_VALUE = 18; // offset of IFD0's first field value

function tiff(little = true) {
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

const text = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const concat = (...parts: ArrayLike<number>[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const be16 = (n: number) => [n >> 8, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number) => be32(n).reverse();

const SCAN = [0x12, 0x34, 0x56, 0x78, 0x9a];

function jpeg(...app1s: Uint8Array[]) {
  const segments = app1s.map((data) => concat([0xff, 0xe1], be16(data.length + 2), data));
  const quantTable = concat([0xff, 0xdb], be16(4), [0, 1]);
  return concat([0xff, 0xd8], ...segments, quantTable, [0xff, 0xda], be16(2), SCAN, [0xff, 0xd9]);
}

function pngChunk(type: string, data: Uint8Array) {
  const body = concat(text(type), data);
  return concat(be32(data.length), body, be32(zlibCrc32(body)));
}

function png(...chunks: Uint8Array[]) {
  return concat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pngChunk("IHDR", new Uint8Array(13)), ...chunks, pngChunk("IEND", new Uint8Array()));
}

/** The TIFF block's location, read back the way a viewer would. */
function gpsFieldCount(bytes: Uint8Array, tiffStart: number, little = true): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(tiffStart + GPS_BLOCK, little);
}

function coordinatesZeroed(bytes: Uint8Array, tiffStart: number): boolean {
  return bytes.subarray(tiffStart + COORDINATES.start, tiffStart + COORDINATES.end).every((b) => b === 0);
}

describe("stripLocation", () => {
  it("empties a JPEG's GPS block and keeps orientation and the image data", () => {
    const file = jpeg(concat(text("Exif\0\0"), tiff()));
    const before = file.length;
    const tiffStart = 2 + 4 + 6;

    expect(stripLocation(file)).toBe(true);

    expect(file.length).toBe(before);
    expect(gpsFieldCount(file, tiffStart)).toBe(0);
    expect(coordinatesZeroed(file, tiffStart)).toBe(true);
    expect(file[tiffStart + ORIENTATION_VALUE]).toBe(6);
    expect(Array.from(file.subarray(file.length - 2 - SCAN.length, file.length - 2))).toEqual(SCAN);
  });

  it("reads big-endian (Motorola) TIFF too", () => {
    const file = jpeg(concat(text("Exif\0\0"), tiff(false)));
    expect(stripLocation(file)).toBe(true);
    expect(gpsFieldCount(file, 12, false)).toBe(0);
    expect(coordinatesZeroed(file, 12)).toBe(true);
  });

  it("blanks XMP coordinates and leaves the artist's credit line", () => {
    const xmp =
      'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description exif:GPSLatitude="34,3.2N" ' +
      "exif:GPSLongitude='118,14.5W' dc:rights=\"(c) Ana Ruiz\"/>" +
      "<exif:GPSAltitude>12/1</exif:GPSAltitude></x:xmpmeta>";
    const file = jpeg(text(xmp));
    const before = file.length;

    expect(stripLocation(file)).toBe(true);

    const after = String.fromCharCode(...file);
    expect(file.length).toBe(before);
    expect(after).not.toMatch(/34,3\.2N|118,14\.5W|12\/1/);
    expect(after).toContain('dc:rights="(c) Ana Ruiz"');
    expect(after).toContain('exif:GPSLatitude="       "');
  });

  it("empties a PNG eXIf chunk and rewrites its checksum", () => {
    const file = png(pngChunk("eXIf", tiff()));
    const chunk = 8 + 25; // signature, then IHDR (4 + 4 + 13 + 4)
    const tiffStart = chunk + 8;

    expect(stripLocation(file)).toBe(true);

    expect(gpsFieldCount(file, tiffStart)).toBe(0);
    const body = file.subarray(chunk + 4, tiffStart + 140);
    const stored = new DataView(file.buffer).getUint32(tiffStart + 140);
    expect(stored).toBe(zlibCrc32(body));
  });

  it("empties a WebP EXIF chunk", () => {
    const exif = tiff();
    const vp8 = concat(text("VP8 "), le32(3), [1, 2, 3, 0]); // odd size, padded
    const exifChunk = concat(text("EXIF"), le32(exif.length), exif);
    const file = concat(text("RIFF"), le32(4 + vp8.length + exifChunk.length), text("WEBP"), vp8, exifChunk);
    const tiffStart = 12 + vp8.length + 8;

    expect(stripLocation(file)).toBe(true);
    expect(gpsFieldCount(file, tiffStart)).toBe(0);
    expect(coordinatesZeroed(file, tiffStart)).toBe(true);
  });

  it("finds EXIF inside other containers (HEIC) by its signature", () => {
    const file = concat(text("\0\0\0\x18ftypheic"), new Uint8Array(40).fill(0x45), text("Exif\0\0"), tiff(false));
    const tiffStart = file.length - 140;

    expect(stripLocation(file)).toBe(true);
    expect(gpsFieldCount(file, tiffStart, false)).toBe(0);
  });

  it("leaves a photo with no location untouched", () => {
    const noGps = tiff();
    new DataView(noGps.buffer).setUint16(8, 1, true); // IFD0 keeps only Orientation
    const file = jpeg(concat(text("Exif\0\0"), noGps));
    const copy = file.slice();

    expect(stripLocation(file)).toBe(false);
    expect(file).toEqual(copy);
  });

  it("never throws on a damaged file", () => {
    const truncated = jpeg(concat(text("Exif\0\0"), tiff())).subarray(0, 40);
    expect(() => stripLocation(truncated.slice())).not.toThrow();
    expect(stripLocation(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toBe(false);
    expect(stripLocation(new Uint8Array())).toBe(false);
  });
});

describe("withoutLocation", () => {
  it("returns a new image without the location", async () => {
    const blob = new Blob([jpeg(concat(text("Exif\0\0"), tiff()))], { type: "image/jpeg" });
    const cleaned = await withoutLocation(blob);

    expect(cleaned).not.toBe(blob);
    expect(cleaned.type).toBe("image/jpeg");
    expect(gpsFieldCount(new Uint8Array(await cleaned.arrayBuffer()), 12)).toBe(0);
  });

  it("passes anything else through as the same blob", async () => {
    const audio = new Blob([concat(text("Exif\0\0"), tiff())], { type: "audio/mpeg" });
    const plain = new Blob([jpeg()], { type: "image/jpeg" });

    expect(await withoutLocation(audio)).toBe(audio);
    expect(await withoutLocation(plain)).toBe(plain);
  });
});
