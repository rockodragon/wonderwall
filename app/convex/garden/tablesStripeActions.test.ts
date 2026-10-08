import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import {
  createClassCheckout,
  createTableCheckout,
  refundTablePayment,
} from "./stripe";

const stripeMock = vi.hoisted(() => ({
  createSession: vi.fn(),
  retrieveSession: vi.fn(),
  refund: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    checkout = {
      sessions: {
        create: stripeMock.createSession,
        retrieve: stripeMock.retrieveSession,
      },
    };
    refunds = { create: stripeMock.refund };
  },
}));
vi.mock("../auth", () => ({
  auth: { getUserId: async (ctx: { userId?: string }) => ctx.userId ?? null },
}));
const handler = (fn: unknown, ctx: unknown, args: unknown) =>
  (fn as { _handler: (ctx: unknown, args: unknown) => Promise<any> })._handler(
    ctx,
    args,
  );

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
  vi.stubEnv("SITE_URL", "https://site.example");
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});
const started = {
  holdId: "hold",
  title: "Workshop",
  slug: "workshop",
  priceCents: 1000,
  currency: "usd",
  expiresAt: 1_800_001_860_000,
};
function checkoutCtx(snapshot = started) {
  return {
    userId: "student",
    auth: { getUserIdentity: async () => ({ email: "student@example.com" }) },
    runMutation: vi.fn(async (ref, _args) =>
      getFunctionName(ref) === "garden/tablesCheckout:start" ? snapshot : null,
    ),
    runQuery: vi.fn(async () => ({ stripeCustomerId: "cus_existing" })),
  };
}

describe("Stripe Table actions", () => {
  it("creates a card checkout with hold idempotency, amount snapshot and confirmation URLs", async () => {
    stripeMock.createSession.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.example",
    });
    const ctx = checkoutCtx();
    expect(
      await handler(createTableCheckout, ctx, { tableId: "table" }),
    ).toEqual({ url: "https://checkout.example" });
    expect(stripeMock.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        payment_method_types: ["card"],
        customer: "cus_existing",
        expires_at: 1_800_001_860,
        metadata: expect.objectContaining({
          kind: "table",
          holdId: "hold",
          userId: "student",
          amountCents: "1000",
        }),
        success_url: "https://site.example/tables/workshop?paid=1",
        cancel_url: "https://site.example/tables/workshop?checkout=cancelled",
      }),
      { idempotencyKey: "table-checkout:hold" },
    );
    expect(
      ctx.runMutation.mock.calls.map((call) => getFunctionName(call[0])),
    ).toEqual(["garden/tablesCheckout:start", "garden/tablesCheckout:attach"]);
  });

  it("returns an already attached live checkout without creating a second session", async () => {
    stripeMock.retrieveSession.mockResolvedValue({
      id: "cs_1",
      status: "open",
      url: "https://checkout.example",
    });
    const ctx = checkoutCtx({
      ...started,
      stripeCheckoutSessionId: "cs_1",
    } as typeof started);
    expect(
      await handler(createTableCheckout, ctx, { tableId: "table" }),
    ).toEqual({ url: "https://checkout.example" });
    expect(stripeMock.createSession).not.toHaveBeenCalled();
  });

  it("releases only a definitively rejected expiry; network errors preserve the hold for an idempotent retry", async () => {
    const ctx = checkoutCtx();
    stripeMock.createSession.mockRejectedValueOnce({
      type: "StripeInvalidRequestError",
      param: "expires_at",
    });
    await expect(
      handler(createTableCheckout, ctx, { tableId: "table" }),
    ).rejects.toThrow("reservation expired");
    expect(
      ctx.runMutation.mock.calls.map((call) => getFunctionName(call[0])),
    ).toEqual([
      "garden/tablesCheckout:start",
      "garden/tablesCheckout:releaseUncreated",
    ]);
    ctx.runMutation.mockClear();
    stripeMock.createSession.mockRejectedValueOnce(
      new Error("network timeout"),
    );
    await expect(
      handler(createTableCheckout, ctx, { tableId: "table" }),
    ).rejects.toThrow("network timeout");
    expect(
      ctx.runMutation.mock.calls.map((call) => getFunctionName(call[0])),
    ).toEqual(["garden/tablesCheckout:start"]);
  });

  it("does not reserve a seat when Stripe is unconfigured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const ctx = checkoutCtx();
    await expect(
      handler(createTableCheckout, ctx, { tableId: "table" }),
    ).rejects.toThrow("not configured");
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("routes migrated Offering checkout through the canonical Table action", async () => {
    const ctx = {
      userId: "student",
      runQuery: vi.fn(async () => "table"),
      runAction: vi.fn(async (_ref: any, _args: any) => ({
        url: "https://checkout.example",
      })),
      runMutation: vi.fn(),
    };
    await handler(createClassCheckout, ctx, { offeringId: "offering" });
    expect(ctx.runAction).toHaveBeenCalledWith(expect.anything(), {
      tableId: "table",
    });
    expect(getFunctionName(ctx.runAction.mock.calls[0][0])).toBe(
      "garden/stripe:createTableCheckout",
    );
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("does not record a pending refund as refunded and retries with the same Stripe key", async () => {
    const ctx = {
      userId: "operator",
      runQuery: vi.fn(async () => ({
        alreadyRefunded: false,
        paymentIntentId: "pi_1",
      })),
      runMutation: vi.fn(),
    };
    stripeMock.refund
      .mockResolvedValueOnce({ id: "re_1", status: "pending" })
      .mockResolvedValueOnce({ id: "re_1", status: "succeeded" });
    await expect(
      handler(refundTablePayment, ctx, { paymentId: "payment" }),
    ).rejects.toThrow("not confirmed");
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(
      await handler(refundTablePayment, ctx, { paymentId: "payment" }),
    ).toEqual({ status: "refunded", refundId: "re_1" });
    expect(stripeMock.refund.mock.calls).toEqual([
      [{ payment_intent: "pi_1" }, { idempotencyKey: "table-refund:payment" }],
      [{ payment_intent: "pi_1" }, { idempotencyKey: "table-refund:payment" }],
    ]);
    expect(ctx.runMutation).toHaveBeenCalledOnce();
  });

  it("short-circuits a completed refund and rejects anonymous callers before Stripe", async () => {
    const ctx = {
      userId: "operator",
      runQuery: vi.fn(async () => ({
        alreadyRefunded: true,
        refundId: "re_1",
      })),
    };
    expect(
      await handler(refundTablePayment, ctx, { paymentId: "payment" }),
    ).toEqual({ status: "refunded", refundId: "re_1" });
    await expect(
      handler(
        refundTablePayment,
        { runQuery: vi.fn() },
        { paymentId: "payment" },
      ),
    ).rejects.toThrow("operator");
    expect(stripeMock.refund).not.toHaveBeenCalled();
  });
});
