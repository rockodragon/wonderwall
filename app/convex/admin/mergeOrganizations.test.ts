// Merging one organization into another (mergeOrganizations.ts): every row
// that points at the old one moves, people listed at both keep one place,
// the kept one's empty fields are filled, and its old address still opens a
// page. Real handler, in-memory ctx.

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { addByName, createForHosting, getBySlug } from "../organizations";
import { mergeOrganizations, ORG_ID_FIELDS, orgFill } from "./mergeOrganizations";
import { schemaFieldsPointingAt } from "../../test-support/schemaFields";

const KEEP = "organizations:grove-full";
const OLD = "organizations:grove-short";

function world(extra: Record<string, Row[]> = {}) {
  return makeCtx(
    {
      users: [{ _id: "users:sarah" }, { _id: "users:dee" }, { _id: "users:jo" }],
      profiles: [
        { _id: "profiles:sarah", userId: "users:sarah", name: "Sarah Shreves", orgName: "The Grove Center for", interests: [], createdAt: 1, updatedAt: 1 },
        { _id: "profiles:dee", userId: "users:dee", name: "Dee Lee", orgName: "The Grove Center for the Arts & Media", interests: [], createdAt: 1, updatedAt: 1 },
        { _id: "profiles:jo", userId: "users:jo", name: "Jo", interests: [], createdAt: 1, updatedAt: 1 },
      ],
      organizations: [
        {
          _id: KEEP,
          name: "The Grove Center for the Arts & Media",
          nameKey: "the grove center for the arts & media",
          slug: "the-grove-center-for-the-arts-and-media",
          websiteUrl: "https://grove.example",
          createdByUserId: "users:dee",
          createdAt: 2,
          updatedAt: 2,
        },
        {
          _id: OLD,
          name: "The Grove Center for",
          nameKey: "the grove center for",
          slug: "the-grove-center-for",
          logoStorageId: "_storage:logo",
          mission: "Arts in the neighborhood.",
          websiteUrl: "https://old.example",
          location: "San Diego, CA",
          coordinates: { lat: 1, lng: 2 },
          createdByUserId: "users:sarah",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      orgPositions: [
        // Sarah is at both: an admin of the old one, with a title at the kept one.
        { _id: "orgPositions:sarah-old", organizationId: OLD, userId: "users:sarah", profileId: "profiles:sarah", isAdmin: true, order: 0, createdAt: 1 },
        { _id: "orgPositions:sarah-keep", organizationId: KEEP, userId: "users:sarah", profileId: "profiles:sarah", title: "Director", startYear: 2019, isAdmin: false, order: 1, createdAt: 3 },
        { _id: "orgPositions:dee-keep", organizationId: KEEP, userId: "users:dee", profileId: "profiles:dee", isAdmin: true, order: 0, createdAt: 2 },
        { _id: "orgPositions:jo-old", organizationId: OLD, userId: "users:jo", profileId: "profiles:jo", title: "Volunteer", isAdmin: false, order: 0, createdAt: 1 },
      ],
      projects: [
        { _id: "projects:mural", userId: "users:sarah", organizationId: OLD, title: "Mural" },
        { _id: "projects:other", userId: "users:jo", title: "Other" },
      ],
      events: [
        { _id: "events:1", organizerId: "users:sarah", displayHosts: [{ kind: "org", organizationId: OLD }, { kind: "org", organizationId: KEEP }] },
        { _id: "events:2", organizerId: "users:jo", displayHosts: [{ kind: "name", name: "Jo" }, { kind: "org", organizationId: OLD }] },
      ],
      orgSlugForwards: [{ _id: "orgSlugForwards:older", slug: "grove-center", organizationId: OLD, createdAt: 0 }],
      ...extra,
    },
    "users:sarah",
  );
}

const merge = (ctx: any, dryRun = false) => run(mergeOrganizations, ctx, { targetId: KEEP, sourceId: OLD, dryRun });
const rows = (store: Record<string, Row[]>) =>
  JSON.stringify(Object.fromEntries(Object.entries(store).filter(([, r]) => r.length > 0)));

describe("ORG_ID_FIELDS", () => {
  it('names every field that points at an organization (v.id("organizations") in schema.ts)', () => {
    expect(ORG_ID_FIELDS.map((f) => `${f.table}.${f.field}`).sort()).toEqual(schemaFieldsPointingAt("organizations"));
  });
});

describe("mergeOrganizations", () => {
  it("the dry run reports what would happen and changes nothing", async () => {
    const ctx = world();
    const before = rows(ctx.store);
    expect(await merge(ctx, true)).toEqual({
      dryRun: true,
      target: { name: "The Grove Center for the Arts & Media", slug: "the-grove-center-for-the-arts-and-media" },
      source: { name: "The Grove Center for", slug: "the-grove-center-for" },
      peopleMoved: ["Jo"],
      peopleCombined: ["Sarah Shreves"],
      projectsMoved: 1,
      eventsMoved: 2,
      filled: ["logo", "about", "location"],
      slugForwarded: "the-grove-center-for",
      sourceLogoUnused: false,
      hostOrgConflict: false,
    });
    expect(rows(ctx.store)).toBe(before);
  });

  it("moves its people; someone at both keeps one fuller place, and stays an admin", async () => {
    const ctx = world();
    await merge(ctx);
    const byId = Object.fromEntries(ctx.store.orgPositions.map((p: Row) => [p._id, p]));
    expect(Object.keys(byId).sort()).toEqual(["orgPositions:dee-keep", "orgPositions:jo-old", "orgPositions:sarah-keep"]);
    expect(byId["orgPositions:jo-old"]).toMatchObject({ organizationId: KEEP, title: "Volunteer" });
    expect(byId["orgPositions:sarah-keep"]).toMatchObject({
      organizationId: KEEP,
      title: "Director",
      startYear: 2019,
      isAdmin: true,
      order: 0,
      createdAt: 1,
    });
  });

  it("moves its projects and the events that show it, listed once", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.projects.map((p: Row) => p.organizationId)).toEqual([KEEP, undefined]);
    expect(ctx.store.events.map((e: Row) => e.displayHosts)).toEqual([
      [{ kind: "org", organizationId: KEEP }],
      [{ kind: "name", name: "Jo" }, { kind: "org", organizationId: KEEP }],
    ]);
  });

  it("fills the kept one's empty fields and keeps its own", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.organizations).toEqual([
      expect.objectContaining({
        _id: KEEP,
        logoStorageId: "_storage:logo",
        mission: "Arts in the neighborhood.",
        location: "San Diego, CA",
        coordinates: { lat: 1, lng: 2 },
        websiteUrl: "https://grove.example",
      }),
    ]);
  });

  it("refreshes the organization shown with each person's name", async () => {
    const ctx = world();
    await merge(ctx);
    const sarah = ctx.store.profiles.find((p: Row) => p._id === "profiles:sarah");
    expect(sarah.orgName).toBe("The Grove Center for the Arts & Media");
    expect(sarah.orgUrl).toBe("https://grove.example");
  });

  it("its old addresses still open the kept one", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.orgSlugForwards.map((f: Row) => [f.slug, f.organizationId]).sort()).toEqual([
      ["grove-center", KEEP],
      ["the-grove-center-for", KEEP],
    ]);
    const page = await run(getBySlug, ctx, { slug: "the-grove-center-for" });
    expect(page).toMatchObject({ _id: KEEP, slug: "the-grove-center-for-the-arts-and-media" });
    expect(await run(getBySlug, ctx, { slug: "nothing-here" })).toBeNull();
  });

  it("adding the old name finds the kept one, and no new organization takes the old address", async () => {
    const ctx = world();
    await merge(ctx);
    // Jo is already there (moved over); Sarah adds it again by its old name.
    expect(await run(addByName, ctx, { name: "the grove  center for" })).toEqual({
      slug: "the-grove-center-for-the-arts-and-media",
      created: false,
    });
    expect(ctx.store.organizations).toHaveLength(1);
    // A different organization whose name makes the forwarded slug gets another one.
    expect(await run(createForHosting, ctx, { name: "The Grove Center For!" })).toMatchObject({
      slug: "the-grove-center-for-2",
      created: true,
    });
    expect(await run(getBySlug, ctx, { slug: "the-grove-center-for" })).toMatchObject({ _id: KEEP });
  });

  it("an organization that holds a slug wins over a forward", async () => {
    const ctx = world({
      orgSlugForwards: [{ _id: "orgSlugForwards:x", slug: "the-grove-center-for-the-arts-and-media", organizationId: OLD, createdAt: 0 }],
    });
    expect(await run(getBySlug, ctx, { slug: "the-grove-center-for-the-arts-and-media" })).toMatchObject({ _id: KEEP });
  });

  it("refuses the same organization twice, or one that's gone, with a reason", async () => {
    const refused = async (args: Record<string, unknown>) => {
      try {
        await run(mergeOrganizations, world(), args);
      } catch (err) {
        expect(err).toBeInstanceOf(ConvexError);
        return (err as ConvexError<any>).data;
      }
      throw new Error("expected a refusal");
    };
    expect(await refused({ targetId: KEEP, sourceId: KEEP, dryRun: true })).toEqual({
      code: "same_organization",
      reason: "Pick two different organizations.",
    });
    expect(await refused({ targetId: KEEP, sourceId: "organizations:gone", dryRun: true })).toMatchObject({ code: "not_found" });
  });
});

describe("orgFill", () => {
  it("moves a location with its map data, and only into an empty one", () => {
    const source = { location: "SD", coordinates: { lat: 1, lng: 2 }, placeId: "p" } as any;
    expect(orgFill(source, {}).patch).toMatchObject({ location: "SD", coordinates: { lat: 1, lng: 2 }, placeId: "p" });
    expect(orgFill(source, { location: "LA" } as any).words).toEqual([]);
  });
});
