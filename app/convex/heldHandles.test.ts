// The held names (heldHandles.ts): every entry a valid address, lowercase,
// listed once, and each category answered with its own code and words.
// Pure, no Convex.

import { describe, expect, it } from "vitest";
import { HANDLE_MAX_LENGTH, handleProblem, RESERVED_HANDLES } from "./handleRules";
import {
  HANDLE_ALIASES,
  HELD_GROUPS,
  HELD_LISTS,
  HELD_REFUSAL,
  heldCategory,
  heldRefusal,
} from "./heldHandles";

const ALL = Object.values(HELD_LISTS).flat();

describe("the held lists", () => {
  it("are lowercase", () => {
    for (const name of ALL) expect(name, name).toBe(name.toLowerCase());
  });

  it("list each name once, across every category", () => {
    const seen = new Set<string>();
    const twice = ALL.filter((name) => (seen.has(name) ? true : (seen.add(name), false)));
    expect(twice).toEqual([]);
  });

  it("are all valid addresses, so the held line is the one a person reads", () => {
    // handleProblem is the character rules plus the site's own paths
    // (RESERVED_HANDLES): a held name is neither broken nor a path.
    for (const name of ALL) expect(handleProblem(name), name).toBeNull();
    for (const name of ALL) expect(RESERVED_HANDLES.has(name), name).toBe(false);
  });

  it("hold what Rick listed", () => {
    for (const name of ["staff", "support", "official", "verify", "billing", "security", "mod", "admin", "help", "team", "ce", "thecreativeexchange", "garden", "thegarden"]) {
      // admin, help, support, garden are site paths: refused as reserved
      // before the held list is read.
      expect(heldCategory(name) === "system" || RESERVED_HANDLES.has(name), name).toBe(true);
    }
    expect(heldCategory("rick")).toBe("founder");
    expect(heldCategory("rickmoy")).toBe("founder");
    for (const name of ["sandiego", "losangeles", "newyork", "nyc", "la", "sf", "sd", "atl", "chi", "dc", "philly", "nola", "paris", "london", "berlin", "tokyo", "mexicocity", "newyorkcity", "florence", "rome", "barcelona"]) {
      expect(heldCategory(name), name).toBe("city");
    }
    for (const name of ["instagram", "meta", "facebook", "tiktok", "youtube", "x", "twitter", "threads", "bluesky", "google", "apple", "microsoft", "amazon", "openai", "anthropic", "paypal", "venmo", "cashapp", "stripe", "zelle", "patreon", "kofi", "adobe", "photoshop", "procreate", "figma", "canva", "wacom", "canon", "nikon", "sony", "fujifilm", "leica", "gopro", "fender", "gibson", "yamaha", "roland", "ableton", "spotify", "soundcloud", "bandcamp", "vimeo", "behance", "dribbble", "blick", "moleskine", "winsornewton", "liquitex"]) {
      expect(heldCategory(name), name).toBe("brand");
    }
    for (const name of ["painter", "painting", "photography", "photographer", "music", "musician", "film", "filmmaker", "poetry", "poet", "dance", "sculpture", "ceramics", "design", "illustration", "writing", "theater"]) {
      expect(heldCategory(name), name).toBe("discipline");
    }
  });

  it("are the sizes asked for", () => {
    expect(HELD_GROUPS.usMetros).toHaveLength(100);
    expect(HELD_GROUPS.worldArtCities.length).toBeGreaterThanOrEqual(25);
    expect(HELD_LISTS.brand.length).toBeGreaterThanOrEqual(200);
    expect(HELD_LISTS.discipline.length).toBeGreaterThanOrEqual(50);
  });
});

describe("short names", () => {
  it("holds every name of 1 or 2 characters, and makes 3 premium", () => {
    expect(heldCategory("q")).toBe("short");
    expect(heldCategory("_")).toBe("short");
    expect(heldCategory("q7")).toBe("short");
    expect(heldCategory("abc")).toBe("short");
    expect(heldCategory("a.b")).toBe("short");
    expect(heldRefusal("q7")).toEqual(HELD_REFUSAL.short);
    expect(heldRefusal("abc")).toEqual(HELD_REFUSAL.premium);
  });

  it("leaves 4 or more free", () => {
    expect(heldCategory("abcd")).toBeNull();
    expect(heldCategory("a".repeat(HANDLE_MAX_LENGTH))).toBeNull();
    expect(heldRefusal("ana.reyes")).toBeNull();
  });

  it("gives a listed short name its list's rule", () => {
    expect(heldCategory("sd")).toBe("city");
    expect(heldCategory("nyc")).toBe("city");
    expect(heldCategory("art")).toBe("discipline");
    expect(heldCategory("x")).toBe("brand");
    expect(heldCategory("ce")).toBe("system");
  });
});

describe("heldRefusal", () => {
  it("answers each category with its code and plain words", () => {
    expect(heldRefusal("staff")).toEqual({ code: "handle_reserved", reason: "That address is reserved." });
    expect(heldRefusal("rickmoy")).toEqual({
      code: "handle_held",
      reason: "This name is held for its owner. Write to us at hello@thecreative.exchange to claim it.",
    });
    expect(heldRefusal("sandiego")).toEqual(heldRefusal("rickmoy"));
    expect(heldRefusal("instagram")).toEqual({
      code: "handle_org",
      reason: "This name is held for the brand. It comes with an Organization account.",
    });
    expect(heldRefusal("poetry")).toMatchObject({ code: "handle_reserved" });
    expect(heldRefusal("ab")).toEqual({ code: "handle_reserved", reason: "Names of 1 or 2 characters are held." });
    expect(heldRefusal("abc")).toEqual({
      code: "handle_premium",
      reason: "Names of 3 characters or fewer come with a membership.",
    });
  });

  it("never states a price", () => {
    for (const { reason } of Object.values(HELD_REFUSAL)) expect(reason).not.toMatch(/[$€£]|\d+\s*(dollars|a month|\/mo)/i);
  });
});

describe("HANDLE_ALIASES", () => {
  it("points a founder name at another founder name, never at an alias", () => {
    for (const [from, to] of HANDLE_ALIASES) {
      expect(heldCategory(from), from).toBe("founder");
      expect(heldCategory(to), to).toBe("founder");
      expect(HANDLE_ALIASES.has(to), to).toBe(false);
    }
    expect(HANDLE_ALIASES.get("rick")).toBe("rickmoy");
  });
});
