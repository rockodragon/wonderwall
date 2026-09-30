import { describe, expect, it } from "vitest";
import { isOAuthHost } from "./oauthHost";

describe("isOAuthHost", () => {
  it("allows the canonical host and local dev", () => {
    expect(isOAuthHost("thecreative.exchange")).toBe(true);
    expect(isOAuthHost("localhost")).toBe(true);
    expect(isOAuthHost("127.0.0.1")).toBe(true);
  });

  it("sends every other host to the canonical one first", () => {
    expect(isOAuthHost("creatives.exchange")).toBe(false);
    expect(isOAuthHost("www.thecreative.exchange")).toBe(false);
    expect(isOAuthHost("createsd.org")).toBe(false);
  });
});
