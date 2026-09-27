import { describe, expect, it } from "vitest";
import {
  codeFromRandomUint32,
  hasAttemptsRemaining,
  hashCode,
  isCodeExpired,
  isOverStartLimit,
  MAX_CODE_ATTEMPTS,
  MAX_LINK_STARTS_PER_HOUR,
} from "./phoneLinkCore";

describe("codeFromRandomUint32", () => {
  it("always returns a zero-padded 6-digit string", () => {
    expect(codeFromRandomUint32(0)).toBe("000000");
    expect(codeFromRandomUint32(5)).toBe("000005");
    expect(codeFromRandomUint32(999_999)).toBe("999999");
    expect(codeFromRandomUint32(1_000_000)).toBe("000000");
    expect(codeFromRandomUint32(4_294_967_295)).toHaveLength(6);
  });
});

describe("isCodeExpired", () => {
  it("is not expired before the expiry time", () => {
    expect(isCodeExpired(1_000, 999)).toBe(false);
  });

  it("is expired at or after the expiry time", () => {
    expect(isCodeExpired(1_000, 1_000)).toBe(true);
    expect(isCodeExpired(1_000, 1_001)).toBe(true);
  });
});

describe("hasAttemptsRemaining", () => {
  it("allows attempts under the cap", () => {
    expect(hasAttemptsRemaining(0)).toBe(true);
    expect(hasAttemptsRemaining(MAX_CODE_ATTEMPTS - 1)).toBe(true);
  });

  it("refuses at or over the cap", () => {
    expect(hasAttemptsRemaining(MAX_CODE_ATTEMPTS)).toBe(false);
    expect(hasAttemptsRemaining(MAX_CODE_ATTEMPTS + 1)).toBe(false);
  });
});

describe("isOverStartLimit", () => {
  it("allows starts under the cap", () => {
    expect(isOverStartLimit(0)).toBe(false);
    expect(isOverStartLimit(MAX_LINK_STARTS_PER_HOUR - 1)).toBe(false);
  });

  it("refuses at or over the cap", () => {
    expect(isOverStartLimit(MAX_LINK_STARTS_PER_HOUR)).toBe(true);
  });
});

describe("hashCode", () => {
  it("is deterministic and never returns the code itself", async () => {
    const hash1 = await hashCode("123456");
    const hash2 = await hashCode("123456");
    expect(hash1).toBe(hash2);
    expect(hash1).not.toContain("123456");
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different codes", async () => {
    const hash1 = await hashCode("123456");
    const hash2 = await hashCode("654321");
    expect(hash1).not.toBe(hash2);
  });
});
