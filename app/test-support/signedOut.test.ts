import { describe, expect, it } from "vitest";
import { internalMutation, mutation } from "../convex/_generated/server";
import { requireUserId } from "../convex/helpers";
import { expectSignedOutRefusal } from "./signedOut";

const guarded = mutation({ args: {}, handler: async (ctx) => requireUserId(ctx) });
const plain = internalMutation({
  args: {},
  handler: async () => {
    throw new Error("Not authenticated");
  },
});

describe("expectSignedOutRefusal", () => {
  it("passes for the shared refusal", async () => {
    await expectSignedOutRefusal(guarded);
  });

  it("fails for a plain Error", async () => {
    await expect(expectSignedOutRefusal(plain)).rejects.toThrow();
  });
});
