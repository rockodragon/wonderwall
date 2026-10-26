// The "X joined" notice an organization's admins get: it goes away once the
// person is no longer there (they left, or were removed), so it never points
// at a page they're missing from.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { PLACEHOLDER_NAME } from "./names";
import { join, leave, list, removePerson } from "./organizations";

const ADMIN = "users:admin";
const AUDREY = "users:audrey";

function world(viewer: string) {
  return makeCtx(
    {
      users: [{ _id: ADMIN }, { _id: AUDREY }],
      profiles: [
        { _id: "profiles:admin", userId: ADMIN, name: "Admin" },
        { _id: "profiles:audrey", userId: AUDREY, name: "Audrey Hill" },
      ],
      organizations: [{ _id: "organizations:ap", name: "Abiding Practice", nameKey: "abiding practice", slug: "abiding-practice" }],
      orgPositions: [
        { _id: "orgPositions:a", organizationId: "organizations:ap", userId: ADMIN, profileId: "profiles:admin", isAdmin: true, order: 0, createdAt: 1 },
      ],
      notifications: [
        // Someone else's join: stays.
        { _id: "notifications:other", userId: ADMIN, type: "org_joined", title: "Bo joined Abiding Practice", message: "", linkUrl: "/orgs/abiding-practice/edit", relatedUserId: "users:bo", createdAt: 1 },
      ],
    },
    viewer,
  );
}

const joinNotices = (ctx: any) =>
  ctx.store.notifications.filter((n: any) => n.type === "org_joined").map((n: any) => n.title);

describe("an organization's join notice", () => {
  it("is sent to the admins, and cleared when the person leaves", async () => {
    const ctx = world(AUDREY);
    await run(join, ctx, { organizationId: "organizations:ap" });
    expect(joinNotices(ctx)).toEqual(["Bo joined Abiding Practice", "Audrey Hill joined Abiding Practice"]);
    await run(leave, ctx, { organizationId: "organizations:ap" });
    expect(joinNotices(ctx)).toEqual(["Bo joined Abiding Practice"]);
  });

  it("is cleared when an admin removes them", async () => {
    const ctx = world(AUDREY);
    await run(join, ctx, { organizationId: "organizations:ap" });
    ctx.auth.getUserIdentity = async () => ({ subject: `${ADMIN}|session` });
    await run(removePerson, ctx, { organizationId: "organizations:ap", profileId: "profiles:audrey" });
    expect(joinNotices(ctx)).toEqual(["Bo joined Abiding Practice"]);
  });
});

// The Organizations tab on People (and the desk's): someone who signed in but
// never gave a name has no page, so they aren't one of an organization's
// faces, and the count is the people who are.
describe("the organization list", () => {
  const position = (id: string, organizationId: string, profileId: string, createdAt: number) => ({
    _id: `orgPositions:${id}`,
    organizationId,
    userId: `users:${id}`,
    profileId,
    isAdmin: false,
    order: 0,
    createdAt,
  });

  function listWorld() {
    return makeCtx(
      {
        profiles: [
          { _id: "profiles:audrey", userId: "users:audrey", name: "Audrey Hill" },
          { _id: "profiles:unfinished", userId: "users:unfinished", name: PLACEHOLDER_NAME },
          { _id: "profiles:blank", userId: "users:blank", name: "   " },
          { _id: "profiles:theo", userId: "users:theo", name: "Theo Okafor" },
        ],
        organizations: [
          { _id: "organizations:halo", name: "Halo Touring", nameKey: "halo touring", slug: "halo-touring" },
          { _id: "organizations:ap", name: "Abiding Practice", nameKey: "abiding practice", slug: "abiding-practice" },
        ],
        orgPositions: [
          // The unnamed accounts joined first, so they would have led the faces.
          position("unfinished", "organizations:ap", "profiles:unfinished", 1),
          position("blank", "organizations:ap", "profiles:blank", 2),
          position("audrey", "organizations:ap", "profiles:audrey", 3),
          position("theo", "organizations:ap", "profiles:theo", 4),
          position("halo", "organizations:halo", "profiles:unfinished", 5),
        ],
      },
      null,
    );
  }

  it("leaves people with no real name out of the faces and the count", async () => {
    const rows = await run(list, listWorld());
    const ap = rows.find((r: { slug: string }) => r.slug === "abiding-practice");
    expect(ap.faces.map((f: { name: string }) => f.name)).toEqual(["Audrey Hill", "Theo Okafor"]);
    expect(ap.peopleCount).toBe(2);
  });

  it("counts nobody at an organization whose only person is unnamed, and sorts by the named count", async () => {
    const rows = await run(list, listWorld());
    const halo = rows.find((r: { slug: string }) => r.slug === "halo-touring");
    expect(halo.faces).toEqual([]);
    expect(halo.peopleCount).toBe(0);
    expect(rows.map((r: { slug: string }) => r.slug)).toEqual(["abiding-practice", "halo-touring"]);
  });
});
