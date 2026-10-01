import { describe, expect, it } from "vitest";
import { normalizeOrgUrl } from "./profiles";

describe("normalizeOrgUrl", () => {
  it("adds https and keeps the host and path", () => {
    expect(normalizeOrgUrl("abidingpractice.com")).toEqual({ ok: true, value: "https://abidingpractice.com" });
    expect(normalizeOrgUrl("www.x.org/give/")).toEqual({ ok: true, value: "https://www.x.org/give" });
    expect(normalizeOrgUrl("http://x.org")).toEqual({ ok: true, value: "http://x.org" });
  });
  it("clears on empty and refuses junk", () => {
    expect(normalizeOrgUrl("")).toEqual({ ok: true, value: null });
    expect(normalizeOrgUrl("   ")).toEqual({ ok: true, value: null });
    expect(normalizeOrgUrl("not a site").ok).toBe(false);
    expect(normalizeOrgUrl("javascript:alert(1)").ok).toBe(false);
  });
});
