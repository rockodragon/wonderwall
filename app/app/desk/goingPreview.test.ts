import { describe, expect, it } from "vitest";
import { goingPreview, type GoingPerson } from "./goingPreview";

let n = 0;
const person = (name: string, over: Partial<GoingPerson> = {}): GoingPerson => ({
  key: `k${++n}`,
  userId: `u-${name}`,
  profileId: `p-${name}`,
  name,
  imageUrl: `https://x/${name}.jpg`,
  joinedAt: n,
  extraTickets: 0,
  ...over,
});

const NONE = new Set<string>();

describe("goingPreview", () => {
  it("names one person", () => {
    expect(goingPreview([person("Ana Ruiz")], null, NONE).line).toBe("Ana is going");
  });

  it("names two people", () => {
    expect(goingPreview([person("Ana Ruiz"), person("Ben Cho")], null, NONE).line).toBe("Ana and Ben are going");
  });

  it("names two and counts the rest", () => {
    const list = [person("Ana"), person("Ben"), person("Cy"), person("Di")];
    expect(goingPreview(list, null, NONE).line).toBe("Ana, Ben and 2 others are going");
    expect(goingPreview(list.slice(0, 3), null, NONE).line).toBe("Ana, Ben and 1 other are going");
  });

  it("counts extra tickets among the others", () => {
    expect(goingPreview([person("Ana", { extraTickets: 2 })], null, NONE).line).toBe("Ana and 2 others are going");
  });

  it("puts people you follow first, then people with a photo", () => {
    const list = [
      person("Ann", { imageUrl: null }),
      person("Bo"),
      person("Cy", { imageUrl: null }),
      person("Dee"),
    ];
    const followed = new Set(["p-Cy"]);
    const { faces, line } = goingPreview(list, null, followed);
    expect(faces.map((p) => p.name)).toEqual(["Cy", "Bo", "Dee", "Ann"]);
    expect(line).toBe("Cy, Bo and 2 others are going");
  });

  it("leaves you out; the button already says you're going", () => {
    const me = person("Rick", { userId: "u-me" });
    expect(goingPreview([me, person("Ana")], "u-me", NONE).line).toBe("Ana is going");
    expect(goingPreview([me], "u-me", NONE)).toEqual({ faces: [], line: null });
  });

  it("skips nameless members for names but still counts them", () => {
    const list = [person("Anonymous", { imageUrl: null }), person("Ana")];
    expect(goingPreview(list, null, NONE).line).toBe("Ana and 1 other are going");
  });

  it("falls back to the count when nobody has a name", () => {
    expect(goingPreview([person("Anonymous"), person("Anonymous")], null, NONE).line).toBe("2 going");
  });

  it("shows at most four faces", () => {
    const list = ["A", "B", "C", "D", "E", "F"].map((x) => person(x));
    expect(goingPreview(list, null, NONE).faces).toHaveLength(4);
  });

  it("says nothing when nobody is going", () => {
    expect(goingPreview([], null, NONE)).toEqual({ faces: [], line: null });
  });
});
