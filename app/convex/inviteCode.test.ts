import { describe, expect, it } from "vitest";
import { generateInviteCode, normalizeInviteCode } from "./inviteCode";

describe("generateInviteCode", () => {
  it("generates a 6-character uppercase code from the safe alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
      // No look-alikes.
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });

  it("is deterministic given a fixed random source", () => {
    const random = () => 0; // always picks the first alphabet character
    expect(generateInviteCode(random)).toBe("AAAAAA");
  });
});

describe("normalizeInviteCode", () => {
  it("uppercases a bare typed code", () => {
    expect(normalizeInviteCode("k7m4qd")).toBe("K7M4QD");
  });

  it("strips spaces and dashes from a bare typed code", () => {
    expect(normalizeInviteCode("k7m4-qd")).toBe("K7M4QD");
    expect(normalizeInviteCode("k7m4 qd")).toBe("K7M4QD");
    expect(normalizeInviteCode(" K7M4-QD ")).toBe("K7M4QD");
  });

  it("extracts the code from a pasted full link", () => {
    expect(normalizeInviteCode("creatives.exchange/signup/K7M4QD")).toBe("K7M4QD");
    expect(normalizeInviteCode("https://creatives.exchange/signup/K7M4QD")).toBe(
      "K7M4QD",
    );
    expect(normalizeInviteCode("creatives.exchange/signup/K7M4QD/")).toBe("K7M4QD");
    expect(normalizeInviteCode("creatives.exchange/signup/K7M4QD?ref=email")).toBe(
      "K7M4QD",
    );
  });

  it("preserves an old name-based slug extracted from a link, dashes and all", () => {
    expect(normalizeInviteCode("creatives.exchange/signup/rick-moy")).toBe(
      "rick-moy",
    );
    expect(normalizeInviteCode("https://creatives.exchange/signup/rick-moy-2")).toBe(
      "rick-moy-2",
    );
  });

  it("extracts the code from the older ?invite= query-param link shape", () => {
    expect(normalizeInviteCode("creatives.exchange/?invite=rick-moy")).toBe(
      "rick-moy",
    );
    expect(
      normalizeInviteCode("https://creatives.exchange/?invite=K7M4QD&utm_source=x"),
    ).toBe("K7M4QD");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeInviteCode("")).toBe("");
    expect(normalizeInviteCode(undefined)).toBe("");
    expect(normalizeInviteCode(null)).toBe("");
    expect(normalizeInviteCode("   ")).toBe("");
  });
});
