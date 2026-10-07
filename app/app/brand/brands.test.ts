import { describe, expect, it } from "vitest";
import { BRAND_BOOT, GARDEN_HOSTS, allowsBrandOverride, brandForHost, gardenText } from "./brands";
import { GARDEN_G_PATH, IN_DISC, growFrame } from "./GardenMark";

describe("brandForHost", () => {
  it("wears The Garden on its own domains, www and ports included", () => {
    expect(brandForHost("garden.thecreative.exchange")).toBe("garden");
    expect(brandForHost("WWW.Garden.TheCreative.Exchange:443")).toBe("garden");
    expect(brandForHost("thegarden.thecreative.exchange")).toBe("garden");
  });

  it("stays TheCreative.exchange everywhere else", () => {
    // createthegarden.com joins once it's Rick's and points at the site.
    for (const host of ["thecreative.exchange", "www.thecreative.exchange", "localhost", "wonderwall.pages.dev", "garden.com", "createthegarden.com"]) {
      expect(brandForHost(host)).toBe("exchange");
    }
  });
});

describe("BRAND_BOOT", () => {
  it("is a script the browser can parse, carrying every Garden host", () => {
    expect(() => new Function(BRAND_BOOT)).not.toThrow();
    for (const host of GARDEN_HOSTS) expect(BRAND_BOOT).toContain(host);
  });
});

describe("growFrame", () => {
  it("starts as nothing and ends as the disc with the G cut out", () => {
    const start = growFrame(0);
    expect(start.discR).toBe(0);
    expect(start.knock).toBe(0);
    expect(start.stemOffset).toBe(-1);

    const end = growFrame(5);
    expect(end.discR).toBeCloseTo(15);
    expect(end.knock).toBe(1);
    expect(end.stemOffset).toBe(-0);
    expect(end.stemWidth).toBeCloseTo(3.4);
    expect(end.groundOpacity).toBe(0);
    // It ends on the still disc's G, same scale and offset, so GardenGrow
    // hands over to GardenDisc without a jump.
    const numbers = (t: string) => (t.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    expect(numbers(end.groupTransform)).toEqual(numbers(IN_DISC));
    // The stem has become the G: same points as the still mark.
    expect(end.stemD.replace(/\.?0+(?=[ C]|$)/g, "")).toBe(
      GARDEN_G_PATH.replace(/\.?0+(?=[ C]|$)/g, ""),
    );
  });
});

describe("allowsBrandOverride", () => {
  it("honors ?brand= on localhost and previews only", () => {
    expect(allowsBrandOverride("localhost")).toBe(true);
    expect(allowsBrandOverride("127.0.0.1")).toBe(true);
    expect(allowsBrandOverride("abc123.wonderwall.pages.dev")).toBe(true);
    expect(allowsBrandOverride("thecreative.exchange")).toBe(false);
    expect(allowsBrandOverride("garden.thecreative.exchange")).toBe(false);
  });
});

describe("gardenText", () => {
  it("names The Garden, once", () => {
    expect(gardenText("Sign In - TheCreative.exchange")).toBe("Sign In - The Garden");
    expect(gardenText("The Garden — TheCreative.exchange")).toBe("The Garden");
    expect(gardenText("Join TheCreative.exchange")).toBe("Join The Garden");
    expect(gardenText("https://thecreative.exchange/login")).toBe("https://thecreative.exchange/login");
  });
});
