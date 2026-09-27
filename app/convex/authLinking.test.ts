import { describe, expect, it } from "vitest";
import { decideCreateOrUpdateUser } from "./authLinking";

const base = {
  isGoogleOAuth: true,
  emailVerified: true,
  matchingUserCount: 1,
  matchIsPasswordOnlyForThisEmail: true,
};

describe("decideCreateOrUpdateUser", () => {
  it("links Google to a password-only account registered with the same email", () => {
    expect(decideCreateOrUpdateUser(base)).toBe("link");
  });

  it("never links into an account that can also sign in another way (the phone takeover case)", () => {
    // A phone-only account typed the victim's email into onboarding; the
    // victim then signs in with Google. Linking would give the phone holder
    // the victim's identity.
    expect(
      decideCreateOrUpdateUser({ ...base, matchIsPasswordOnlyForThisEmail: false }),
    ).toBe("create");
  });

  it("creates when no account has the email", () => {
    expect(decideCreateOrUpdateUser({ ...base, matchingUserCount: 0 })).toBe("create");
  });

  it("doesn't guess between several accounts with the same email", () => {
    expect(decideCreateOrUpdateUser({ ...base, matchingUserCount: 2 })).toBe("create");
  });

  it("only links when Google vouches for the email", () => {
    expect(decideCreateOrUpdateUser({ ...base, emailVerified: false })).toBe("create");
  });

  it("only applies to Google sign-in", () => {
    expect(decideCreateOrUpdateUser({ ...base, isGoogleOAuth: false })).toBe("create");
  });
});
