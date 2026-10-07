import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../_generated/server";
import {
  attach,
  confirmTableCheckout,
  getRefundTerms,
  recordRefund,
  reconcileLegacyOfferingEnrollment,
  releaseTableCheckout,
  start,
} from "./tablesCheckout";
import { applyStripeEvent } from "./memberships";
import {
  migrateBatch,
  offeringTableFields,
  signupEnrollmentFields,
} from "./tablesMigration";
import {
  backingProcessingFeeCents,
  type StripeCheckoutSessionLike,
} from "./stripeHandlers";
import type { Doc } from "../_generated/dataModel";

vi.mock("../auth", () => ({
  auth: {
    getUserId: async (ctx: { testUserId?: string }) => ctx.testUserId ?? null,
  },
}));

type Row = Record<string, any>;

/** Runs the real registered mutations against an indexed in-memory DB.
 * The fake supplies storage, not payment/access decisions. */
function fakeCtx(seed: Record<string, Row[]> = {}) {
  const data = new Map<string, Row[]>(
    Object.entries(seed).map(([table, rows]) => [
      table,
      rows.map((row) => ({ _creationTime: 1, ...row })),
    ]),
  );
  let sequence = 0;
  const rows = (table: string) => {
    if (!data.has(table)) data.set(table, []);
    return data.get(table)!;
  };
  const db = {
    async get(id: string) {
      return [...data.values()].flat().find((row) => row._id === id) ?? null;
    },
    normalizeId(_table: string, id: string) {
      return id;
    },
    async insert(table: string, fields: Row) {
      const id = `${table}_${++sequence}`;
      rows(table).push({ ...fields, _id: id, _creationTime: Date.now() });
      return id;
    },
    async patch(id: string, fields: Row) {
      const row = await db.get(id);
      if (!row) throw new Error("row missing");
      Object.assign(row, fields);
    },
    query(table: string) {
      const predicates: ((row: Row) => boolean)[] = [];
      const builder = {
        withIndex(_index: string, fn: (q: any) => any) {
          const q = {
            eq(field: string, value: unknown) {
              predicates.push((row) => row[field] === value);
              return q;
            },
            lte(field: string, value: number) {
              predicates.push((row) => row[field] <= value);
              return q;
            },
          };
          fn(q);
          return builder;
        },
        async collect() {
          return rows(table).filter((row) =>
            predicates.every((predicate) => predicate(row)),
          );
        },
        async unique() {
          const found = await builder.collect();
          if (found.length > 1) throw new Error("not unique");
          return found[0] ?? null;
        },
        async first() {
          return (await builder.collect())[0] ?? null;
        },
        async take(limit: number) {
          return (await builder.collect()).slice(0, limit);
        },
        async paginate(opts: { cursor: string | null; numItems: number }) {
          const all = await builder.collect();
          const offset = Number(opts.cursor ?? 0);
          return {
            page: all.slice(offset, offset + opts.numItems),
            continueCursor: String(offset + opts.numItems),
            isDone: offset + opts.numItems >= all.length,
          };
        },
      };
      return builder;
    },
  };
  return {
    db,
    rows,
    testUserId: "operator",
    storage: { getUrl: async (id: string) => `https://media.example/${id}` },
  };
}

const NOW = 1_800_000_000_000;
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
});
const table = {
  _id: "table",
  name: "One Table",
  slug: "one-table",
  mode: "open",
  hostUserId: "host",
  pricingType: "fixed",
  priceCents: 1000,
  currency: "usd",
  status: "active",
  createdAt: 1,
};
const handler = (fn: unknown, ctx: unknown, args: unknown) =>
  (fn as { _handler: (ctx: unknown, args: unknown) => Promise<any> })._handler(
    ctx,
    args,
  );
const asCtx = (ctx: unknown) => ctx as MutationCtx;

function paidSession(
  hold: Row,
  overrides: Partial<StripeCheckoutSessionLike> = {},
): StripeCheckoutSessionLike {
  return {
    id: "cs_1",
    mode: "payment",
    customer: null,
    subscription: null,
    payment_status: "paid",
    currency: hold.currency,
    amount_total: hold.priceCents + backingProcessingFeeCents(hold.priceCents),
    metadata: {
      kind: "table",
      holdId: hold._id,
      tableId: hold.tableId,
      userId: hold.userId,
      amountCents: String(hold.priceCents),
      currency: hold.currency,
    },
    ...overrides,
  };
}

describe("atomic Table checkout adapter", () => {
  it("reuses a live hold and reserves the last seat against another buyer", async () => {
    const ctx = fakeCtx({ gardenTables: [{ ...table, capacity: 1 }] });
    const first = await handler(start, ctx, {
      tableId: "table",
      userId: "student",
    });
    expect(
      (await handler(start, ctx, { tableId: "table", userId: "student" }))
        .holdId,
    ).toBe(first.holdId);
    await expect(
      handler(start, ctx, { tableId: "table", userId: "another" }),
    ).rejects.toThrow("All chairs");
    expect(ctx.rows("tableMemberships")).toHaveLength(0);
    expect(ctx.rows("tableCheckoutHolds")).toHaveLength(1);
  });

  it("snapshots price, host and title, preventing edits from changing a retry", async () => {
    const ctx = fakeCtx({ gardenTables: [table] });
    const started = await handler(start, ctx, {
      tableId: "table",
      userId: "student",
    });
    await ctx.db.patch("table", {
      name: "Renamed",
      hostUserId: "new_host",
      priceCents: 5000,
    });
    const retry = await handler(start, ctx, {
      tableId: "table",
      userId: "student",
    });
    expect(retry).toMatchObject({
      holdId: started.holdId,
      title: "One Table",
      priceCents: 1000,
    });
    const hold = ctx.rows("tableCheckoutHolds")[0];
    await confirmTableCheckout(asCtx(ctx), paidSession(hold));
    expect(ctx.rows("classPayments")[0]).toMatchObject({
      grossCents: 1000,
      payeeUserId: "host",
      teacherCents: 900,
      platformCents: 100,
    });
  });

  it("confirms money and enrollment exactly once; webhook replay never rejoins a left participant", async () => {
    const ctx = fakeCtx({ gardenTables: [{ ...table, capacity: 1 }] });
    await handler(start, ctx, { tableId: "table", userId: "student" });
    const hold = ctx.rows("tableCheckoutHolds")[0];
    const session = paidSession(hold);
    await confirmTableCheckout(asCtx(ctx), session);
    expect(ctx.rows("tableMemberships")[0]).toMatchObject({
      status: "active",
      paymentStatus: "confirmed",
      paidCents: 1000,
    });
    await ctx.db.patch(ctx.rows("tableMemberships")[0]._id, { status: "left" });
    await confirmTableCheckout(asCtx(ctx), session);
    await releaseTableCheckout(asCtx(ctx), { ...session, status: "expired" });
    expect(ctx.rows("classPayments")).toHaveLength(1);
    expect(ctx.rows("tableMembershipHistory")).toHaveLength(1);
    expect(ctx.rows("tableMemberships")[0].status).toBe("left");
    expect(hold.status).toBe("paid");
  });

  it("records a late payment for operator refund without consuming a reallocated seat", async () => {
    const ctx = fakeCtx({ gardenTables: [{ ...table, capacity: 1 }] });
    await handler(start, ctx, { tableId: "table", userId: "student" });
    const hold = ctx.rows("tableCheckoutHolds")[0];
    await ctx.db.patch(hold._id, { expiresAt: NOW - 1 });
    await handler(start, ctx, { tableId: "table", userId: "other" });
    await confirmTableCheckout(asCtx(ctx), paidSession(hold));
    expect(ctx.rows("classPayments")).toHaveLength(1);
    expect(ctx.rows("classPayments")[0].status).toBe("refund_required");
    expect(hold.status).toBe("refund_required");
    expect(ctx.rows("tableMemberships")).toHaveLength(0);
  });

  it("handles failure-before-success without a duplicate ledger or access before payment", async () => {
    const ctx = fakeCtx({ gardenTables: [table] });
    await handler(start, ctx, { tableId: "table", userId: "student" });
    const hold = ctx.rows("tableCheckoutHolds")[0];
    await releaseTableCheckout(
      asCtx(ctx),
      paidSession(hold, { payment_status: "unpaid" }),
    );
    expect(hold.status).toBe("failed");
    expect(ctx.rows("tableMemberships")).toHaveLength(0);
    await confirmTableCheckout(asCtx(ctx), paidSession(hold));
    expect(hold.status).toBe("paid");
    expect(ctx.rows("classPayments")).toHaveLength(1);
  });

  it("rejects altered snapshots, session IDs, amount and currency", async () => {
    const ctx = fakeCtx({ gardenTables: [table] });
    await handler(start, ctx, { tableId: "table", userId: "student" });
    const hold = ctx.rows("tableCheckoutHolds")[0];
    await handler(attach, ctx, {
      holdId: hold._id,
      userId: "student",
      stripeCheckoutSessionId: "cs_1",
    });
    await expect(
      confirmTableCheckout(asCtx(ctx), paidSession(hold, { id: "cs_wrong" })),
    ).rejects.toThrow("reserved terms");
    await expect(
      confirmTableCheckout(
        asCtx(ctx),
        paidSession(hold, { amount_total: 1000 }),
      ),
    ).rejects.toThrow("paid amount");
    await expect(
      confirmTableCheckout(asCtx(ctx), paidSession(hold, { currency: "eur" })),
    ).rejects.toThrow("currency");
    expect(ctx.rows("classPayments")).toHaveLength(0);
  });

  it("revalidates paused state before redirect and before activating a payment", async () => {
    const ctx = fakeCtx({ gardenTables: [table] });
    await handler(start, ctx, { tableId: "table", userId: "student" });
    const hold = ctx.rows("tableCheckoutHolds")[0];
    await ctx.db.patch("table", { pausedAt: NOW });
    await expect(
      handler(start, ctx, { tableId: "table", userId: "student" }),
    ).rejects.toThrow("unavailable");
    await confirmTableCheckout(asCtx(ctx), paidSession(hold));
    expect(hold.status).toBe("refund_required");
    expect(ctx.rows("tableMemberships")).toHaveLength(0);
  });

  it("enforces own-community membership while allowing free accounts on open paid Tables", async () => {
    const ctx = fakeCtx({
      gardenTables: [
        { ...table, membershipRequired: true, hostOrgId: "community" },
      ],
      hostOrgs: [
        {
          _id: "community",
          name: "Community",
          slug: "community",
          kind: "community",
          status: "active",
        },
      ],
    });
    await expect(
      handler(start, ctx, { tableId: "table", userId: "student" }),
    ).rejects.toThrow("Membership in this Table");
    await ctx.db.patch("table", { membershipRequired: false });
    expect(
      await handler(start, ctx, { tableId: "table", userId: "student" }),
    ).toHaveProperty("holdId");
  });

  it("gates refunds to operators and refund-required Table payments", async () => {
    const ctx = fakeCtx({
      profiles: [
        { _id: "admin", userId: "operator", name: "Operator", isAdmin: true },
      ],
      classPayments: [
        {
          _id: "refund",
          tableId: "table",
          status: "refund_required",
          paymentIntentId: "pi_1",
          stripeRef: "cs_1",
        },
        {
          _id: "paid",
          tableId: "table",
          status: "paid",
          paymentIntentId: "pi_2",
        },
      ],
    });
    await expect(
      handler(getRefundTerms, ctx, { paymentId: "refund", userId: "student" }),
    ).rejects.toThrow("Admin access");
    await expect(
      handler(getRefundTerms, ctx, { paymentId: "paid", userId: "operator" }),
    ).rejects.toThrow("requiring a refund");
    expect(
      await handler(getRefundTerms, ctx, {
        paymentId: "refund",
        userId: "operator",
      }),
    ).toEqual({ alreadyRefunded: false, paymentIntentId: "pi_1" });
    expect(ctx.rows("classPayments")[0].status).toBe("refund_required");
  });

  it("records a confirmed refund once and reconciles its checkout hold", async () => {
    const ctx = fakeCtx({
      profiles: [
        { _id: "admin", userId: "operator", name: "Operator", isAdmin: true },
      ],
      classPayments: [
        {
          _id: "payment",
          tableId: "table",
          status: "refund_required",
          paymentIntentId: "pi_1",
          stripeRef: "cs_1",
        },
      ],
      tableCheckoutHolds: [
        {
          _id: "hold",
          stripeCheckoutSessionId: "cs_1",
          classPaymentId: "payment",
          status: "refund_required",
        },
      ],
    });
    await expect(
      handler(recordRefund, ctx, {
        paymentId: "payment",
        userId: "operator",
        paymentIntentId: "pi_wrong",
        refundId: "re_1",
      }),
    ).rejects.toThrow("does not match");
    await handler(recordRefund, ctx, {
      paymentId: "payment",
      userId: "operator",
      paymentIntentId: "pi_1",
      refundId: "re_1",
    });
    await handler(recordRefund, ctx, {
      paymentId: "payment",
      userId: "operator",
      paymentIntentId: "pi_1",
      refundId: "re_1",
    });
    expect(ctx.rows("classPayments")[0]).toMatchObject({
      status: "refunded",
      stripeRefundId: "re_1",
    });
    expect(ctx.rows("tableCheckoutHolds")[0].status).toBe("refunded");
    expect(
      await handler(getRefundTerms, ctx, {
        paymentId: "payment",
        userId: "operator",
      }),
    ).toEqual({ alreadyRefunded: true, refundId: "re_1" });
  });
});

const offering = {
  _id: "offering",
  title: "Workshop",
  userId: "host",
  format: "workshop",
  cadence: "Every Tuesday",
  priceCents: 1000,
  status: "active",
  pausedAt: 2,
  pausedBy: "moderator",
  pausedReason: "Review",
  createdAt: 1,
  updatedAt: 2,
} as Doc<"offerings">;
const signup = {
  _id: "signup",
  offeringId: "offering",
  userId: "student",
  name: "Student",
  status: "confirmed",
  createdAt: 3,
} as Doc<"offeringSignups">;
const admin = {
  _id: "profile_operator",
  userId: "operator",
  name: "Operator",
  isAdmin: true,
};

describe("operator Table migration", () => {
  it("retains moderation and source identity instead of merging by title", () => {
    expect(offeringTableFields(offering)).toMatchObject({
      sourceOfferingId: "offering",
      pausedAt: 2,
      pausedByUserId: "moderator",
      pausedReason: "Review",
      membershipRequired: false,
    });
  });

  it("does not treat external signup confirmation as a payment or attendance", () => {
    expect(
      signupEnrollmentFields(
        { ...offering, externalPaymentLinkUrl: "https://outside.example" },
        signup,
        null,
      ),
    ).toMatchObject({
      status: "pending",
      paymentStatus: "external_unverified",
    });
    expect(signupEnrollmentFields(offering, signup, null)).toMatchObject({
      status: "pending",
      paymentStatus: "pending",
    });
    expect(
      signupEnrollmentFields({ ...offering, priceCents: 0 }, signup, null),
    ).toMatchObject({ status: "active", paymentStatus: "not_required" });
  });

  it("defaults dry-run and paginates without writes or fabricated cadence Events", async () => {
    const ctx = fakeCtx({
      profiles: [admin],
      offerings: [offering, { ...offering, _id: "other" }],
    });
    const result = await handler(migrateBatch, ctx, {
      phase: "offerings",
      limit: 1,
    });
    expect(result).toMatchObject({
      dryRun: true,
      isDone: false,
      continueCursor: "1",
    });
    expect(ctx.rows("gardenTables")).toHaveLength(0);
    expect(ctx.rows("events")).toHaveLength(0);
  });

  it("backfills a source once and keeps originals, payment refs and reports intact", async () => {
    const payment = {
      _id: "payment",
      offeringId: "offering",
      buyerUserId: "student",
      grossCents: 1000,
      stripeRef: "cs_old",
      createdAt: 3,
    };
    const ctx = fakeCtx({
      profiles: [admin],
      offerings: [offering],
      offeringSignups: [signup],
      classPayments: [payment],
      offeringReports: [
        { _id: "report", offeringId: "offering", status: "open" },
      ],
    });
    await handler(migrateBatch, ctx, { phase: "offerings", dryRun: false });
    await handler(migrateBatch, ctx, { phase: "offerings", dryRun: false });
    await handler(migrateBatch, ctx, { phase: "signups", dryRun: false });
    await handler(migrateBatch, ctx, { phase: "signups", dryRun: false });
    expect(ctx.rows("gardenTables")).toHaveLength(1);
    expect(ctx.rows("events")).toHaveLength(0);
    expect(ctx.rows("tableMemberships")).toHaveLength(1);
    expect(ctx.rows("tableMemberships")[0]).toMatchObject({
      paymentStatus: "confirmed",
      stripeCheckoutSessionId: "cs_old",
      sourceSignupId: "signup",
    });
    expect(ctx.rows("classPayments")[0]).toEqual({
      _creationTime: 1,
      ...payment,
    });
    expect(ctx.rows("offerings")).toHaveLength(1);
    expect(ctx.rows("offeringReports")[0].status).toBe("open");
    expect(ctx.rows("tableAttendance")).toHaveLength(0);
  });

  it("copies real session times and secret URLs to gated eventVideo, retaining out intent", async () => {
    const ctx = fakeCtx({
      profiles: [
        admin,
        { _id: "profile_student", userId: "student", name: "Student" },
      ],
      users: [{ _id: "student", email: "student@example.com" }],
      gardenTables: [table],
      tableSessions: [
        {
          _id: "session",
          tableId: "table",
          startsAt: NOW + 1000,
          meetingUrl: "https://secret.example/room",
          createdAt: 1,
        },
      ],
      sessionRsvps: [
        {
          _id: "going",
          sessionId: "session",
          userId: "student",
          status: "going",
          createdAt: 1,
        },
        {
          _id: "out",
          sessionId: "session",
          userId: "other",
          status: "out",
          createdAt: 1,
        },
      ],
    });
    await handler(migrateBatch, ctx, { phase: "sessions", dryRun: false });
    await handler(migrateBatch, ctx, { phase: "sessions", dryRun: false });
    const result = await handler(migrateBatch, ctx, {
      phase: "rsvps",
      dryRun: false,
    });
    await handler(migrateBatch, ctx, { phase: "rsvps", dryRun: false });
    expect(ctx.rows("events")).toHaveLength(1);
    expect(ctx.rows("events")[0]).not.toHaveProperty("meetingUrl");
    expect(ctx.rows("eventVideo")[0].meetingUrl).toBe(
      "https://secret.example/room",
    );
    expect(ctx.rows("eventRsvps")).toHaveLength(1);
    expect(ctx.rows("eventRsvps")[0].sourceSessionRsvpId).toBe("going");
    expect(result.results[1]).toMatchObject({
      sourceId: "out",
      action: "skipped",
    });
    expect(ctx.rows("sessionRsvps")).toHaveLength(2);
    expect(ctx.rows("tableAttendance")).toHaveLength(0);
  });

  it("requires actual operator authorization even for dry-run", async () => {
    const ctx = fakeCtx({
      profiles: [{ ...admin, isAdmin: false }],
      offerings: [offering],
    });
    await expect(
      handler(migrateBatch, ctx, { phase: "offerings" }),
    ).rejects.toThrow("Admin access");
    expect(ctx.rows("gardenTables")).toHaveLength(0);
  });

  it("reconciles a real pre-migration class webhook into the migrated Table, once", async () => {
    const ctx = fakeCtx({
      profiles: [admin],
      offerings: [{ ...offering, pausedAt: undefined }],
      offeringSignups: [{ ...signup, status: "pledged" }],
      gardenTables: [{ ...table, sourceOfferingId: "offering" }],
      tableMemberships: [
        {
          _id: "enrollment",
          tableId: "table",
          userId: "student",
          status: "pending",
          paymentStatus: "pending",
          joinedAt: 1,
        },
      ],
    });
    const event = {
      id: "evt_old",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_old",
          mode: "payment",
          customer: null,
          subscription: null,
          payment_status: "paid",
          metadata: {
            kind: "class",
            offeringId: "offering",
            userId: "student",
            signupId: "signup",
            amountCents: "1000",
          },
        },
      },
    };
    await handler(applyStripeEvent, ctx, { event });
    await handler(applyStripeEvent, ctx, { event });
    expect(ctx.rows("classPayments")).toHaveLength(1);
    expect(ctx.rows("classPayments")[0]).toMatchObject({
      offeringId: "offering",
      stripeRef: "cs_old",
    });
    expect(ctx.rows("tableMemberships")[0]).toMatchObject({
      status: "active",
      paymentStatus: "confirmed",
      stripeCheckoutSessionId: "cs_old",
    });
    expect(ctx.rows("offeringSignups")[0].status).toBe("confirmed");
    expect(ctx.rows("notifications")).toHaveLength(1);
  });

  it("preserves a left legacy participant when a historical payment is replayed", async () => {
    const ctx = fakeCtx({
      gardenTables: [{ ...table, sourceOfferingId: "offering" }],
      classPayments: [
        {
          _id: "payment",
          offeringId: "offering",
          buyerUserId: "student",
          stripeRef: "cs_old",
          grossCents: 1000,
        },
      ],
      tableMemberships: [
        {
          _id: "enrollment",
          tableId: "table",
          userId: "student",
          status: "left",
          joinedAt: 1,
        },
      ],
    });
    await reconcileLegacyOfferingEnrollment(
      asCtx(ctx),
      "offering" as any,
      "student" as any,
    );
    expect(ctx.rows("tableMemberships")[0].status).toBe("left");
  });
});
