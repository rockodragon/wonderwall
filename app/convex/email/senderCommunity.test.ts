// resolveSenderCommunity / getCommunitySenderName on an in-memory ctx: the
// reads behind the From name. The choice itself is covered in sender.test.ts;
// this checks the right rows reach it.

import { describe, expect, it } from "vitest";
import { getCommunitySenderName } from "../emailDeliveries";
import { resolveSenderCommunity, resolveSenderCommunityName } from "./senderCommunity";

type Row = Record<string, any> & { _id: string };

/** get() and query().withIndex(name, q => q.eq(..)).collect()/unique(). */
function makeCtx(tables: Record<string, Row[]>) {
  const rowsOf = (table: string) => tables[table] ?? [];
  return {
    db: {
      async get(id: string) {
        return rowsOf(id.split(":")[0]).find((r) => r._id === id) ?? null;
      },
      query(table: string) {
        let rows = rowsOf(table).slice();
        const api = {
          withIndex(_name: string, build: (q: any) => any) {
            const conds: ((r: Row) => boolean)[] = [];
            const q: any = { eq: (f: string, v: unknown) => (conds.push((r) => r[f] === v), q) };
            build(q);
            rows = rows.filter((r) => conds.every((c) => c(r)));
            return api;
          },
          async collect() {
            return rows;
          },
          async unique() {
            return rows[0] ?? null;
          },
        };
        return api;
      },
    },
  } as any;
}

const GARDEN: Row = { _id: "hostOrgs:garden", name: "The Garden", slug: "the-garden", kind: "community" };
const SD: Row = { _id: "hostOrgs:sd", name: "San Diego Creatives", slug: "sd", kind: "community" };
const ARCHIVED: Row = { _id: "hostOrgs:old", name: "Old", slug: "old", kind: "community", status: "archived" };
const FUND: Row = { _id: "hostOrgs:fund", name: "Abiding Practice", slug: "ap", kind: "org" };

const member = (userId: string, org: Row, joinedAt: number, status = "active"): Row => ({
  _id: `communityMembers:${userId}-${org._id}`,
  hostOrgId: org._id,
  userId,
  role: "member",
  status,
  joinedAt,
});

const world = (members: Row[] = [], orgs: Row[] = [GARDEN, SD, ARCHIVED, FUND]) =>
  makeCtx({ hostOrgs: orgs, communityMembers: members });

const nameOf = (ctx: unknown, args: { communityId?: string; userId?: string }) =>
  resolveSenderCommunityName(ctx as any, args as any);

describe("resolveSenderCommunityName", () => {
  it("names the community the email is about when it's active", async () => {
    const ctx = world([member("u1", GARDEN, 1)]);
    expect(await nameOf(ctx, { communityId: SD._id, userId: "u1" })).toBe("San Diego Creatives");
  });

  it("falls to the recipient's community when the one given is archived or a fund", async () => {
    const ctx = world([member("u1", SD, 1)]);
    expect(await nameOf(ctx, { communityId: ARCHIVED._id, userId: "u1" })).toBe("San Diego Creatives");
    expect(await nameOf(ctx, { communityId: FUND._id, userId: "u1" })).toBe("San Diego Creatives");
  });

  it("uses the recipient's one community, ignoring removed and pending rows", async () => {
    const ctx = world([
      member("u1", SD, 5),
      member("u1", GARDEN, 1, "removed"),
      member("u2", GARDEN, 1, "pending"),
    ]);
    expect(await nameOf(ctx, { userId: "u1" })).toBe("San Diego Creatives");
    // u2's only row is pending: no community of their own, so the default.
    expect(await nameOf(ctx, { userId: "u2" })).toBe("The Garden");
  });

  it("prefers the default community for someone in several, else the first joined", async () => {
    const both = world([member("u1", SD, 1), member("u1", GARDEN, 9)]);
    expect(await nameOf(both, { userId: "u1" })).toBe("The Garden");

    const OTHER: Row = { _id: "hostOrgs:other", name: "Other", slug: "other", kind: "community" };
    const noDefault = world([member("u1", OTHER, 2), member("u1", SD, 8)], [GARDEN, SD, OTHER]);
    expect(await nameOf(noDefault, { userId: "u1" })).toBe("Other");
  });

  it("uses the default community for someone with no account or no membership", async () => {
    const ctx = world([]);
    expect(await nameOf(ctx, {})).toBe("The Garden");
    expect(await nameOf(ctx, { userId: "nobody" })).toBe("The Garden");
  });

  it("is null when there is no community to name", async () => {
    expect(await nameOf(world([], [FUND]), {})).toBeNull();
  });

  it("returns the whole community row from resolveSenderCommunity", async () => {
    const ctx = world([]);
    const org = await resolveSenderCommunity(ctx, {});
    expect(org?._id).toBe(GARDEN._id);
  });
});

describe("getCommunitySenderName (the query emails.ts calls)", () => {
  const run = (ctx: unknown, args: Record<string, unknown>) =>
    (getCommunitySenderName as unknown as { _handler: (c: unknown, a: unknown) => Promise<unknown> })
      ._handler(ctx, args);

  it("passes the community and recipient through", async () => {
    const ctx = world([member("u1", SD, 1)]);
    expect(await run(ctx, {})).toBe("The Garden");
    expect(await run(ctx, { userId: "u1" })).toBe("San Diego Creatives");
    expect(await run(ctx, { communityId: GARDEN._id, userId: "u1" })).toBe("The Garden");
  });
});
