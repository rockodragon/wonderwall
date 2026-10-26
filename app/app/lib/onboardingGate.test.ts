import { describe, expect, it } from "vitest";
import { goesToOnboarding, needsOnboarding } from "./onboardingGate";

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

// What _app.tsx uses: a brand-new account, plus anyone still without a name
// (convex/names.ts), so an onboarded member who never gave one comes back.
describe("goesToOnboarding", () => {
  const onboarded = { primaryRole: "creative", bio: "Painter", interests: ["Art"] };

  it("sends an onboarded member who is still 'New User' to onboarding", () => {
    expect(goesToOnboarding({ ...onboarded, name: "New User" })).toBe(true);
    expect(goesToOnboarding({ ...onboarded, name: "  new user " })).toBe(true);
  });

  it("sends an onboarded member with a blank or missing name to onboarding", () => {
    expect(goesToOnboarding({ ...onboarded, name: "" })).toBe(true);
    expect(goesToOnboarding({ ...onboarded, name: "   " })).toBe(true);
    expect(goesToOnboarding({ ...onboarded, name: null })).toBe(true);
    expect(goesToOnboarding({ ...onboarded })).toBe(true);
  });

  it("leaves an onboarded member with a real name alone", () => {
    expect(goesToOnboarding({ ...onboarded, name: "Dana Reyes" })).toBe(false);
    // Role alone is enough to count as onboarded, whatever else they skipped.
    expect(goesToOnboarding({ name: "Dana Reyes", primaryRole: "creative", bio: "", interests: [] })).toBe(false);
  });

  it("still sends a brand-new Google account (real name, nothing else)", () => {
    expect(goesToOnboarding({ name: "Dana Reyes", primaryRole: undefined, bio: "", interests: [] })).toBe(true);
  });

  it("waits while the profile is loading or missing", () => {
    expect(goesToOnboarding(undefined)).toBe(false);
    expect(goesToOnboarding(null)).toBe(false);
  });
});
