import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX, profileDescription, profileTitle, publicProfileUrl } from "./profileHead";

describe("profileTitle", () => {
  it("names the person, their address and the site", () => {
    expect(profileTitle("Ana Reyes", "ana")).toBe("Ana Reyes (@ana) — TheCreative.exchange");
    expect(profileTitle("Ana Reyes")).toBe("Ana Reyes — TheCreative.exchange");
  });
});

describe("profileDescription", () => {
  it("is the first line of the bio", () => {
    expect(profileDescription({ bio: "  Photographer.\nSan Diego, mostly film.  " })).toBe("Photographer.");
    expect(profileDescription({ bio: "One line\r\nTwo" })).toBe("One line");
  });

  it("falls back to what they do and where, then to being here", () => {
    expect(profileDescription({ bio: "", interests: ["Photography", "Film", "Music", "Dance"], location: "San Diego, CA" })).toBe(
      "Photography, Film, Music · San Diego, CA",
    );
    expect(profileDescription({ interests: [], location: "Austin, TX" })).toBe("Austin, TX");
    expect(profileDescription({})).toBe("On TheCreative.exchange.");
  });

  it("cuts a long line for the card", () => {
    const long = "word ".repeat(60).trim();
    const cut = profileDescription({ bio: long });
    expect(cut.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(cut.endsWith("…")).toBe(true);
  });
});

describe("publicProfileUrl", () => {
  it("is the one address on the main site", () => {
    expect(publicProfileUrl("ana")).toBe("https://thecreative.exchange/@ana");
  });
});
