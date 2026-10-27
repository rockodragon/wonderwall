// Pure-logic tests for public story pages: slug generation/dedup and the
// sponsor-line derivation from rows, plus the owner-only update gate. No
// Convex — an in-memory Set stands in for the by_storySlug index, mirroring
// stripeHandlers.test.ts's fake-Db style but scoped to just what
// resolveAvailableSlug needs. The paged updates list is the exception: it runs
// on the in-memory ctx in test-support/convexContext.ts.

import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  assertStoryOwner,
  deriveSponsorLine,
  normalizeUpdateBody,
  resolveAvailableSlug,
  shapeUpdateContent,
  slugifyTitle,
  STORY_BACKER_NAME_LIMIT,
  summarizeStoryBackers,
  type BackerRowForStory,
  type CodeForSponsor,
  type MembershipForSponsor,
  listProjectUpdates,
  listProjectUpdatesPage,
} from "./stories";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { checkIndexes } from "../../test-support/indexChecks";

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

describe("shapeUpdateContent", () => {
  it("derives the plain-text column from a rich document", () => {
    expect(
      shapeUpdateContent({
        bodyDoc: [
          { type: "heading", text: "Week three", level: 2 },
          { type: "text", text: "We finished the **first** cut." },
        ],
      }),
    ).toEqual({
      body: "Week three\n\nWe finished the first cut.",
      bodyDoc: [
        { type: "heading", text: "Week three", level: 2 },
        { type: "text", text: "We finished the **first** cut." },
      ],
    });
  });

  it("accepts a photo-only update — its plain text is legitimately empty", () => {
    const shaped = shapeUpdateContent({ bodyDoc: [{ type: "image", storageId: "kg1" }] });
    expect(shaped.body).toBe("");
    expect(shaped.bodyDoc).toEqual([{ type: "image", storageId: "kg1" }]);
  });

  it("still takes a plain-text update, as the seeds send", () => {
    expect(shapeUpdateContent({ body: "  Shot it all today.  " })).toEqual({
      body: "Shot it all today.",
      bodyDoc: undefined,
    });
  });

  it("prefers the rich document when both arrive", () => {
    const shaped = shapeUpdateContent({
      body: "ignored",
      bodyDoc: [{ type: "text", text: "kept" }],
    });
    expect(shaped.body).toBe("kept");
  });

  it("refuses an update with nothing in it", () => {
    expect(() => shapeUpdateContent({})).toThrow(ConvexError);
    expect(() => shapeUpdateContent({ body: "   " })).toThrow(ConvexError);
    expect(() => shapeUpdateContent({ bodyDoc: [{ type: "text", text: "  " }] })).toThrow(
      ConvexError,
    );
  });
});

describe("summarizeStoryBackers (the backer line on /story/:slug)", () => {
  let t = 0;
  function row(over: Partial<BackerRowForStory>): BackerRowForStory {
    t += 1;
    return {
      type: "financial_one_time",
      status: "confirmed",
      visible: true,
      supporterName: "Someone",
      createdAt: t,
      ...over,
    };
  }

  it("is empty when nobody has backed yet", () => {
    expect(summarizeStoryBackers([])).toEqual({ count: 0, names: [], otherCount: 0 });
  });

  it("names people who chose to be named, newest first", () => {
    const rows = [
      row({ supporterName: "Ana", supporterUserId: "u1" }),
      row({ supporterName: "Jo" }),
      row({ supporterName: "Marcus", type: "financial_recurring" }),
    ];
    expect(summarizeStoryBackers(rows)).toEqual({ count: 3, names: ["Marcus", "Jo", "Ana"], otherCount: 0 });
  });

  it("counts anonymous backers without naming them, even with the name on the row", () => {
    const rows = [
      row({ supporterName: "Ana" }),
      row({ supporterName: "Anonymous", visible: false }),
      row({ supporterName: "Private Person", visible: false, supporterUserId: "u9" }),
    ];
    const summary = summarizeStoryBackers(rows);
    expect(summary).toEqual({ count: 3, names: ["Ana"], otherCount: 2 });
    expect(JSON.stringify(summary)).not.toContain("Private Person");
  });

  it("leaves out checkouts Stripe hasn't confirmed, and support that isn't money", () => {
    const rows = [
      row({ supporterName: "Pending Pat", status: "pending" }),
      row({ supporterName: "Cheering Cy", type: "encouragement" }),
      row({ supporterName: "Offering Oz", type: "resource" }),
      row({ supporterName: "Ana" }),
    ];
    expect(summarizeStoryBackers(rows)).toEqual({ count: 1, names: ["Ana"], otherCount: 0 });
  });

  it("counts a member who backs twice once, and keeps their name if either backing was named", () => {
    const rows = [
      row({ supporterName: "Ana", supporterUserId: "u1" }),
      row({ supporterName: "Ana", supporterUserId: "u1", visible: false }),
    ];
    expect(summarizeStoryBackers(rows)).toEqual({ count: 1, names: ["Ana"], otherCount: 0 });
  });

  it("counts a guest who backs twice under the same name once", () => {
    const rows = [row({ supporterName: "Jo" }), row({ supporterName: "jo " })];
    expect(summarizeStoryBackers(rows).count).toBe(1);
  });

  it("counts each anonymous guest backing, since they can't be told apart", () => {
    const rows = [
      row({ supporterName: "Anonymous", visible: false }),
      row({ supporterName: "Anonymous", visible: false }),
    ];
    expect(summarizeStoryBackers(rows)).toEqual({ count: 2, names: [], otherCount: 2 });
  });

  it("lists at most the limit and folds the rest into otherCount", () => {
    const rows = Array.from({ length: STORY_BACKER_NAME_LIMIT + 3 }, (_, i) =>
      row({ supporterName: `Backer ${i}` }),
    );
    const summary = summarizeStoryBackers(rows);
    expect(summary.names).toHaveLength(STORY_BACKER_NAME_LIMIT);
    expect(summary.names[0]).toBe(`Backer ${STORY_BACKER_NAME_LIMIT + 2}`);
    expect(summary.otherCount).toBe(3);
    expect(summary.count).toBe(STORY_BACKER_NAME_LIMIT + 3);
  });
});

describe("listProjectUpdatesPage (the Updates list, ten at a time)", () => {
  const LEAD = "users:lead";
  const OTHER = "users:other";
  const args = { projectId: "projects:p1" };
  const first = { numItems: 10, cursor: null as string | null };

  /** `count` updates, the nth posted at time n, so the newest is the last. */
  function world(count: number, projectExtra: Record<string, unknown> = {}): Record<string, Row[]> {
    return {
      profiles: [{ _id: "profiles:lead", userId: LEAD, name: "Lena", interests: [] }],
      projects: [
        {
          _id: "projects:p1", userId: LEAD, kind: "passion", title: "Harbor Mural",
          status: "active", createdAt: 1, updatedAt: 1, ...projectExtra,
        },
      ],
      storyUpdates: Array.from({ length: count }, (_, i) => ({
        _id: `storyUpdates:u${i + 1}`,
        _creationTime: i + 1,
        projectId: "projects:p1",
        authorUserId: LEAD,
        body: `Update ${i + 1}`,
        createdAt: i + 1,
      })),
    };
  }
  const bodies = (page: { body: string }[]) => page.map((u) => u.body);

  it("gives the newest ten first, and says there is more", async () => {
    const out = await run(listProjectUpdatesPage, makeCtx(world(25), null), { ...args, paginationOpts: first });
    expect(bodies(out.page)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Update ${25 - i}`),
    );
    expect(out.isDone).toBe(false);
  });

  it("walks the cursor through the rest, ten at a time, to the oldest", async () => {
    const ctx = makeCtx(world(25), null);
    const one = await run(listProjectUpdatesPage, ctx, { ...args, paginationOpts: first });
    const two = await run(listProjectUpdatesPage, ctx, {
      ...args,
      paginationOpts: { numItems: 10, cursor: one.continueCursor },
    });
    expect(bodies(two.page)).toEqual(Array.from({ length: 10 }, (_, i) => `Update ${15 - i}`));
    expect(two.isDone).toBe(false);

    const three = await run(listProjectUpdatesPage, ctx, {
      ...args,
      paginationOpts: { numItems: 10, cursor: two.continueCursor },
    });
    expect(bodies(three.page)).toEqual(["Update 5", "Update 4", "Update 3", "Update 2", "Update 1"]);
    expect(three.isDone).toBe(true);
  });

  it("is done when exactly ten remain", async () => {
    const out = await run(listProjectUpdatesPage, makeCtx(world(10), null), { ...args, paginationOpts: first });
    expect(out.page).toHaveLength(10);
    expect(out.isDone).toBe(true);
  });

  it("gives each row its author and the fields the list draws", async () => {
    const out = await run(listProjectUpdatesPage, makeCtx(world(1), null), { ...args, paginationOpts: first });
    expect(out.page[0]).toMatchObject({
      _id: "storyUpdates:u1",
      body: "Update 1",
      createdAt: 1,
      authorUserId: LEAD,
      author: { name: "Lena", profileId: "profiles:lead" },
    });
  });

  it("reads the updates through the project index, not the whole table", async () => {
    const ctx = makeCtx(world(3), null);
    const { scans } = checkIndexes(ctx);
    await run(listProjectUpdatesPage, ctx, { ...args, paginationOpts: first });
    expect(scans).not.toContain("storyUpdates");
  });

  it("is an empty, finished page for an id that is not a project", async () => {
    for (const projectId of ["projects:nope", "not-an-id"]) {
      const out = await run(listProjectUpdatesPage, makeCtx(world(3), null), { projectId, paginationOpts: first });
      expect(out).toEqual({ page: [], isDone: true, continueCursor: "" });
    }
  });

  it.each([
    ["someone signed out", null],
    ["a member who isn't its lead", OTHER],
  ])("is an empty, finished page for %s when an admin hid the project", async (_label, viewer) => {
    const out = await run(listProjectUpdatesPage, makeCtx(world(3, { status: "hidden" }), viewer), {
      ...args,
      paginationOpts: first,
    });
    expect(out).toEqual({ page: [], isDone: true, continueCursor: "" });
  });

  it("still shows a hidden project's updates to its lead", async () => {
    const out = await run(listProjectUpdatesPage, makeCtx(world(3, { status: "hidden" }), LEAD), {
      ...args,
      paginationOpts: first,
    });
    expect(out.page).toHaveLength(3);
  });

  it("leaves listProjectUpdates giving every update, newest first", async () => {
    const out = await run(listProjectUpdates, makeCtx(world(25), null), args);
    expect(out).toHaveLength(25);
    expect(out[0].body).toBe("Update 25");
    expect(out[24].body).toBe("Update 1");
    expect(out[0].author).toMatchObject({ name: "Lena" });
  });
});
