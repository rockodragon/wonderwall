// The operator ledger's "Recent money events" says who paid
// (getPlatformReport.recent[].payer), run end to end on the in-memory ctx in
// test-support/. The pure resolution rules (resolvePayer) are unit-tested in
// reports.test.ts; this covers what the query feeds it: which ref each kind
// of money row carries, the dues fallback to the membership's owner, the
// lookup of accounts only for the rows shown, and the operator gate.

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { expectSignedOutRefusal } from "../../test-support/signedOut";
import { getPlatformReport } from "./reports";

const ADMIN = "users:admin";
const DANA = "users:dana"; // named, has an email and a handle
const NEWBIE = "users:newbie"; // signed up by phone, never gave a name
const OWNER = "users:owner"; // owns the membership a dues row points at
const GONE = "users:gone"; // an account that no longer exists
const ORG = "hostOrgs:grove";

const world = (extra: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  users: [
    { _id: ADMIN, email: "ada@example.com" },
    { _id: DANA, email: "dana@account.example" },
    { _id: NEWBIE, phone: "+16195550100" },
    { _id: OWNER, email: "owner@account.example" },
  ],
  profiles: [
    { _id: "profiles:admin", userId: ADMIN, name: "Ada Admin", isAdmin: true },
    { _id: "profiles:dana", userId: DANA, name: "  Dana Reyes ", handle: "dana" },
    { _id: "profiles:newbie", userId: NEWBIE, name: "New User" },
    { _id: "profiles:owner", userId: OWNER, name: "Olive Owner", handle: "olive" },
  ],
  hostOrgs: [{ _id: ORG, kind: "community", status: "active", name: "The Grove", slug: "the-grove" }],
  events: [{ _id: "events:show", hostOrgId: ORG, title: "Showcase" }],
  communityProducts: [{ _id: "communityProducts:zine", hostOrgId: ORG, name: "Zine", status: "active", priceCents: 1000 }],
  memberships: [
    {
      _id: "memberships:m1",
      userId: OWNER,
      level: "seat",
      status: "active",
      stripeSubscriptionId: "sub_1",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  ...extra,
});

const contribution = (id: string, over: Record<string, unknown>): Row => ({
  _id: `grantContributions:${id}`,
  hostOrgId: ORG,
  type: "contribution_in",
  grossCents: 1000,
  platformCents: 100,
  poolCents: 900,
  stripeRef: `ref_${id}`,
  period: "2026-10",
  createdAt: 10,
  ...over,
});

const purchase = (id: string, over: Record<string, unknown>): Row => ({
  _id: `productPurchases:${id}`,
  productId: "communityProducts:zine",
  hostOrgId: ORG,
  grossCents: 1000,
  platformCents: 100,
  hostCents: 900,
  billing: "one_time",
  status: "paid",
  stripeRef: `ref_${id}`,
  period: "2026-10",
  createdAt: 10,
  updatedAt: 10,
  ...over,
});

const ticket = (id: string, over: Record<string, unknown>): Row => ({
  _id: `ticketPurchases:${id}`,
  eventId: "events:show",
  tierName: "General",
  amountCents: 2500,
  stripeSessionId: `ref_${id}`,
  status: "paid",
  createdAt: 10,
  ...over,
});

async function recentOf(tables: Record<string, Row[]>) {
  const report = await run(getPlatformReport, makeCtx(tables, ADMIN), {});
  return report.recent as { source: string; ref?: string; payer?: any }[];
}

const payerOf = (recent: { ref?: string; payer?: any }[], ref: string) => {
  const row = recent.find((r) => r.ref === ref);
  expect(row, `a recent row with ref ${ref}`).toBeDefined();
  return row!.payer;
};

describe("getPlatformReport.recent: who paid", () => {
  it("a dues row with no payer of its own is the membership's owner", async () => {
    const recent = await recentOf(
      world({
        grantContributions: [
          contribution("dues", { type: "dues_share", membershipId: "memberships:m1", groupCents: 250 }),
        ],
      }),
    );
    expect(recent[0].source).toBe("dues");
    expect(payerOf(recent, "ref_dues")).toEqual({
      kind: "member",
      profileId: "profiles:owner",
      name: "Olive Owner",
      handle: "olive",
      email: "owner@account.example",
      phone: undefined,
    });
  });

  it("a dues row that names its own payer keeps that payer, not the membership's owner", async () => {
    const recent = await recentOf(
      world({
        grantContributions: [
          contribution("dues", { type: "dues_share", membershipId: "memberships:m1", userId: DANA }),
        ],
      }),
    );
    expect(payerOf(recent, "ref_dues")).toMatchObject({ kind: "member", profileId: "profiles:dana" });
  });

  it("a dues row with neither a payer nor a membership is a guest with nothing to show", async () => {
    const recent = await recentOf(world({ grantContributions: [contribution("dues", { type: "dues_share" })] }));
    expect(payerOf(recent, "ref_dues")).toEqual({ kind: "guest", name: undefined, email: undefined });
  });

  it("a pool contribution with only a typed name is a guest with that name", async () => {
    const recent = await recentOf(
      world({ grantContributions: [contribution("pool", { payerName: "  Patty Pool " })] }),
    );
    expect(payerOf(recent, "ref_pool")).toEqual({ kind: "guest", name: "Patty Pool", email: undefined });
  });

  it("other pool inflows (a sponsor's money) carry the typed name too", async () => {
    const recent = await recentOf(
      world({ grantContributions: [contribution("sponsor", { type: "sponsor_in", payerName: "Acme Co" })] }),
    );
    expect(payerOf(recent, "ref_sponsor")).toEqual({ kind: "guest", name: "Acme Co", email: undefined });
  });

  it("a pool contribution from a signed-in member shows their account, not the typed name", async () => {
    const recent = await recentOf(
      world({ grantContributions: [contribution("pool", { userId: DANA, payerName: "Typed Name" })] }),
    );
    expect(payerOf(recent, "ref_pool")).toMatchObject({ kind: "member", name: "Dana Reyes" });
  });

  it("a signed-out ticket with only a buyer email is a guest with that email", async () => {
    const recent = await recentOf(
      world({ ticketPurchases: [ticket("t1", { buyerEmail: " guest@buyer.example " })] }),
    );
    expect(recent[0].source).toBe("event_ticket");
    expect(payerOf(recent, "ref_t1")).toEqual({ kind: "guest", name: undefined, email: "guest@buyer.example" });
  });

  it("a ticket bought by an account that's since gone is deleted, keeping the checkout email", async () => {
    const recent = await recentOf(
      world({ ticketPurchases: [ticket("t1", { userId: GONE, buyerEmail: "gone@buyer.example" })] }),
    );
    expect(payerOf(recent, "ref_t1")).toEqual({ kind: "deleted", name: undefined, email: "gone@buyer.example" });
  });

  it("a signed-in host sale shows the member: name, handle and the account's email over checkout's", async () => {
    const recent = await recentOf(
      world({ productPurchases: [purchase("p1", { userId: DANA, buyerEmail: "checkout@dana.example" })] }),
    );
    expect(recent[0].source).toBe("host_sale");
    expect(payerOf(recent, "ref_p1")).toEqual({
      kind: "member",
      profileId: "profiles:dana",
      name: "Dana Reyes",
      handle: "dana",
      email: "dana@account.example",
      phone: undefined,
    });
  });

  it("a signed-in ticket buyer shows the member too", async () => {
    const recent = await recentOf(world({ ticketPurchases: [ticket("t1", { userId: DANA })] }));
    expect(payerOf(recent, "ref_t1")).toMatchObject({ kind: "member", name: "Dana Reyes" });
  });

  it("an unnamed member has name null, with the phone they signed up with shown", async () => {
    const recent = await recentOf(world({ productPurchases: [purchase("p1", { userId: NEWBIE })] }));
    expect(payerOf(recent, "ref_p1")).toEqual({
      kind: "member",
      profileId: "profiles:newbie",
      name: null,
      handle: undefined,
      email: undefined,
      phone: "+16195550100",
    });
  });

  it("an unnamed member's checkout email still shows when the account has none", async () => {
    const recent = await recentOf(
      world({ productPurchases: [purchase("p1", { userId: NEWBIE, buyerEmail: "newbie@checkout.example" })] }),
    );
    expect(payerOf(recent, "ref_p1")).toMatchObject({
      kind: "member",
      name: null,
      email: "newbie@checkout.example",
      phone: "+16195550100",
    });
  });

  it("a member whose sign-in row is gone is still named, with no way to reach them", async () => {
    const tables = world({ productPurchases: [purchase("p1", { userId: DANA, buyerEmail: "  " })] });
    tables.users = tables.users.filter((u) => u._id !== DANA);
    const recent = await recentOf(tables);
    expect(payerOf(recent, "ref_p1")).toEqual({
      kind: "member",
      profileId: "profiles:dana",
      name: "Dana Reyes",
      handle: "dana",
      email: undefined,
      phone: undefined,
    });
  });

  it("money going out has no payer: an allocation and a host payout", async () => {
    const recent = await recentOf(
      world({
        allocations: [
          {
            _id: "allocations:1",
            hostOrgId: ORG,
            recipientName: "Shua",
            amountCents: 5000,
            period: "2026-10",
            createdAt: 20,
          },
        ],
        hostPayouts: [
          { _id: "hostPayouts:1", hostOrgId: ORG, amountCents: 9000, reference: "zelle", paidAt: 30, createdAt: 30 },
        ],
      }),
    );
    const allocation = recent.find((r) => r.source === "allocation");
    const payout = recent.find((r) => r.source === "host_payout");
    expect(allocation).toBeDefined();
    expect(payout).toBeDefined();
    expect(allocation!.payer).toBeUndefined();
    expect(payout!.payer).toBeUndefined();
  });

  it("every kind of row lands together, each with its own payer", async () => {
    const recent = await recentOf(
      world({
        grantContributions: [
          contribution("dues", { type: "dues_share", membershipId: "memberships:m1", createdAt: 60 }),
          contribution("pool", { payerName: "Patty Pool", createdAt: 50 }),
        ],
        productPurchases: [purchase("p1", { userId: DANA, createdAt: 40 })],
        ticketPurchases: [ticket("t1", { buyerEmail: "guest@buyer.example", createdAt: 30 })],
        allocations: [
          { _id: "allocations:1", hostOrgId: ORG, recipientName: "Shua", amountCents: 5000, period: "2026-10", createdAt: 20 },
        ],
        hostPayouts: [{ _id: "hostPayouts:1", hostOrgId: ORG, amountCents: 9000, paidAt: 10, createdAt: 10 }],
      }),
    );
    // Newest first, and each row carries what its own table kept.
    expect(recent.map((r) => [r.source, r.payer?.kind, r.payer?.name])).toEqual([
      ["dues", "member", "Olive Owner"],
      ["pool_contribution", "guest", "Patty Pool"],
      ["host_sale", "member", "Dana Reyes"],
      ["event_ticket", "guest", undefined],
      ["allocation", undefined, undefined],
      ["host_payout", undefined, undefined],
    ]);
  });
});

describe("getPlatformReport.recent: accounts are looked up only for the rows shown", () => {
  /** A ctx whose db.get records every id it's asked for. */
  function spiedCtx(tables: Record<string, Row[]>) {
    const ctx = makeCtx(tables, ADMIN);
    const asked: string[] = [];
    const get = ctx.db.get;
    ctx.db.get = async (id: string) => {
      asked.push(id);
      return get(id);
    };
    return { ctx, asked };
  }

  it("skips a payer whose row fell off the 60 newest, and looks each shown payer up once", async () => {
    // 59 signed-out tickets and two of Newbie's make the 60 shown; Dana's is
    // older than all of them and doesn't make the cut.
    const shown = Array.from({ length: 59 }, (_, i) =>
      ticket(`g${i}`, { buyerEmail: `g${i}@buyer.example`, createdAt: 1000 + i }),
    );
    const { ctx, asked } = spiedCtx(
      world({
        ticketPurchases: [
          ...shown,
          ticket("n1", { userId: NEWBIE, createdAt: 2000 }),
          ticket("d1", { userId: DANA, createdAt: 1 }),
        ],
        productPurchases: [purchase("n2", { userId: NEWBIE, createdAt: 2001 })],
      }),
    );
    const report = await run(getPlatformReport, ctx, {});
    expect(report.recent).toHaveLength(60);
    expect(report.recent.map((r: { ref?: string }) => r.ref)).not.toContain("ref_d1");
    // Newbie appears twice, and was fetched once; Dana wasn't fetched at all.
    expect(asked.filter((id) => id === NEWBIE)).toHaveLength(1);
    expect(asked).not.toContain(DANA);
    expect(report.recent.find((r: { ref?: string }) => r.ref === "ref_n1").payer).toMatchObject({
      kind: "member",
      name: null,
    });
  });
});

describe("getPlatformReport: who may ask", () => {
  const withPayments = () =>
    world({ productPurchases: [purchase("p1", { userId: DANA })], ticketPurchases: [ticket("t1", {})] });

  it("refuses a signed-in member who isn't an operator, readably", async () => {
    let thrown: unknown = null;
    try {
      await run(getPlatformReport, makeCtx(withPayments(), DANA), {});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ConvexError);
    expect((thrown as ConvexError<any>).data.code).toBe("forbidden");
  });

  it("refuses someone who isn't signed in", async () => {
    await expectSignedOutRefusal(getPlatformReport, {}, withPayments());
  });

  it("lets an operator through", async () => {
    const report = await run(getPlatformReport, makeCtx(withPayments(), ADMIN), {});
    expect(report.recent).toHaveLength(2);
  });
});
