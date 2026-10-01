import { describe, expect, it } from "vitest";
import { hostLabels, hostNamesLine } from "./eventHosts";

describe("hostLabels", () => {
  it("puts hosts with an org first and shows the org", () => {
    const out = hostLabels([
      { name: "Rick Moy" },
      { name: "David Russo", orgName: "Abiding Practice" },
    ]);
    expect(out.map((l) => l.primary)).toEqual(["Abiding Practice", "Rick Moy"]);
    expect(out[0].person).toBe("David Russo");
    expect(out[1].person).toBeNull();
  });
  it("shows an org once", () => {
    expect(
      hostNamesLine([
        { name: "A", orgName: "Abiding Practice" },
        { name: "B", orgName: " abiding practice " },
      ]),
    ).toBe("Abiding Practice");
  });
  it("handles empty and missing input", () => {
    expect(hostNamesLine(undefined)).toBe("");
    expect(hostLabels([null, { name: "  " }])).toEqual([]);
  });
});

describe("org website", () => {
  it("carries the org's website only when the org led", () => {
    const [org, person] = hostLabels([
      { name: "David Russo", orgName: "Abiding Practice", orgUrl: "https://abidingpractice.com" },
      { name: "Rick Moy", orgUrl: "https://example.com" },
    ]);
    expect(org.orgUrl).toBe("https://abidingpractice.com");
    expect(person.orgUrl).toBeNull();
  });
});

describe("org page", () => {
  it("carries the org's page slug only when the org led", () => {
    const [org, person] = hostLabels([
      { name: "David Russo", orgName: "Abiding Practice", orgSlug: "abiding-practice" },
      { name: "Rick Moy", orgSlug: "stray" },
    ]);
    expect(org.orgSlug).toBe("abiding-practice");
    expect(person.orgSlug).toBeNull();
  });
});

describe("card host line", () => {
  it("lists organizations A→Z, then people without one A→Z, with no prefix", () => {
    expect(
      hostNamesLine([
        { name: "Rick Moy", orgName: "Reveal Brand" },
        { name: "Zed" },
        { name: "David Russo", orgName: "abiding Practice" },
        { name: "Amy" },
      ]),
    ).toBe("abiding Practice, Reveal Brand, Amy, Zed");
  });
});
