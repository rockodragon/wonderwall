import { describe, expect, it } from "vitest";
import {
  checkYears,
  normalizeSocial,
  orgNameKey,
  primaryPosition,
  slugifyOrgName,
  socialUrl,
  sortPositions,
  yearsLabel,
} from "./organizationRules";

const NOW = new Date("2026-10-01T12:00:00");

describe("orgNameKey / slugifyOrgName", () => {
  it("treats spacing and case as the same organization", () => {
    expect(orgNameKey("  Abiding   Practice ")).toBe(orgNameKey("abiding practice"));
  });
  it("makes a readable slug and never an empty one", () => {
    expect(slugifyOrgName("Abiding Practice")).toBe("abiding-practice");
    expect(slugifyOrgName("Café Rouge & Co.")).toBe("cafe-rouge-and-co");
    expect(slugifyOrgName("!!!")).toBe("org");
    expect(slugifyOrgName("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe("normalizeSocial", () => {
  it("reduces Instagram input to the handle", () => {
    for (const raw of ["@abidingpractice", "abidingpractice", "instagram.com/abidingpractice", "https://www.instagram.com/abidingpractice/?hl=en"]) {
      expect(normalizeSocial("instagram", raw)).toEqual({ ok: true, value: "abidingpractice" });
    }
  });
  it("accepts x.com and twitter.com links", () => {
    expect(normalizeSocial("x", "https://twitter.com/rickmoy")).toEqual({ ok: true, value: "rickmoy" });
    expect(normalizeSocial("x", "x.com/rickmoy")).toEqual({ ok: true, value: "rickmoy" });
  });
  it("keeps LinkedIn's company/in path and reads a bare name as a company", () => {
    expect(normalizeSocial("linkedin", "https://www.linkedin.com/company/abiding-practice/")).toEqual({ ok: true, value: "company/abiding-practice" });
    expect(normalizeSocial("linkedin", "linkedin.com/in/rick-moy")).toEqual({ ok: true, value: "in/rick-moy" });
    expect(normalizeSocial("linkedin", "abiding-practice")).toEqual({ ok: true, value: "company/abiding-practice" });
  });
  it("clears on empty and refuses another site's link or junk", () => {
    expect(normalizeSocial("instagram", " ")).toEqual({ ok: true, value: null });
    expect(normalizeSocial("instagram", "https://tiktok.com/@someone").ok).toBe(false);
    expect(normalizeSocial("x", "way too long a handle for x").ok).toBe(false);
    expect(normalizeSocial("linkedin", "https://linkedin.com/feed/").ok).toBe(false);
  });
  it("builds the link back", () => {
    expect(socialUrl("instagram", "abidingpractice")).toBe("https://instagram.com/abidingpractice");
    expect(socialUrl("linkedin", "company/abiding-practice")).toBe("https://www.linkedin.com/company/abiding-practice");
  });
});

describe("years", () => {
  it("accepts blanks, ranges and current positions", () => {
    expect(checkYears(undefined, undefined, NOW)).toBeNull();
    expect(checkYears(2019, null, NOW)).toBeNull();
    expect(checkYears(2016, 2021, NOW)).toBeNull();
  });
  it("refuses backwards, future-ended and non-year values", () => {
    expect(checkYears(2021, 2016, NOW)).not.toBeNull();
    expect(checkYears(2020, 2030, NOW)).not.toBeNull();
    expect(checkYears(19, null, NOW)).not.toBeNull();
    expect(checkYears(2019.5, null, NOW)).not.toBeNull();
  });
  it("labels them plainly", () => {
    expect(yearsLabel(2019, null)).toBe("Since 2019");
    expect(yearsLabel(2016, 2021)).toBe("2016 – 2021");
    expect(yearsLabel(null, 2021)).toBe("Until 2021");
    expect(yearsLabel()).toBe("");
  });
});

describe("primaryPosition / sortPositions", () => {
  const a = { id: "a", order: 1, createdAt: 1 };
  const b = { id: "b", order: 0, createdAt: 2, endYear: 2020 };
  const c = { id: "c", order: 2, createdAt: 3 };
  const d = { id: "d", order: 3, createdAt: 4, endYear: 2023 };
  it("skips former positions when picking the primary", () => {
    expect(primaryPosition([a, b, c])?.id).toBe("a");
    expect(primaryPosition([b])).toBeNull();
  });
  it("lists current in order, then former by most recent end", () => {
    expect(sortPositions([d, c, b, a]).map((p) => p.id)).toEqual(["a", "c", "d", "b"]);
  });
});
