// Pure-logic tests for showcase.ts — the open-call application flow.
// No Convex, no network, same style as events.test.ts / follows.test.ts.

import { describe, expect, it } from "vitest";
import {
  clamp,
  compareForJury,
  normalizeEmail,
  normalizeInstagram,
  type JurySortable,
} from "./showcase";

describe("normalizeEmail", () => {
  it("lowercases and trims, so one person is one row", () => {
    expect(normalizeEmail("  Maria@Example.COM ")).toBe("maria@example.com");
  });

  it("rejects the obviously broken", () => {
    for (const bad of ["", "   ", "maria", "maria@", "@example.com", "a@b", "a b@c.com"]) {
      expect(() => normalizeEmail(bad)).toThrow();
    }
  });

  it("rejects an address past the RFC length cap", () => {
    expect(() => normalizeEmail(`${"a".repeat(250)}@example.com`)).toThrow();
  });

  it("accepts the shapes real applicants use", () => {
    for (const ok of [
      "maria.lopez@example.com",
      "maria+showcase@example.co.uk",
      "m@sub.domain.example.org",
    ]) {
      expect(normalizeEmail(ok)).toBe(ok);
    }
  });
});

describe("clamp", () => {
  it("trims and caps", () => {
    expect(clamp("  hello  ", 50)).toBe("hello");
    expect(clamp("abcdef", 3)).toBe("abc");
  });

  it("treats blank as absent, so empty strings never reach the jury sheet", () => {
    expect(clamp(undefined, 10)).toBeUndefined();
    expect(clamp("", 10)).toBeUndefined();
    expect(clamp("   ", 10)).toBeUndefined();
  });
});

describe("normalizeInstagram", () => {
  // Every one of these is a real way someone hands over a handle. They all
  // have to collapse to the same string or the sheet shows one person twice.
  it("reduces every paste-shape to the bare handle", () => {
    const shapes = [
      "youthoodarchive",
      "@youthoodarchive",
      "instagram.com/youthoodarchive",
      "www.instagram.com/youthoodarchive",
      "https://instagram.com/youthoodarchive",
      "https://www.instagram.com/youthoodarchive",
      "https://www.instagram.com/youthoodarchive/",
      "https://www.instagram.com/youthoodarchive?igshid=abc123",
      "http://instagram.com/youthoodarchive/reels/",
      "  @youthoodarchive  ",
    ];
    for (const shape of shapes) {
      expect(normalizeInstagram(shape)).toBe("youthoodarchive");
    }
  });

  it("returns undefined for nothing usable", () => {
    expect(normalizeInstagram(undefined)).toBeUndefined();
    expect(normalizeInstagram("")).toBeUndefined();
    expect(normalizeInstagram("   ")).toBeUndefined();
    expect(normalizeInstagram("@")).toBeUndefined();
    expect(normalizeInstagram("https://instagram.com/")).toBeUndefined();
  });
});

describe("compareForJury", () => {
  const row = (over: Partial<JurySortable> = {}): JurySortable => ({
    createdAt: 1000,
    tally: { yes: 0, maybe: 0, no: 0 },
    ...over,
  });

  it("puts applications with actual work above bare email captures", () => {
    const complete = row({ answeredAt: 1 });
    const emailOnly = row({ tally: { yes: 9, maybe: 9, no: 0 } });
    // Even a wildly popular incomplete row sorts below a complete one —
    // there is nothing on it to read.
    expect(compareForJury(complete, emailOnly)).toBeLessThan(0);
    expect(compareForJury(emailOnly, complete)).toBeGreaterThan(0);
  });

  it("ranks by jury enthusiasm, counting a yes double a maybe", () => {
    const oneYes = row({ answeredAt: 1, tally: { yes: 1, maybe: 0, no: 0 } });
    const twoMaybes = row({ answeredAt: 1, tally: { yes: 0, maybe: 2, no: 0 } });
    const oneMaybe = row({ answeredAt: 1, tally: { yes: 0, maybe: 1, no: 0 } });
    expect(compareForJury(oneYes, oneMaybe)).toBeLessThan(0);
    // 1 yes == 2 maybes, so the tie falls through to recency.
    expect(compareForJury(oneYes, twoMaybes)).toBe(0);
  });

  it("does not let a single no bury an otherwise unreviewed application", () => {
    const oneNo = row({ answeredAt: 1, tally: { yes: 0, maybe: 0, no: 1 } });
    const untouched = row({ answeredAt: 1 });
    expect(compareForJury(oneNo, untouched)).toBe(0);
  });

  it("breaks ties by newest first", () => {
    const older = row({ answeredAt: 1, createdAt: 100 });
    const newer = row({ answeredAt: 1, createdAt: 200 });
    expect(compareForJury(newer, older)).toBeLessThan(0);
  });

  it("produces a stable full ordering", () => {
    const rows: (JurySortable & { id: string })[] = [
      { id: "incomplete", createdAt: 500, tally: { yes: 0, maybe: 0, no: 0 } },
      { id: "loved", answeredAt: 1, createdAt: 100, tally: { yes: 3, maybe: 0, no: 0 } },
      { id: "new", answeredAt: 1, createdAt: 900, tally: { yes: 0, maybe: 0, no: 0 } },
      { id: "liked", answeredAt: 1, createdAt: 100, tally: { yes: 1, maybe: 1, no: 0 } },
    ];
    expect([...rows].sort(compareForJury).map((r) => r.id)).toEqual([
      "loved",
      "liked",
      "new",
      "incomplete",
    ]);
  });
});
