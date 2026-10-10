// Blocks hold in both directions: whoever blocked whom, neither side can
// message, invite or book the other. Run on the in-memory ctx in test-support/.

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { makeCtx } from "../test-support/convexContext";
import { assertNotBlocked, blockBetween, blockedUserIds, findBlock } from "./blocks";

const ANN = "users:ann";
const BEN = "users:ben";
const CAL = "users:cal";
const DEE = "users:dee";

// Ann blocked Ben. Cal blocked Ann. Dee has no blocks.
const world = () => ({
  blocks: [
    { _id: "blocks:1", blockerId: ANN, blockedId: BEN, createdAt: 1 },
    { _id: "blocks:2", blockerId: CAL, blockedId: ANN, createdAt: 2 },
  ],
});
const ctx = () => makeCtx(world(), null);
const as = (id: string) => id as any;

describe("blockedUserIds", () => {
  it("has the people you blocked and the people who blocked you", async () => {
    expect(await blockedUserIds(ctx(), as(ANN))).toEqual(new Set([BEN, CAL]));
  });

  it("is the same set from the other side of each block", async () => {
    expect(await blockedUserIds(ctx(), as(BEN))).toEqual(new Set([ANN]));
    expect(await blockedUserIds(ctx(), as(CAL))).toEqual(new Set([ANN]));
  });

  it("is empty for someone with no blocks either way", async () => {
    expect((await blockedUserIds(ctx(), as(DEE))).size).toBe(0);
  });
});

describe("findBlock", () => {
  it("finds a block in the direction it was made, not the other", async () => {
    expect((await findBlock(ctx(), as(ANN), as(BEN)))?._id).toBe("blocks:1");
    expect(await findBlock(ctx(), as(BEN), as(ANN))).toBeNull();
  });
});

describe("blockBetween", () => {
  it("says which way the block runs", async () => {
    expect(await blockBetween(ctx(), as(ANN), as(BEN))).toBe("a_blocked_b");
    expect(await blockBetween(ctx(), as(BEN), as(ANN))).toBe("b_blocked_a");
    expect(await blockBetween(ctx(), as(ANN), as(CAL))).toBe("b_blocked_a");
  });

  it("is null when there is none", async () => {
    expect(await blockBetween(ctx(), as(ANN), as(DEE))).toBeNull();
    expect(await blockBetween(ctx(), as(BEN), as(CAL))).toBeNull();
  });

  it("names the asker's own block first when each has blocked the other", async () => {
    const both = makeCtx(
      {
        blocks: [
          { _id: "blocks:1", blockerId: ANN, blockedId: BEN, createdAt: 1 },
          { _id: "blocks:2", blockerId: BEN, blockedId: ANN, createdAt: 2 },
        ],
      },
      null,
    );
    expect(await blockBetween(both, as(ANN), as(BEN))).toBe("a_blocked_b");
    expect(await blockBetween(both, as(BEN), as(ANN))).toBe("a_blocked_b");
  });
});

describe("assertNotBlocked", () => {
  async function refusal(a: string, b: string) {
    try {
      await assertNotBlocked(ctx(), as(a), as(b));
    } catch (e) {
      expect(e).toBeInstanceOf(ConvexError);
      return (e as ConvexError<any>).data;
    }
    return null;
  }

  it("refuses when the first person blocked the second", async () => {
    expect(await refusal(ANN, BEN)).toMatchObject({ code: "blocked" });
  });

  it("refuses when the second person blocked the first", async () => {
    expect(await refusal(BEN, ANN)).toMatchObject({ code: "blocked" });
    expect(await refusal(ANN, CAL)).toMatchObject({ code: "blocked" });
  });

  it("doesn't say which way, and gives a reason a person can read", async () => {
    const mine = await refusal(ANN, BEN);
    const theirs = await refusal(BEN, ANN);
    expect(mine.reason).toBe(theirs.reason);
    expect(mine.reason).toBe("That isn't possible right now.");
  });

  it("lets two people with no block between them through", async () => {
    expect(await refusal(ANN, DEE)).toBeNull();
    expect(await refusal(BEN, CAL)).toBeNull();
  });
});
