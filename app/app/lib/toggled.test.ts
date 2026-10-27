import { describe, expect, it } from "vitest";
import { toggled } from "./toggled";

describe("toggled", () => {
  it("puts an item that isn't there on the end", () => {
    expect(toggled(["Music"], "Art")).toEqual(["Music", "Art"]);
    expect(toggled([], "Art")).toEqual(["Art"]);
  });

  it("takes out one that is, keeping the order of the rest", () => {
    expect(toggled(["Music", "Art", "Craft"], "Art")).toEqual(["Music", "Craft"]);
  });

  it("leaves the list it was given alone", () => {
    const list = ["Music"];
    toggled(list, "Art");
    expect(list).toEqual(["Music"]);
  });
});
