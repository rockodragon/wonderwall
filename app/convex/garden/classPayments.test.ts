// Class payments (docs/features/class-payments-and-moderation.md § Money):
// the rules for who may start a checkout, the checkout's line items and
// metadata, the webhook that records a payment, and the owed ledger it feeds.
//
// Pure logic only — an in-memory Db and hand-written Stripe-shaped fixtures,
// no Convex and no network, the same approach as stripeHandlers.test.ts (whose
// fake Db isn't exported, so this builds a minimal one). Not covered here,
// because it needs a deployment: the ctx.db adapter in memberships.ts, the
// startClassCheckout mutation, and the Stripe call itself.

import { afterEach, describe, expect, it, vi } from "vitest";
import { BANNED_PHRASES } from "../../app/constants/claims";
import {
  MAX_CLASS_PRICE_CENTS,
  MIN_CLASS_PRICE_CENTS,
  backingProcessingFeeCents,
  classCheckoutParts,
  classCheckoutRefusal,
  classPaymentPath,
  handleStripeEvent,
  splitClassSale,
  type ClassPaymentDb,
  type ClassPaymentRow,
  type Db,
  type StripeCheckoutSessionLike,
  type StripeWebhookEvent,
} from "./stripeHandlers";
import { MAX_PRODUCT_PRICE_CENTS, MIN_PRODUCT_PRICE_CENTS, splitHostSale } from "./products";

afterEach(() => {
  vi.restoreAllMocks();
});

// ——— In-memory Db: only the class methods exist ———
//
// Every other Db method throws, so these tests also prove a class payment
// touches nothing but its own rows and the buyer's sign-up.

function createClassFakeDb(seed: { teachers?: Record<string, string>; signups?: Record<string, string> } = {}) {
  const payments = new Map<string, ClassPaymentRow>(); // keyed by stripeRef
  const teachers = new Map(Object.entries(seed.teachers ?? { offering_1: "user_teacher" }));
  // "offeringId:userId" -> status. Mirrors the adapter: an existing row is
  // flipped, a missing one is created — but only for a class that exists.
  const signups = new Map(Object.entries(seed.signups ?? {}));
  const calls = { insertClassPayment: 0, confirmOfferingSignup: 0 };

  const classDb: ClassPaymentDb = {
    async getClassPaymentByRef(stripeRef) {
      return payments.has(stripeRef) ? { stripeRef } : null;
    },
    async insertClassPayment(row) {
      calls.insertClassPayment++;
      payments.set(row.stripeRef, row);
    },
    async getOfferingTeacherUserId(offeringId) {
      return teachers.get(offeringId) ?? null;
    },
    async confirmOfferingSignup(offeringId, userId) {
      calls.confirmOfferingSignup++;
      const key = `${offeringId}:${userId}`;
      if (signups.has(key) || teachers.has(offeringId)) signups.set(key, "confirmed");
    },
  };

  const db = new Proxy(classDb, {
    get(target, prop) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop);
      return async () => {
        throw new Error(`a class payment must not call Db.${prop}`);
      };
    },
  }) as unknown as Db;

  return { db, payments, signups, calls };
}

// ——— Fixtures, shaped like a real Stripe payment-mode session ———

const PRICE = 3700; // $37 class
const FEE = backingProcessingFeeCents(PRICE);

function classSession(overrides: Partial<StripeCheckoutSessionLike> = {}): StripeCheckoutSessionLike {
  return {
    id: "cs_class_1",
    mode: "payment",
    customer: "cus_student",
    subscription: null,
    payment_status: "paid",
    // What Stripe reports: the class price PLUS the card-processing line.
    amount_total: PRICE + FEE,
    created: 1_800_000_000, // 2027-01-15 UTC
    metadata: {
      kind: "class",
      offeringId: "offering_1",
      userId: "user_student",
      signupId: "signup_1",
      amountCents: String(PRICE),
    },
    ...overrides,
  };
}

function completed(session: StripeCheckoutSessionLike): StripeWebhookEvent {
  return { id: "evt_1", type: "checkout.session.completed", data: { object: session } } as StripeWebhookEvent;
}

function quietWarn() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

// ——— The webhook ———

describe("checkout.session.completed (paid class)", () => {
  it("records one payment: teacher 90 / platform 10 of the PRICE, keyed by the session id", async () => {
    const { db, payments } = createClassFakeDb();
    await handleStripeEvent(completed(classSession()), db);

    expect([...payments.values()]).toEqual([
      {
        offeringId: "offering_1",
        payeeUserId: "user_teacher",
        buyerUserId: "user_student",
        grossCents: PRICE,
        platformCents: 370,
        teacherCents: 3330,
        stripeRef: "cs_class_1",
        period: "2027-01",
      },
    ]);
  });

  it("reads the price from metadata, never Stripe's total (which includes the processing line)", async () => {
    const { db, payments } = createClassFakeDb();
    // A total that is plainly not the price: if the handler used it, the gross
    // and both shares would come out wrong.
    await handleStripeEvent(completed(classSession({ amount_total: 999_999 })), db);

    const row = payments.get("cs_class_1")!;
    expect(row.grossCents).toBe(PRICE);
    expect(row.platformCents).toBe(370);
    expect(row.teacherCents).toBe(3330);
  });

  it("a real total (price + processing) is still not the gross", async () => {
    const { db, payments } = createClassFakeDb();
    const session = classSession();
    expect(session.amount_total).toBe(PRICE + FEE);
    expect(FEE).toBeGreaterThan(0);
    await handleStripeEvent(completed(session), db);
    expect(payments.get("cs_class_1")!.grossCents).toBe(PRICE);
    expect(payments.get("cs_class_1")!.grossCents).not.toBe(session.amount_total);
  });

  it("moves the buyer's pledged sign-up to confirmed", async () => {
    const { db, signups } = createClassFakeDb({ signups: { "offering_1:user_student": "pledged" } });
    await handleStripeEvent(completed(classSession()), db);
    expect(signups.get("offering_1:user_student")).toBe("confirmed");
  });

  it("creates the sign-up when it's missing", async () => {
    const { db, signups, calls } = createClassFakeDb();
    expect(signups.size).toBe(0);
    await handleStripeEvent(completed(classSession()), db);
    expect(calls.confirmOfferingSignup).toBe(1);
    expect(signups.get("offering_1:user_student")).toBe("confirmed");
  });

  it("a replayed webhook writes nothing new", async () => {
    const { db, payments, calls } = createClassFakeDb();
    await handleStripeEvent(completed(classSession()), db);
    await handleStripeEvent(completed(classSession()), db);
    await handleStripeEvent(completed(classSession()), db);

    expect(payments.size).toBe(1);
    expect(calls.insertClassPayment).toBe(1);
    expect(calls.confirmOfferingSignup).toBe(1);
  });

  it("two different sessions are two payments — each Stripe payment is its own row", async () => {
    const { db, payments } = createClassFakeDb();
    await handleStripeEvent(completed(classSession({ id: "cs_class_1" })), db);
    await handleStripeEvent(completed(classSession({ id: "cs_class_2" })), db);
    expect([...payments.keys()].sort()).toEqual(["cs_class_1", "cs_class_2"]);
  });

  it.each(["unpaid", "no_payment_required", undefined])(
    "writes nothing unless payment_status is paid (%s)",
    async (paymentStatus) => {
      const warn = quietWarn();
      const { db, payments, calls } = createClassFakeDb();
      await handleStripeEvent(completed(classSession({ payment_status: paymentStatus })), db);

      expect(payments.size).toBe(0);
      expect(calls.insertClassPayment).toBe(0);
      expect(calls.confirmOfferingSignup).toBe(0);
      expect(warn).toHaveBeenCalled();
    },
  );

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["zero", "0"],
    ["negative", "-5"],
    ["a fraction", "12.5"],
    ["scientific", "1e3"],
    ["not a number", "abc"],
    ["padded", " 3700"],
  ])("writes NOTHING when metadata.amountCents is %s — and never falls back to the session total", async (_label, amountCents) => {
    const warn = quietWarn();
    const { db, payments, calls } = createClassFakeDb();
    const metadata: Record<string, string> = {
      kind: "class",
      offeringId: "offering_1",
      userId: "user_student",
      signupId: "signup_1",
    };
    if (amountCents !== undefined) metadata.amountCents = amountCents;
    // amount_total is a perfectly good number — using it would record a row.
    await handleStripeEvent(completed(classSession({ metadata, amount_total: PRICE + FEE })), db);

    expect(payments.size).toBe(0);
    expect(calls.insertClassPayment).toBe(0);
    expect(calls.confirmOfferingSignup).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it.each(["offeringId", "userId"])("writes nothing without %s in the metadata", async (missing) => {
    const warn = quietWarn();
    const { db, payments, calls } = createClassFakeDb();
    const metadata = { ...classSession().metadata! };
    delete metadata[missing];
    await handleStripeEvent(completed(classSession({ metadata })), db);

    expect(payments.size).toBe(0);
    expect(calls.confirmOfferingSignup).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it("still records the payment, with no payee, when the class was deleted — money is never dropped", async () => {
    const { db, payments } = createClassFakeDb({ teachers: {} });
    await handleStripeEvent(completed(classSession()), db);

    const row = payments.get("cs_class_1")!;
    expect(row.grossCents).toBe(PRICE);
    expect(row.teacherCents).toBe(3330);
    expect("payeeUserId" in row).toBe(false);
  });

  it("dates the payment by the session's UTC month", async () => {
    const { db, payments } = createClassFakeDb();
    await handleStripeEvent(
      completed(classSession({ id: "cs_dec", created: Date.UTC(2026, 11, 31, 23, 59, 59) / 1000 })),
      db,
    );
    await handleStripeEvent(
      completed(classSession({ id: "cs_jan", created: Date.UTC(2027, 0, 1, 0, 0, 1) / 1000 })),
      db,
    );
    expect(payments.get("cs_dec")!.period).toBe("2026-12");
    expect(payments.get("cs_jan")!.period).toBe("2027-01");
  });

  it("ignores a class-kind session that isn't a one-time payment", async () => {
    const { db, payments, calls } = createClassFakeDb();
    await handleStripeEvent(completed(classSession({ mode: "subscription" })), db);
    expect(payments.size).toBe(0);
    expect(calls.confirmOfferingSignup).toBe(0);
  });

  it("fails loudly, rather than drop a paid payment, when the Db can't record classes", async () => {
    const bare = {} as Db;
    await expect(handleStripeEvent(completed(classSession()), bare)).rejects.toThrow(/class payment support/);
  });
});

describe("the class split", () => {
  it("is teacher 90 / platform 10 of the price and always adds back to it", () => {
    expect(splitClassSale(3700)).toEqual({ platformCents: 370, teacherCents: 3330 });
    expect(splitClassSale(10_000)).toEqual({ platformCents: 1000, teacherCents: 9000 });
    for (const price of [100, 101, 999, 1234, 2500, 5005, 49_999, 500_000]) {
      const s = splitClassSale(price);
      expect(s.platformCents + s.teacherCents).toBe(price);
      expect(s.platformCents).toBe(Math.round(price * 0.1));
    }
  });

  it("agrees with products.ts's splitHostSale, cent by cent from $1 to $50, and at the top of the range", () => {
    const prices = [MAX_CLASS_PRICE_CENTS - 1, MAX_CLASS_PRICE_CENTS];
    for (let price = MIN_CLASS_PRICE_CENTS; price <= 5000; price++) prices.push(price);
    for (const price of prices) {
      const host = splitHostSale(price);
      expect(splitClassSale(price)).toEqual({ platformCents: host.platformCents, teacherCents: host.hostCents });
    }
  });

  it("the recorded row matches it end to end", async () => {
    for (const price of [100, 1234, 2500, 5005]) {
      const { db, payments } = createClassFakeDb();
      await handleStripeEvent(
        completed(
          classSession({
            metadata: { ...classSession().metadata!, amountCents: String(price) },
            amount_total: price + backingProcessingFeeCents(price),
          }),
        ),
        db,
      );
      const row = payments.get("cs_class_1")!;
      expect({ platformCents: row.platformCents, teacherCents: row.teacherCents }).toEqual(splitClassSale(price));
      expect(row.platformCents + row.teacherCents).toBe(row.grossCents);
    }
  });
});

// ——— Who may pay ———

describe("classPaymentPath", () => {
  it("free when there's no price", () => {
    expect(classPaymentPath({})).toBe("free");
    expect(classPaymentPath({ priceCents: 0 })).toBe("free");
    expect(classPaymentPath({ priceCents: -100 })).toBe("free");
    expect(classPaymentPath({ externalPaymentLinkUrl: "https://example.com" })).toBe("free");
  });

  it("external when a paid class has an outside payment link", () => {
    expect(classPaymentPath({ priceCents: 2500, externalPaymentLinkUrl: "https://example.com/pay" })).toBe("external");
  });

  it("checkout only for a paid class with no link (an empty link is no link)", () => {
    expect(classPaymentPath({ priceCents: 2500 })).toBe("checkout");
    expect(classPaymentPath({ priceCents: 2500, externalPaymentLinkUrl: "" })).toBe("checkout");
  });
});

describe("classCheckoutRefusal", () => {
  const offering = { userId: "user_teacher", status: "active", priceCents: PRICE };
  const ask = (over: Partial<Parameters<typeof classCheckoutRefusal>[0]> = {}) =>
    classCheckoutRefusal({ offering, buyerUserId: "user_student", ...over });

  it("lets a signed-in student pay for a paid class with no link", () => {
    expect(ask()).toBeNull();
  });

  it("lets a pledged student pay — that's how the pledge becomes a sign-up", () => {
    expect(ask({ signupStatus: "pledged" })).toBeNull();
  });

  it("accepts the price at both edges of the range", () => {
    expect(ask({ offering: { ...offering, priceCents: MIN_CLASS_PRICE_CENTS } })).toBeNull();
    expect(ask({ offering: { ...offering, priceCents: MAX_CLASS_PRICE_CENTS } })).toBeNull();
  });

  it("refuses a class that isn't there", () => {
    expect(ask({ offering: null })?.code).toBe("not_found");
  });

  it("refuses an archived class", () => {
    expect(ask({ offering: { ...offering, status: "archived" } })?.code).toBe("not_open");
  });

  it.each([undefined, 0, -100])("refuses a free class (price %s)", (priceCents) => {
    expect(ask({ offering: { ...offering, priceCents } })?.code).toBe("not_paid");
  });

  it("refuses a class with an outside payment link — that link is the payment path", () => {
    const refusal = ask({ offering: { ...offering, externalPaymentLinkUrl: "https://example.com/pay" } });
    expect(refusal?.code).toBe("external_payment");
  });

  it("refuses a price outside the products.ts range", () => {
    expect(ask({ offering: { ...offering, priceCents: MIN_CLASS_PRICE_CENTS - 1 } })?.code).toBe("invalid_price");
    expect(ask({ offering: { ...offering, priceCents: MAX_CLASS_PRICE_CENTS + 1 } })?.code).toBe("invalid_price");
  });

  it("refuses a price that isn't a whole number of cents", () => {
    expect(ask({ offering: { ...offering, priceCents: 1250.5 } })?.code).toBe("invalid_price");
  });

  it("refuses the teacher paying for their own class", () => {
    expect(ask({ buyerUserId: "user_teacher" })?.code).toBe("own_class");
  });

  it("refuses a student who is already confirmed", () => {
    expect(ask({ signupStatus: "confirmed" })?.code).toBe("already_signed_up");
  });

  it("gives every refusal a plain-language reason", () => {
    const refusals = [
      ask({ offering: null }),
      ask({ offering: { ...offering, status: "archived" } }),
      ask({ offering: { ...offering, priceCents: undefined } }),
      ask({ offering: { ...offering, externalPaymentLinkUrl: "https://example.com" } }),
      ask({ offering: { ...offering, priceCents: 50 } }),
      ask({ offering: { ...offering, priceCents: 600_000 } }),
      ask({ offering: { ...offering, priceCents: 10.5 } }),
      ask({ buyerUserId: "user_teacher" }),
      ask({ signupStatus: "confirmed" }),
    ];
    for (const r of refusals) {
      expect(r).not.toBeNull();
      expect(r!.reason).toMatch(/^[A-Z]/);
      expect(r!.reason).toMatch(/[.]$/);
      expect(r!.reason).not.toMatch(/pledge|webhook|stripe|metadata|session|payload/i);
      for (const banned of BANNED_PHRASES) expect(banned.test(r!.reason), `${r!.code} matches ${banned}`).toBe(false);
    }
  });

  it("is the same price range as community products (the twin constants haven't drifted)", () => {
    expect(MIN_CLASS_PRICE_CENTS).toBe(MIN_PRODUCT_PRICE_CENTS);
    expect(MAX_CLASS_PRICE_CENTS).toBe(MAX_PRODUCT_PRICE_CENTS);
  });
});

// ——— What goes to Stripe ———

describe("classCheckoutParts", () => {
  const parts = classCheckoutParts({
    offeringId: "offering_1",
    title: "Portrait drawing",
    priceCents: PRICE,
    buyerUserId: "user_student",
    signupId: "signup_1",
  });

  it("charges the class at its price, and card processing on its own line on top", () => {
    expect(parts.lineItems).toHaveLength(2);
    const [cls, fee] = parts.lineItems;
    expect(cls.price_data.unit_amount).toBe(PRICE);
    expect(cls.price_data.product_data.name).toBe("Portrait drawing");
    expect(fee.price_data.unit_amount).toBe(backingProcessingFeeCents(PRICE));
    expect(fee.price_data.product_data.name).toBe("Card processing");
    expect(fee.price_data.unit_amount).toBeGreaterThan(0);
  });

  it("puts the TRUE pre-fee price in the metadata, as a string", () => {
    expect(parts.metadata).toEqual({
      kind: "class",
      offeringId: "offering_1",
      userId: "user_student",
      signupId: "signup_1",
      amountCents: String(PRICE),
    });
  });

  it("returns the student to the class page, paid or not", () => {
    expect(parts.paths).toEqual({ success: "/offerings/offering_1?paid=1", cancel: "/offerings/offering_1" });
  });

  it("round trip: what the checkout sends, the webhook records at the price — not the total", async () => {
    const total = parts.lineItems.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0);
    expect(total).toBe(PRICE + FEE);

    const { db, payments } = createClassFakeDb();
    await handleStripeEvent(
      completed(classSession({ amount_total: total, metadata: parts.metadata })),
      db,
    );
    expect(payments.get("cs_class_1")).toMatchObject({
      grossCents: PRICE,
      platformCents: 370,
      teacherCents: 3330,
    });
  });
});
