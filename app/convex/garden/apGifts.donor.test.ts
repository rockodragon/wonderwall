import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { applyApStripeEvent } from "./apGifts";

// A gift from the fund page's Give button names its giver on
// client_reference_id (`fund-u-<userId>`, givingLink.ts). The AP webhook
// counts it toward the fund and puts it on that person's account.

const ANA = "users:ana";
const AP = "hostOrgs:ap";

function world(): Record<string, Row[]> {
  return {
    users: [{ _id: ANA, name: "Ana", email: "ana@example.com" }],
    hostOrgs: [{ _id: AP, kind: "org", status: "active", name: "Abiding Practice", slug: "abiding-practice" }],
    grantContributions: [],
    apGiftSubscriptions: [],
  };
}

// The test db's normalizeId wants "table:id"; real ones are bare ids.
function webhookCtx(data: Record<string, Row[]>) {
  const ctx = makeCtx(data, null);
  const normalize = ctx.db.normalizeId;
  ctx.db.normalizeId = (table: string, id: string) => normalize(table, `${table}:${id}`);
  return ctx;
}

const session = (extra: Record<string, unknown> = {}, id = "one") => ({
  event: {
    id: `evt_${id}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_${id}`,
        payment_status: "paid",
        currency: "usd",
        amount_total: 5000,
        client_reference_id: "fund-u-ana",
        customer_details: { name: "Ana", email: "ana@example.com" },
        created: 1_800_000_000,
        ...extra,
      },
    },
  },
});

let savedLinks: string | undefined;
beforeEach(() => {
  savedLinks = process.env.AP_GRANT_PAYMENT_LINK_IDS;
  process.env.AP_GRANT_PAYMENT_LINK_IDS = "plink_fund";
});
afterEach(() => {
  if (savedLinks === undefined) delete process.env.AP_GRANT_PAYMENT_LINK_IDS;
  else process.env.AP_GRANT_PAYMENT_LINK_IDS = savedLinks;
});

describe("a fund-page gift (client_reference_id fund-u-<userId>)", () => {
  it("counts at the full amount and is credited to the giver", async () => {
    const ctx = webhookCtx(world());
    await run(applyApStripeEvent, ctx, session({ payment_link: "plink_fund" }));
    expect(ctx.store.grantContributions).toHaveLength(1);
    expect(ctx.store.grantContributions[0]).toMatchObject({
      type: "contribution_in",
      grossCents: 5000,
      platformCents: 0,
      poolCents: 5000,
      userId: ANA,
      note: "Gift through Abiding Practice",
      stripeRef: "ap:cs_test_one",
    });
    expect(ctx.store.grantContributions[0].memberGiftId).toBeUndefined();
  });

  it("is recorded even when its payment link isn't in AP_GRANT_PAYMENT_LINK_IDS", async () => {
    const ctx = webhookCtx(world());
    await run(applyApStripeEvent, ctx, session({ payment_link: "plink_other" }));
    expect(ctx.store.grantContributions).toHaveLength(1);
    expect(ctx.store.grantContributions[0]).toMatchObject({ userId: ANA, grossCents: 5000 });
  });

  it("is recorded without a userId when the id names no real user", async () => {
    const ctx = webhookCtx(world());
    await run(applyApStripeEvent, ctx, session({ client_reference_id: "fund-u-ghost" }));
    expect(ctx.store.grantContributions).toHaveLength(1);
    expect(ctx.store.grantContributions[0].userId).toBeUndefined();
    expect(ctx.store.grantContributions[0].grossCents).toBe(5000);
  });

  it("writes one row however many times Stripe replays it", async () => {
    const ctx = webhookCtx(world());
    await run(applyApStripeEvent, ctx, session());
    await run(applyApStripeEvent, ctx, session());
    expect(ctx.store.grantContributions).toHaveLength(1);
  });

  it("remembers a monthly gift's giver, so renewals are credited to them", async () => {
    const ctx = webhookCtx(world());
    await run(applyApStripeEvent, ctx, session({ subscription: "sub_1" }));
    expect(ctx.store.grantContributions[0]).toMatchObject({ userId: ANA, note: "Monthly gift through Abiding Practice" });
    expect(ctx.store.apGiftSubscriptions).toHaveLength(1);
    expect(ctx.store.apGiftSubscriptions[0]).toMatchObject({ subscriptionId: "sub_1", userId: ANA });
    expect(ctx.store.apGiftSubscriptions[0].memberGiftId).toBeUndefined();

    const invoice = {
      id: "evt_renew",
      type: "invoice.paid",
      data: {
        object: { id: "in_2", billing_reason: "subscription_cycle", amount_paid: 5000, currency: "usd", created: 1_802_000_000, subscription: "sub_1" },
      },
    };
    await run(applyApStripeEvent, ctx, { event: invoice });
    expect(ctx.store.grantContributions).toHaveLength(2);
    expect(ctx.store.grantContributions[1]).toMatchObject({ userId: ANA, grossCents: 5000, stripeRef: "ap:in_2" });
  });

  it("writes nothing for a session with no ref and no designation", async () => {
    const ctx = webhookCtx(world());
    await run(applyApStripeEvent, ctx, session({ client_reference_id: null, payment_link: "plink_other" }));
    expect(ctx.store.grantContributions).toHaveLength(0);
    expect(ctx.store.apGiftSubscriptions).toHaveLength(0);
  });
});
