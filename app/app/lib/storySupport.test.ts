import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  needsAccount,
  supportFormProblem,
  type SupportFormFields,
} from "./storySupport";

function fields(over: Partial<SupportFormFields> = {}): SupportFormFields {
  return {
    amountCents: 2500,
    minCents: 500,
    signedIn: false,
    monthly: false,
    anonymous: false,
    name: "Maya Lopez",
    email: "",
    password: "",
    ...over,
  };
}

describe("needsAccount", () => {
  it("is true only for a signed-out monthly backing", () => {
    expect(needsAccount({ signedIn: false, monthly: true })).toBe(true);
    expect(needsAccount({ signedIn: false, monthly: false })).toBe(false);
    expect(needsAccount({ signedIn: true, monthly: true })).toBe(false);
  });
});

describe("supportFormProblem — amount", () => {
  it("passes a ready one-time backing from a guest", () => {
    expect(supportFormProblem(fields())).toBeNull();
  });

  it("names the floor in dollars when the amount is too small", () => {
    expect(supportFormProblem(fields({ amountCents: 499 }))).toBe("The smallest amount is $5.");
  });

  it("catches a typed amount that isn't a number", () => {
    expect(supportFormProblem(fields({ amountCents: NaN }))).toContain("smallest amount");
  });

  it("asks for the amount before anything else", () => {
    const problem = supportFormProblem(fields({ amountCents: 0, name: "", monthly: true }));
    expect(problem).toContain("smallest amount");
  });
});

describe("supportFormProblem — a member", () => {
  it("needs nothing but an amount", () => {
    expect(supportFormProblem(fields({ signedIn: true, name: "", monthly: true }))).toBeNull();
  });
});

describe("supportFormProblem — a guest giving once", () => {
  it("needs a name", () => {
    expect(supportFormProblem(fields({ name: "   " }))).toBe(
      "Add your name, or check the box to stay anonymous.",
    );
  });

  it("doesn't need one when they stay anonymous", () => {
    expect(supportFormProblem(fields({ name: "", anonymous: true }))).toBeNull();
  });

  it("never asks a one-time guest for an email or password", () => {
    expect(supportFormProblem(fields({ email: "", password: "" }))).toBeNull();
  });
});

describe("supportFormProblem — a guest going monthly makes an account", () => {
  const monthly = (over: Partial<SupportFormFields> = {}) =>
    supportFormProblem(fields({ monthly: true, email: "maya@example.com", password: "sunflower", ...over }));

  it("passes with a name, an email and a long enough password", () => {
    expect(monthly()).toBeNull();
  });

  it("needs a name even when they want to stay anonymous on the page", () => {
    expect(monthly({ name: "", anonymous: true })).toBe("Add your name for your account.");
  });

  it("catches an email with no @ or no dot", () => {
    expect(monthly({ email: "maya" })).toBe("Add an email you can sign in with.");
    expect(monthly({ email: "maya@example" })).toBe("Add an email you can sign in with.");
    expect(monthly({ email: "  " })).toBe("Add an email you can sign in with.");
  });

  it("holds the password to the same length the auth library requires", () => {
    expect(monthly({ password: "short" })).toBe(
      `Use a password of ${MIN_PASSWORD_LENGTH} characters or more.`,
    );
    expect(monthly({ password: "a".repeat(MIN_PASSWORD_LENGTH) })).toBeNull();
  });

  it("takes an email with spaces around it", () => {
    expect(monthly({ email: "  maya@example.com  " })).toBeNull();
  });
});
