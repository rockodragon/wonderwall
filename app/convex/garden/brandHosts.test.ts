import { describe, expect, it } from "vitest";
import { allowedAuthRedirect, isGardenHost, siteNameForUrl } from "./brandHosts";

const SITE = "https://thecreative.exchange";

describe("allowedAuthRedirect", () => {
  it("keeps the library's rules for the main site", () => {
    expect(allowedAuthRedirect("/today", SITE)).toBe("https://thecreative.exchange/today");
    expect(allowedAuthRedirect("?x=1", SITE)).toBe("https://thecreative.exchange?x=1");
    expect(allowedAuthRedirect("https://thecreative.exchange/login?redirect=/x", SITE)).toBe(
      "https://thecreative.exchange/login?redirect=/x",
    );
    expect(allowedAuthRedirect("/today", `${SITE}/`)).toBe("https://thecreative.exchange/today");
    // A path is always on SITE_URL, as in the library: "//evil.example" stays home.
    expect(allowedAuthRedirect("//evil.example", SITE)).toBe("https://thecreative.exchange//evil.example");
  });

  it("lets The Garden's addresses be returned to", () => {
    expect(allowedAuthRedirect("https://garden.thecreative.exchange/login", SITE)).toBe(
      "https://garden.thecreative.exchange/login",
    );
    expect(allowedAuthRedirect("https://www.garden.thecreative.exchange/x", SITE)).toBe(
      "https://www.garden.thecreative.exchange/x",
    );
  });

  it("refuses anywhere else, look-alikes and plain http included", () => {
    for (const bad of [
      "https://evil.example/login",
      "https://thecreative.exchange.evil.example/",
      "https://garden.thecreative.exchange.evil.example/",
      "http://garden.thecreative.exchange/login",
      "https://garden.thecreative.exchange@evil.example/",
      "https://garden.thecreative.exchange:8443/",
      // Not Rick's yet (2026-10-03): never a place to send a sign-in code.
      "https://createthegarden.com/x",
    ]) {
      expect(() => allowedAuthRedirect(bad, SITE)).toThrow(/Invalid `redirectTo`/);
    }
  });
});

describe("siteNameForUrl", () => {
  it("names The Garden for its addresses and the platform otherwise", () => {
    expect(siteNameForUrl("https://garden.thecreative.exchange/?code=123456")).toBe("The Garden");
    expect(siteNameForUrl("https://www.garden.thecreative.exchange/login?code=1")).toBe("The Garden");
    expect(siteNameForUrl("https://createthegarden.com/login?code=1")).toBe("TheCreative.exchange");
    expect(siteNameForUrl("https://thecreative.exchange?code=1")).toBe("TheCreative.exchange");
    expect(siteNameForUrl(undefined)).toBe("TheCreative.exchange");
    expect(siteNameForUrl("not a url")).toBe("TheCreative.exchange");
  });

  it("knows the hosts with www and ports", () => {
    expect(isGardenHost("WWW.Garden.TheCreative.Exchange:443")).toBe(true);
    expect(isGardenHost("thecreative.exchange")).toBe(false);
  });
});
