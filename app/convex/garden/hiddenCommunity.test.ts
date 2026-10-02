// The hidden (test) community rule — pure. The handlers that apply it are
// tested in convex/hiddenCommunity.test.ts.

import { describe, expect, it } from "vitest";
import { canSeeCommunity, isHiddenCommunity } from "./hiddenCommunity";
import { slugifyTitle } from "./stories";
import { validateApplication } from "./communities";

describe("isHiddenCommunity", () => {
  it("is true when the name starts with an underscore", () => {
    expect(isHiddenCommunity({ name: "_TeamTest", slug: "teamtest" })).toBe(true);
    expect(isHiddenCommunity({ name: "_x" })).toBe(true);
  });

  it("trims the name first", () => {
    expect(isHiddenCommunity({ name: "  _TeamTest" })).toBe(true);
    expect(isHiddenCommunity({ name: "\n_TeamTest  ", slug: "x" })).toBe(true);
  });

  it("is true when only the slug starts with an underscore", () => {
    expect(isHiddenCommunity({ name: "Team Test", slug: "_teamtest" })).toBe(true);
    expect(isHiddenCommunity({ slug: "_teamtest" })).toBe(true);
  });

  it("is false for ordinary communities", () => {
    expect(isHiddenCommunity({ name: "The Garden", slug: "the-garden" })).toBe(false);
    expect(isHiddenCommunity({ name: "Team_Test", slug: "team-test" })).toBe(false);
    expect(isHiddenCommunity({ name: "Test_", slug: "test" })).toBe(false);
    expect(isHiddenCommunity({ name: "", slug: "" })).toBe(false);
    expect(isHiddenCommunity({})).toBe(false);
    expect(isHiddenCommunity(null)).toBe(false);
    expect(isHiddenCommunity(undefined)).toBe(false);
  });

  it("an underscore later in the name does not hide it", () => {
    expect(isHiddenCommunity({ name: "Test _ Space", slug: "test-space" })).toBe(false);
  });
});

describe("how a hidden name is created", () => {
  it("the generated slug drops the underscore, so the NAME is what carries the marker", () => {
    expect(slugifyTitle("_TeamTest")).toBe("teamtest");
    expect(isHiddenCommunity({ name: "_TeamTest", slug: slugifyTitle("_TeamTest") })).toBe(true);
  });

  it("the application form accepts a leading underscore", () => {
    expect(validateApplication({ name: "_TeamTest" })).toBeNull();
  });
});

describe("canSeeCommunity", () => {
  const hidden = { name: "_TeamTest", slug: "teamtest" };
  const ordinary = { name: "The Garden", slug: "the-garden" };
  const stranger = { isAdmin: false, isActiveMember: false };

  it("an ordinary community is visible to everyone", () => {
    expect(canSeeCommunity(ordinary, stranger)).toBe(true);
  });

  it("a hidden one is visible only to admins and its active members", () => {
    expect(canSeeCommunity(hidden, stranger)).toBe(false);
    expect(canSeeCommunity(hidden, { isAdmin: true, isActiveMember: false })).toBe(true);
    expect(canSeeCommunity(hidden, { isAdmin: false, isActiveMember: true })).toBe(true);
  });
});
