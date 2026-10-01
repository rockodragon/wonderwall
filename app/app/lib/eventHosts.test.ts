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
