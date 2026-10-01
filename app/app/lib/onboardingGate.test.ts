import { describe, expect, it } from "vitest";
import { needsOnboarding } from "./onboardingGate";

describe("needsOnboarding", () => {
  it("sends a new Google account (real name, nothing else) to onboarding", () => {
    expect(needsOnboarding({ primaryRole: undefined, bio: "", interests: [] })).toBe(true);
  });

  it("sends a new phone or password account to onboarding", () => {
    expect(needsOnboarding({ bio: undefined, interests: undefined })).toBe(true);
  });

  it("leaves anyone with a role alone, even if they skipped everything else", () => {
    expect(needsOnboarding({ primaryRole: "creative", bio: "", interests: [] })).toBe(false);
  });

  it("leaves older members without a role but with a bio or interests alone", () => {
    expect(needsOnboarding({ bio: "Painter", interests: [] })).toBe(false);
    expect(needsOnboarding({ bio: "", interests: ["Art"] })).toBe(false);
  });

  it("waits while the profile is loading or missing", () => {
    expect(needsOnboarding(undefined)).toBe(false);
    expect(needsOnboarding(null)).toBe(false);
  });
});
