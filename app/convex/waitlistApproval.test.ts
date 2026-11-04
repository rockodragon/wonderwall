import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { approveEntry } from "./waitlist";

// Approving someone off the waitlist (waitlist.ts approveEntry): the email
// names the community they asked to join, and its button opens that
// community's own signup page. The Garden's is createthegarden.com.

const ADMIN = "users:admin";

function world(garden: Record<string, unknown> = {}, entry: Record<string, unknown> = {}): Record<string, Row[]> {
  return {
    users: [{ _id: ADMIN, email: "rick@example.com" }],
    profiles: [{ _id: "profiles:admin", userId: ADMIN, name: "Rick Moy", isAdmin: true, adminCode: "RICK42", interests: [] }],
    hostOrgs: [
      {
        _id: "hostOrgs:garden",
        kind: "community",
        status: "active",
        name: "The Garden",
        slug: "the-garden",
        domains: ["garden.thecreative.exchange", "createthegarden.com"],
        ...garden,
      },
      { _id: "hostOrgs:sd", kind: "community", status: "active", name: "The Creative Exchange San Diego", slug: "sd" },
    ],
    waitlist: [{ _id: "waitlist:1", email: "new@example.com", createdAt: 1, priorityScore: 0, ...entry }],
    communityMembers: [],
  };
}

function adminCtx(tables: Record<string, Row[]>) {
  const ctx = makeCtx(tables, ADMIN);
  ctx.scheduler.runAfter = vi.fn(async () => {}) as never;
  return ctx;
}

function sentEmail(ctx: ReturnType<typeof makeCtx>) {
  const calls = (ctx.scheduler.runAfter as any).mock.calls.filter(
    ([, ref]: any[]) => getFunctionName(ref) === "emails:sendNotificationEmail",
  );
  expect(calls).toHaveLength(1);
  return calls[0][2];
}

describe("approveEntry", () => {
  it("sends a Garden approval to The Garden's signup page", async () => {
    const ctx = adminCtx(world());
    const { code } = await run(approveEntry, ctx, { waitlistId: "waitlist:1" });
    const email = sentEmail(ctx);
    expect(email.subject).toBe("You're approved for The Garden");
    expect(email.ctaUrl).toBe(`https://createthegarden.com/signup/${code}`);
  });

  it("keeps the main site when the community has no Garden address", async () => {
    const noDomains = adminCtx(world({ domains: [] }));
    const { code } = await run(approveEntry, noDomains, { waitlistId: "waitlist:1" });
    expect(sentEmail(noDomains).ctaUrl).toBe(`/signup/${code}`);

    const sd = adminCtx(world({}, { communityIds: ["hostOrgs:sd"] }));
    await run(approveEntry, sd, { waitlistId: "waitlist:1" });
    const email = sentEmail(sd);
    expect(email.subject).toBe("You're approved for The Creative Exchange San Diego");
    expect(email.ctaUrl).toBe(`/signup/${code}`);
  });
});
