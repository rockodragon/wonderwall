import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { SIGN_UP_FAILED, signUpFailedMessage } from "./signUpError";

describe("signUpFailedMessage", () => {
  it("covers the server's bare 'Server Error' (an email that already has an account) with the sign-in line", () => {
    expect(signUpFailedMessage(new Error("[CONVEX A(auth:signIn)] Server Error"))).toBe(SIGN_UP_FAILED);
    expect(signUpFailedMessage(undefined)).toBe(SIGN_UP_FAILED);
  });

  it("passes a reason the server wrote for the person through as it is", () => {
    expect(signUpFailedMessage(new ConvexError({ code: "invite", reason: "That code was already used." }))).toBe(
      "That code was already used.",
    );
  });
});
