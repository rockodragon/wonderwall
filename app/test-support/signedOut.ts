// Calls a registered query / mutation / action as a signed-out visitor and
// expects the shared refusal (requireUserId in convex/helpers.ts): a
// ConvexError the page can read, not a plain Error that production hides.

import { ConvexError } from "convex/values";
import { expect } from "vitest";
import { makeCtx, run, type Row } from "./convexContext";

export const SIGNED_OUT_REFUSAL = { code: "unauthenticated", reason: "Sign in first." } as const;

export async function expectSignedOutRefusal(
  fn: unknown,
  args: Record<string, unknown> = {},
  tables: Record<string, Row[]> = {},
): Promise<void> {
  let thrown: unknown = null;
  try {
    await run(fn, makeCtx(tables, null), args);
  } catch (err) {
    thrown = err;
  }
  expect(thrown, "expected the call to be refused").toBeInstanceOf(ConvexError);
  expect((thrown as ConvexError<any>).data).toEqual(SIGNED_OUT_REFUSAL);
}
