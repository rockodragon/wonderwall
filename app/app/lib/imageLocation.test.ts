import { crc32 as zlibCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { stripLocation, withoutLocation } from "./imageLocation";
import {
  ORIENTATION_VALUE,
  SCAN,
  concat,
  coordinatesZeroed,
  gpsFieldCount,
  jpeg,
  text,
  tiff,
} from "../../test-support/photoFixtures";

// The photos (tiff, jpeg) and the readers (gpsFieldCount, coordinatesZeroed)
// are test-support/photoFixtures.ts, shared with constants/promises.test.ts.
// PNG and WebP are only built here.
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number) => be32(n).reverse();

function pngChunk(type: string, data: Uint8Array) {
  const body = concat(text(type), data);
  return concat(be32(data.length), body, be32(zlibCrc32(body)));
}

function png(...chunks: Uint8Array[]) {
  return concat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pngChunk("IHDR", new Uint8Array(13)), ...chunks, pngChunk("IEND", new Uint8Array()));
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
