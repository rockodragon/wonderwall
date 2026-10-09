// The "X joined" notice an organization's admins get: it goes away once the
// person is no longer there (they left, or were removed), so it never points
// at a page they're missing from.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { join, leave, removePerson } from "./organizations";

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
