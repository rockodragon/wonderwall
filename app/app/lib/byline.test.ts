import { describe, expect, it } from "vitest";
import { bylineOf } from "./byline";

describe("bylineOf", () => {
  it("is the organization when the project was posted as one", () => {
    expect(
      bylineOf({
        organization: { name: "Abiding Practice", slug: "abiding-practice", logoUrl: "https://x/logo.png" },
        creator: { _id: "p1", name: "Rick", imageUrl: "https://x/rick.png" },
      }),
    ).toEqual({
      kind: "org",
      name: "Abiding Practice",
      imageUrl: "https://x/logo.png",
      href: "/orgs/abiding-practice",
    });
  });

  it("is the creator otherwise", () => {
    expect(bylineOf({ organization: null, creator: { _id: "p1", name: "Rick", imageUrl: null } })).toEqual({
      kind: "person",
      name: "Rick",
      imageUrl: null,
      href: "/profile/p1",
    });
  });

  it("has no image when none was set", () => {
    expect(bylineOf({ organization: { name: "A", slug: "a" } })?.imageUrl).toBeNull();
    expect(bylineOf({ creator: { _id: "p1", name: "Rick" } })?.imageUrl).toBeNull();
  });

  it("is null with neither", () => {
    expect(bylineOf({})).toBeNull();
    expect(bylineOf({ organization: null, creator: null })).toBeNull();
  });
});
