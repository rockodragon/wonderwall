// Pure-logic tests for public story pages: slug generation/dedup and the
// sponsor-line derivation from rows, plus the owner-only update gate. No
// Convex — an in-memory Set stands in for the by_storySlug index, mirroring
// stripeHandlers.test.ts's fake-Db style but scoped to just what
// resolveAvailableSlug needs.

import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  assertStoryOwner,
  deriveSponsorLine,
  normalizeUpdateBody,
  resolveAvailableSlug,
  slugifyTitle,
  type CodeForSponsor,
  type MembershipForSponsor,
} from "./stories";

describe("slugifyTitle", () => {
  it("kebab-cases a plain title", () => {
    expect(slugifyTitle("Psalms for the 2AM")).toBe("psalms-for-the-2am");
  });

  it("strips diacritics and collapses punctuation into single hyphens", () => {
    expect(slugifyTitle("Café Society — Vol. 2!")).toBe("cafe-society-vol-2");
  });

  it("falls back to 'story' when nothing usable remains", () => {
    expect(slugifyTitle("🎸🎸🎸")).toBe("story");
  });
});

function fakeSlugExists(taken: Set<string>) {
  return async (candidate: string) => taken.has(candidate);
}

describe("resolveAvailableSlug", () => {
  it("returns the base slug unchanged when it's free", async () => {
    const taken = new Set<string>();
    expect(await resolveAvailableSlug("psalms-for-the-2am", fakeSlugExists(taken))).toBe(
      "psalms-for-the-2am",
    );
  });

  it("appends -2 on a single collision", async () => {
    const taken = new Set(["psalms-for-the-2am"]);
    expect(await resolveAvailableSlug("psalms-for-the-2am", fakeSlugExists(taken))).toBe(
      "psalms-for-the-2am-2",
    );
  });

  it("walks past multiple collisions to the first free suffix", async () => {
    const taken = new Set(["psalms-for-the-2am", "psalms-for-the-2am-2", "psalms-for-the-2am-3"]);
    expect(await resolveAvailableSlug("psalms-for-the-2am", fakeSlugExists(taken))).toBe(
      "psalms-for-the-2am-4",
    );
  });
});

describe("deriveSponsorLine", () => {
  const codeById = new Map<string, CodeForSponsor>([["code_grace", { hostOrgId: "org_grace" }]]);
  const orgNameById = new Map([["org_grace", "Grace Church"]]);

  it("present for a covered + active membership", () => {
    const memberships: MembershipForSponsor[] = [{ status: "active", coveredByCodeId: "code_grace" }];
    expect(deriveSponsorLine(memberships, codeById, orgNameById)).toBe("seat covered by Grace Church");
  });

  it("absent when the covered membership is past_due (stricter than entitlements' grace)", () => {
    const memberships: MembershipForSponsor[] = [{ status: "past_due", coveredByCodeId: "code_grace" }];
    expect(deriveSponsorLine(memberships, codeById, orgNameById)).toBeUndefined();
  });

  it("absent for a self-paid active membership (not covered)", () => {
    const memberships: MembershipForSponsor[] = [{ status: "active" }];
    expect(deriveSponsorLine(memberships, codeById, orgNameById)).toBeUndefined();
  });

  it("absent with no memberships at all", () => {
    expect(deriveSponsorLine([], codeById, orgNameById)).toBeUndefined();
  });

  it("absent when the code or org can't be resolved (defensive, never throws)", () => {
    const memberships: MembershipForSponsor[] = [{ status: "active", coveredByCodeId: "code_unknown" }];
    expect(deriveSponsorLine(memberships, codeById, orgNameById)).toBeUndefined();
  });
});

describe("normalizeUpdateBody", () => {
  it("trims whitespace", () => {
    expect(normalizeUpdateBody("  Tracking day one.  ")).toBe("Tracking day one.");
  });

  it("whitespace-only body normalizes to empty (the mutation's cue to reject)", () => {
    expect(normalizeUpdateBody("   ")).toBe("");
  });
});

describe("assertStoryOwner (owner-only update gate)", () => {
  it("passes silently when the userId matches the project owner", () => {
    expect(() => assertStoryOwner({ userId: "user_shua" }, "user_shua")).not.toThrow();
  });

  it("throws a forbidden ConvexError when userId doesn't match", () => {
    try {
      assertStoryOwner({ userId: "user_shua" }, "user_marcus");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConvexError);
      expect((e as ConvexError<{ code: string }>).data.code).toBe("forbidden");
    }
  });

  it("throws not_found for a null project (bad/deleted projectId)", () => {
    try {
      assertStoryOwner(null, "user_shua");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConvexError);
      expect((e as ConvexError<{ code: string }>).data.code).toBe("not_found");
    }
  });
});
