import { describe, expect, it, vi } from "vitest";
import {
  backingProcessingFeeCents,
  handleStripeEvent,
  tableCheckoutParts,
  type Db,
  type StripeCheckoutSessionLike,
} from "./stripeHandlers";

const session: StripeCheckoutSessionLike = {
  id: "cs_table_1",
  mode: "payment",
  customer: null,
  subscription: null,
  payment_status: "paid",
  currency: "usd",
  amount_total: 1061,
  metadata: {
    kind: "table",
    tableId: "table_1",
    holdId: "hold_1",
    userId: "user_1",
    amountCents: "1000",
    currency: "usd",
  },
};

describe("Table checkout payment boundary", () => {
  it("uses the existing sale processing fee while keeping Table price distinct", () => {
    const parts = tableCheckoutParts({
      tableId: "table_1",
      holdId: "hold_1",
      slug: "our-table",
      title: "Our Table",
      priceCents: 1000,
      currency: "usd",
      buyerUserId: "user_1",
    });
    expect(parts.lineItems.map((line) => line.price_data.unit_amount)).toEqual([
      1000,
      backingProcessingFeeCents(1000),
    ]);
    expect(parts.metadata).toEqual(session.metadata);
    expect(parts.paths).toEqual({
      success: "/tables/our-table?paid=1",
      cancel: "/tables/our-table?checkout=cancelled",
    });
    expect(parts.metadata).not.toHaveProperty("offeringId");
  });

  it("sends confirmed payments to the atomic Table adapter", async () => {
    const confirmTableCheckout = vi.fn();
    await handleStripeEvent(
      {
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: session },
      },
      { confirmTableCheckout } as unknown as Db,
    );
    expect(confirmTableCheckout).toHaveBeenCalledWith(session);
  });

  it.each(["unpaid", "no_payment_required"])(
    "does not grant paid enrollment for %s",
    async (payment_status) => {
      const confirmTableCheckout = vi.fn();
      await handleStripeEvent(
        {
          id: "evt_1",
          type: "checkout.session.completed",
          data: { object: { ...session, payment_status } },
        },
        { confirmTableCheckout } as unknown as Db,
      );
      expect(confirmTableCheckout).not.toHaveBeenCalled();
    },
  );

  it("handles delayed success through the same adapter", async () => {
    const confirmTableCheckout = vi.fn();
    await handleStripeEvent(
      {
        id: "evt_2",
        type: "checkout.session.async_payment_succeeded",
        data: { object: session },
      },
      { confirmTableCheckout } as unknown as Db,
    );
    expect(confirmTableCheckout).toHaveBeenCalledOnce();
  });

  it.each([
    "checkout.session.expired",
    "checkout.session.async_payment_failed",
  ])("releases abandoned Table holds for %s", async (type) => {
    const releaseTableCheckout = vi.fn();
    await handleStripeEvent({ id: "evt_3", type, data: { object: session } }, {
      releaseTableCheckout,
    } as unknown as Db);
    expect(releaseTableCheckout).toHaveBeenCalledWith(session);
  });

  it("fails for a missing Table adapter so Stripe retries rather than dropping money", async () => {
    await expect(
      handleStripeEvent(
        {
          id: "evt_1",
          type: "checkout.session.completed",
          data: { object: session },
        },
        {} as Db,
      ),
    ).rejects.toThrow("no Table payment support");
  });
});
