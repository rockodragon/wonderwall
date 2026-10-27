// What a failed password sign-up says. The server's own reasons (a
// ConvexError) come through as they are; anything else, above all Convex
// Auth's plain "Account … already exists", reaches production as a bare
// "Server Error", so the one line covers it (Rick hit this on 2026-10-27:
// a sign-up with an email that already had an account showed "Server
// Error"). Shared by the signup page and the story page's sign-up.

import { errorMessage } from "./convexError";

export const SIGN_UP_FAILED = "Couldn't make that account. If you already have one, sign in instead.";

export function signUpFailedMessage(err: unknown): string {
  return errorMessage(err, SIGN_UP_FAILED);
}
