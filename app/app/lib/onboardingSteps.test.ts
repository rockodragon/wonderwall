import { describe, expect, it } from "vitest";
import { handleProblem } from "../../convex/handleRules";
import { heldRefusal } from "../../convex/heldHandles";
import {
  aboutYouArgs,
  cityLabel,
  lacksEmail,
  nextStep,
  previousStep,
  progressFor,
  reachableStep,
  slideFor,
  stepFromParam,
  stepHref,
  stepsFor,
  suggestHandle,
} from "./onboardingSteps";

describe("stepsFor", () => {
  it("walks a maker through four steps, ending on the project", () => {
    expect(stepsFor("creative")).toEqual([1, 2, 3, 4]);
  });

  it("ends a backer and a partner on the profile step", () => {
    expect(stepsFor("patron")).toEqual([1, 2, 3]);
    expect(stepsFor("partner")).toEqual([1, 2, 3]);
  });

  it("counts the longest walk until a door is picked", () => {
    expect(stepsFor(null)).toEqual([1, 2, 3, 4]);
  });
});

describe("nextStep / previousStep", () => {
  it("goes on one step at a time", () => {
    expect(nextStep("creative", 1)).toBe(2);
    expect(nextStep("creative", 2)).toBe(3);
    expect(nextStep("creative", 3)).toBe(4);
    expect(nextStep(null, 1)).toBe(2);
  });

  it("leaves the flow after the last step: 4 for a maker, 3 for the others", () => {
    expect(nextStep("creative", 4)).toBeNull();
    expect(nextStep("patron", 3)).toBeNull();
    expect(nextStep("partner", 3)).toBeNull();
  });

  it("goes back one step, and nowhere from the first", () => {
    expect(previousStep(4)).toBe(3);
    expect(previousStep(2)).toBe(1);
    expect(previousStep(1)).toBeNull();
  });
});

describe("progressFor", () => {
  it("fills the segments up to the step they are on", () => {
    expect(progressFor("creative", 1).segments).toEqual([true, false, false, false]);
    expect(progressFor("creative", 2).segments).toEqual([true, true, false, false]);
    expect(progressFor("creative", 3).segments).toEqual([true, true, true, false]);
    expect(progressFor("creative", 4).segments).toEqual([true, true, true, true]);
  });

  it("gives a backer and a partner three segments, the last full on the profile step", () => {
    for (const role of ["patron", "partner"] as const) {
      expect(progressFor(role, 1).segments).toEqual([true, false, false]);
      expect(progressFor(role, 3).segments).toEqual([true, true, true]);
      expect(progressFor(role, 3).total).toBe(3);
    }
  });

  it("counts four until a door is picked, so the bar only ever loses a segment", () => {
    expect(progressFor(null, 1)).toMatchObject({ current: 1, total: 4, segments: [true, false, false, false] });
  });

  it("says where they are, for the bar and for a screen reader", () => {
    expect(progressFor("creative", 2)).toMatchObject({ current: 2, total: 4, label: "Step 2 of 4" });
    expect(progressFor("patron", 3)).toMatchObject({ current: 3, total: 3, label: "Step 3 of 3" });
  });

  it("names each step in a few words", () => {
    expect(([1, 2, 3, 4] as const).map((n) => progressFor("creative", n).name)).toEqual([
      "You're here to",
      "Your page",
      "About you",
      "Project",
    ]);
  });

  it("reads a step the door doesn't walk as the last one", () => {
    expect(progressFor("patron", 4)).toMatchObject({ current: 3, total: 3, segments: [true, true, true] });
  });

  it("always fills from the left, as many as the position says", () => {
    for (const role of ["creative", "patron", "partner", null] as const) {
      for (const step of stepsFor(role)) {
        const { segments, current, total } = progressFor(role, step);
        // Filled from the left, no gaps.
        expect(segments).toEqual(Array.from({ length: total }, (_, i) => i < current));
      }
    }
  });
});

describe("slideFor", () => {
  it("slides in from the right going on, and from the left going back", () => {
    expect(slideFor(1, 2)).toBe("forward");
    expect(slideFor(3, 4)).toBe("forward");
    expect(slideFor(4, 3)).toBe("back");
    expect(slideFor(2, 1)).toBe("back");
  });

  it("slides the same way over a jump, and not at all when nothing changed", () => {
    expect(slideFor(1, 3)).toBe("forward");
    expect(slideFor(4, 2)).toBe("back");
    expect(slideFor(2, 2)).toBeNull();
  });
});

describe("stepHref", () => {
  it("is the bare page for the first step and ?step=N for the rest", () => {
    expect([1, 2, 3, 4].map((n) => stepHref(n as 1 | 2 | 3 | 4))).toEqual([
      "/onboarding",
      "/onboarding?step=2",
      "/onboarding?step=3",
      "/onboarding?step=4",
    ]);
  });

  it("reads back as the step it was made for", () => {
    for (const n of [1, 2, 3, 4] as const) {
      expect(stepFromParam(new URL(stepHref(n), "http://local.test").searchParams.get("step"))).toBe(n);
    }
  });
});

describe("stepFromParam", () => {
  it("reads 1 to 4", () => {
    expect([null, "1", "2", "3", "4"].map(stepFromParam)).toEqual([1, 1, 2, 3, 4]);
  });

  it("opens the first step for anything else", () => {
    for (const raw of ["", "0", "5", "-1", "two", "2.5", "NaN"]) expect(stepFromParam(raw)).toBe(1);
  });
});

describe("reachableStep", () => {
  const named = { role: "creative", name: "Ana Reyes" } as const;

  it("opens whatever step is asked for once the answers are in", () => {
    expect(reachableStep(1, named)).toBe(1);
    expect(reachableStep(2, named)).toBe(2);
    expect(reachableStep(3, named)).toBe(3);
    expect(reachableStep(4, named)).toBe(4);
  });

  it("keeps a link on the first step until a door is picked", () => {
    expect(reachableStep(3, { role: null, name: "Ana Reyes" })).toBe(1);
  });

  it("stops at the profile step until there is a real name", () => {
    expect(reachableStep(3, { role: "creative", name: "" })).toBe(2);
    expect(reachableStep(4, { role: "creative", name: "   " })).toBe(2);
    expect(reachableStep(4, { role: "creative", name: "New User" })).toBe(2);
  });

  it("gives a backer and a partner no fourth step", () => {
    expect(reachableStep(4, { role: "patron", name: "Ana Reyes" })).toBe(3);
    expect(reachableStep(4, { role: "partner", name: "Ana Reyes" })).toBe(3);
  });
});

describe("suggestHandle", () => {
  it("is the name without spaces, lowercase", () => {
    expect(suggestHandle("Ana Reyes")).toBe("anareyes");
    expect(suggestHandle("  Sol  Reyes ")).toBe("solreyes");
  });

  it("keeps periods and underscores, and drops what a handle can't hold", () => {
    expect(suggestHandle("ana_reyes")).toBe("ana_reyes");
    expect(suggestHandle("Ana-María O'Neil")).toBe("anamariaoneil");
    expect(suggestHandle("Sol 🌞 Reyes")).toBe("solreyes");
    expect(suggestHandle("J. R. Moy")).toBe("j.r.moy");
  });

  it("never starts or ends with a period, or doubles one", () => {
    expect(suggestHandle(".ana..reyes.")).toBe("ana.reyes");
    expect(suggestHandle("Anabel.")).toBe("anabel");
  });

  it("stops at the longest handle", () => {
    const long = suggestHandle("A".repeat(10) + " " + "b".repeat(40));
    expect(long).toHaveLength(30);
    expect(handleProblem(long)).toBeNull();
    // A cut that lands on a period doesn't leave it hanging.
    expect(suggestHandle("a".repeat(29) + ".bcd")).toBe("a".repeat(29));
  });

  it("suggests nothing when nothing is left, or the name can't be taken", () => {
    expect(suggestHandle("")).toBe("");
    expect(suggestHandle("李雷")).toBe("");
    // Reserved by the rules, then held, then too short.
    expect(suggestHandle("Admin")).toBe("");
    expect(suggestHandle("Photography")).toBe("");
    expect(suggestHandle("Al")).toBe("");
    expect(suggestHandle("Ana")).toBe("");
  });

  it("only ever suggests an address the rules accept", () => {
    for (const name of ["Ana Reyes", "Ana-María O'Neil", "J. R. Moy", "x".repeat(60), "..", "_", "Mr. T"]) {
      const handle = suggestHandle(name);
      if (handle) {
        expect(handleProblem(handle)).toBeNull();
        expect(heldRefusal(handle)).toBeNull();
      }
    }
  });
});

describe("lacksEmail", () => {
  it("is true for an account with no email, which is how a phone sign-up reads", () => {
    expect(lacksEmail({ email: null })).toBe(true);
    expect(lacksEmail({})).toBe(true);
    expect(lacksEmail({ email: "" })).toBe(true);
    expect(lacksEmail({ email: "  " })).toBe(true);
  });

  it("is false once the account has one", () => {
    expect(lacksEmail({ email: "ana@example.com" })).toBe(false);
  });
});

describe("cityLabel", () => {
  const place = (address: Parameters<typeof cityLabel>[0]["address"]) => ({ displayName: "Long name, USA", address });

  it("is City, ST in the United States", () => {
    expect(cityLabel(place({ city: "San Diego", stateCode: "CA", country: "United States", countryCode: "US" }))).toBe(
      "San Diego, CA",
    );
  });

  it("is City, Country elsewhere", () => {
    expect(cityLabel(place({ city: "Lisbon", country: "Portugal", countryCode: "PT" }))).toBe("Lisbon, Portugal");
  });

  it("is just the city when the country is the city, or is not known", () => {
    expect(cityLabel(place({ city: "Singapore", country: "Singapore", countryCode: "SG" }))).toBe("Singapore");
    expect(cityLabel(place({ city: "Paris" }))).toBe("Paris");
  });

  it("falls back to the name the search gave when the place has no city", () => {
    expect(cityLabel(place({ state: "California", stateCode: "CA", countryCode: "US" }))).toBe("Long name, USA");
  });
});

describe("aboutYouArgs", () => {
  const place = {
    location: "San Diego, CA",
    locationType: "city" as const,
    address: { city: "San Diego", stateCode: "CA" },
    coordinates: { lat: 32.7, lng: -117.1 },
    placeId: "abc",
  };
  const noPlace = {
    location: undefined,
    locationType: undefined,
    address: undefined,
    coordinates: undefined,
    placeId: undefined,
  };
  const answers = {
    name: "  Ana Reyes ",
    bio: " Muralist. ",
    interests: ["Painting"],
    offerings: ["Venue / space"],
    placeName: " Radius Coffee ",
    place,
  };

  it("saves a maker's name, bio and interests as a creative, with the city", () => {
    expect(aboutYouArgs("creative", answers)).toEqual({
      ...place,
      name: "Ana Reyes",
      bio: "Muralist.",
      interests: ["Painting"],
      primaryRole: "creative",
    });
  });

  it("saves a backer's picks as what they want to support, not interests", () => {
    const args = aboutYouArgs("patron", answers);
    expect(args).toEqual({
      ...place,
      name: "Ana Reyes",
      bio: "Muralist.",
      supportInterests: ["Painting"],
      primaryRole: "patron",
    });
    expect(args).not.toHaveProperty("interests");
  });

  it("saves a partner's offerings and their space or organization", () => {
    const args = aboutYouArgs("partner", answers);
    expect(args).toEqual({
      ...place,
      name: "Ana Reyes",
      bio: "Muralist.",
      partnerOfferings: ["Venue / space"],
      orgName: "Radius Coffee",
      primaryRole: "partner",
    });
    expect(args).not.toHaveProperty("interests");
  });

  it("sends nothing for a pick left empty, so the profile's own stays", () => {
    const empty = { ...answers, bio: "  ", interests: [], offerings: [], placeName: " " };
    const creative = aboutYouArgs("creative", empty);
    expect(creative).toEqual({ ...place, name: "Ana Reyes", primaryRole: "creative" });
    expect(creative.bio).toBeUndefined();
    const partner = aboutYouArgs("partner", empty);
    expect(partner).toEqual({ ...place, name: "Ana Reyes", primaryRole: "partner" });
    expect(aboutYouArgs("patron", empty)).toEqual({ ...place, name: "Ana Reyes", primaryRole: "patron" });
  });

  it("takes the city exactly as the field has it: the five parts together, or all cleared", () => {
    expect(aboutYouArgs("creative", answers)).toMatchObject(place);
    // A typed city that was never picked from the list has no place behind it.
    const typed = { ...noPlace, location: "Out past the pier" };
    expect(aboutYouArgs("creative", { ...answers, place: typed })).toMatchObject(typed);
    // A city cleared out saves as none.
    const cleared = aboutYouArgs("creative", { ...answers, place: noPlace });
    expect(cleared).toMatchObject(noPlace);
    expect(cleared.location).toBeUndefined();
    expect(cleared.coordinates).toBeUndefined();
  });

  it("sends the email only when one was given, trimmed", () => {
    expect(aboutYouArgs("creative", answers)).not.toHaveProperty("email");
    expect(aboutYouArgs("creative", { ...answers, email: undefined })).not.toHaveProperty("email");
    expect(aboutYouArgs("creative", { ...answers, email: "   " })).not.toHaveProperty("email");
    expect(aboutYouArgs("creative", { ...answers, email: " ana@example.com " })).toMatchObject({
      email: "ana@example.com",
    });
    // For every door.
    for (const role of ["creative", "patron", "partner"] as const) {
      expect(aboutYouArgs(role, { ...answers, email: "ana@example.com" })).toMatchObject({ email: "ana@example.com" });
    }
  });
});
