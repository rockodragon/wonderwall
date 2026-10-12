import { describe, expect, it, vi } from "vitest";
import { makeCtx } from "../test-support/convexContext";
import { insertNotification } from "./notify";

const world = () => ({
  users: [{ _id: "users:ada", email: "ada@example.com" }],
  profiles: [{ _id: "profiles:ada", userId: "users:ada", name: "Ada" }],
});

describe("insertNotification", () => {
  it("writes the row, stamped now unless told otherwise", async () => {
    const ctx = makeCtx(world(), null);
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const id = await insertNotification(ctx, {
      userId: "users:ada" as any,
      type: "org_joined",
      title: "Max joined",
      message: "Say hi.",
      linkUrl: "/orgs/x",
    });
    await insertNotification(ctx, {
      userId: "users:ada" as any,
      type: "likes_digest",
      title: "2 new likes",
      message: "On your profile",
      createdAt: 500,
    });
    vi.restoreAllMocks();
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({ _id: id, userId: "users:ada", type: "org_joined", linkUrl: "/orgs/x", createdAt: 1_000 }),
      expect.objectContaining({ type: "likes_digest", createdAt: 500 }),
    ]);
  });

  it("schedules the email too when asked, and only then", async () => {
    const ctx = makeCtx(world(), null);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    const n = { userId: "users:ada" as any, type: "update", title: "Hi", message: "Body" };
    await insertNotification(ctx, n);
    expect(runAfter).not.toHaveBeenCalled();
    await insertNotification(ctx, n, {
      email: { subject: "Hi", previewText: "Body", heading: "Hi", body: "<p>Body</p>", category: "transactional" },
    });
    expect(runAfter).toHaveBeenCalledTimes(1);
    expect(runAfter.mock.calls[0][2]).toMatchObject({ to: "ada@example.com", subject: "Hi" });
  });
});
