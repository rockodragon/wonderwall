import { describe, expect, it } from "vitest";
import { groupFollows } from "./groupFollows";

function follow(name: string, favoritedAt: number, interests: string[]) {
  return { favoritedAt, profile: { name, interests } };
}

describe("groupFollows — under the threshold", () => {
  it("returns one unlabelled group with everyone in it", () => {
    const items = [
      follow("a", 1, ["Design"]),
      follow("b", 3, ["Music"]),
      follow("c", 2, []),
    ];
    const result = groupFollows(items);
    expect(result.grouped).toBe(false);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].label).toBe("");
    expect(result.groups[0].items).toHaveLength(3);
  });

  it("sorts most recently followed first", () => {
    const items = [
      follow("a", 1, ["Design"]),
      follow("b", 3, ["Music"]),
      follow("c", 2, []),
    ];
    const names = groupFollows(items).groups[0].items.map(
      (i) => i.profile.name,
    );
    expect(names).toEqual(["b", "c", "a"]);
  });

  it("an empty list is flat, not grouped", () => {
    expect(groupFollows([])).toEqual({
      grouped: false,
      groups: [{ label: "", items: [] }],
    });
  });

  it("does not mutate the input", () => {
    const items = [follow("a", 1, []), follow("b", 2, [])];
    groupFollows(items);
    expect(items.map((i) => i.profile.name)).toEqual(["a", "b"]);
  });
});

describe("groupFollows — at or over the threshold", () => {
  const items = [
    follow("music-old", 1, ["Music", "Design"]),
    follow("design-1", 6, ["Design"]),
    follow("none", 4, []),
    follow("music-new", 5, ["Music"]),
    follow("writing", 2, ["Writing"]),
    follow("design-2", 3, ["Design", "Music"]),
  ];

  it("groups by the first interest, in INTERESTS order", () => {
    const result = groupFollows(items);
    expect(result.grouped).toBe(true);
    expect(result.groups.map((g) => g.label)).toEqual([
      "Design",
      "Writing",
      "Music",
      "Other",
    ]);
  });

  it("sorts most recently followed first within a group", () => {
    const music = groupFollows(items).groups.find((g) => g.label === "Music");
    expect(music?.items.map((i) => i.profile.name)).toEqual([
      "music-new",
      "music-old",
    ]);
  });

  it("puts people with no interests under Other", () => {
    const other = groupFollows(items).groups.find((g) => g.label === "Other");
    expect(other?.items.map((i) => i.profile.name)).toEqual(["none"]);
  });

  it("puts a first interest that is not in INTERESTS under Other", () => {
    const withLegacy = [...items, follow("legacy", 9, ["Basket weaving"])];
    const other = groupFollows(withLegacy).groups.find(
      (g) => g.label === "Other",
    );
    expect(other?.items.map((i) => i.profile.name)).toEqual(["legacy", "none"]);
  });

  it("the threshold is inclusive and adjustable", () => {
    expect(groupFollows(items, 7).grouped).toBe(false);
    expect(groupFollows(items, 6).grouped).toBe(true);
    expect(groupFollows(items.slice(0, 2), 2).grouped).toBe(true);
  });

  it("omits groups nobody falls into", () => {
    const labels = groupFollows(items).groups.map((g) => g.label);
    expect(labels).not.toContain("Photography");
  });
});
