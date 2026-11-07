import { describe, expect, it } from "vitest";
import { sizedPhotoUrl } from "./photoSize";

const KEY = "44fe730b-11e9-4742-a3d0-7b102813e70f";
const SIZED = `https://createthegarden.com/cdn-cgi/image/width=1600,fit=scale-down,quality=82,format=auto,onerror=redirect/media/${KEY}`;

// Rick, 2026-11-06: a 7008×4672 cover looked grainy on a small card.
describe("sizedPhotoUrl", () => {
  it("serves our stored photos resized, from The Garden's zone, on either site", () => {
    expect(sizedPhotoUrl(`https://thecreative.exchange/media/${KEY}`)).toBe(SIZED);
    expect(sizedPhotoUrl(`https://createthegarden.com/media/${KEY}`)).toBe(SIZED);
    expect(sizedPhotoUrl(`https://thecreative.exchange/media/${KEY}`, 800)).toContain("width=800,");
  });

  it("falls back to the original if a resize fails", () => {
    expect(sizedPhotoUrl(`https://thecreative.exchange/media/${KEY}`)).toContain("onerror=redirect");
  });

  it("leaves every other address alone", () => {
    const others = [
      `https://happy-otter-123.convex.cloud/api/storage/${KEY}`,
      "https://img.youtube.com/vi/abc/mqdefault.jpg",
      "https://example.com/photo.jpg",
      `https://thecreative.exchange/media/${KEY}?x=1`,
      "/fund/sophia-icon.webp",
      SIZED,
    ];
    for (const url of others) expect(sizedPhotoUrl(url)).toBe(url);
    expect(sizedPhotoUrl(null)).toBeNull();
    expect(sizedPhotoUrl(undefined)).toBeUndefined();
  });
});
