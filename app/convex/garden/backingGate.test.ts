// FF_BACKING (app/lib/featureFlags.ts): while backing is off, nothing that
// starts a money backing runs. createBackingCheckout refuses before it reads,
// writes or calls Stripe; startBacking and a financial supportProject write
// no row; a paid checkout still lands through the webhook; cheers still work.
//
// The flag is mocked here so each test says which way it is; the last test in
// the first block pins the real default.

import { ConvexError } from "convex/values";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../../test-support/convexContext";

const flags = vi.hoisted(() => ({ backing: false }));
vi.mock("../../app/lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../app/lib/featureFlags")>()),
  get FF_BACKING() {
    return flags.backing;
  },
}));

// The first-cheer email walks the owner's projects with an async iterator the
// fake ctx doesn't have; it isn't what is under test.
vi.mock("../engagement/firstCheer", () => ({
  isFirstCheerReceived: async () => false,
  emailFirstCheer: async () => {},
}));

// Any Stripe client built, or call made, shows up here.
const stripeClient = vi.hoisted(() => ({
  built: vi.fn(),
  createSession: vi.fn(async () => ({ url: "https://checkout.stripe.com/c/test" })),
  createCustomer: vi.fn(async () => ({ id: "cus_test" })),
}));
vi.mock("stripe", () => ({
  default: class {
    constructor() {
      stripeClient.built();
    }
    checkout = { sessions: { create: stripeClient.createSession } };
    customers = { create: stripeClient.createCustomer };
  },
}));

import { BACKING_NOT_OPEN_REASON, requireBackingOpen } from "./backingGate";
import { createBackingCheckout } from "./stripe";
import { startBacking, supportProject } from "./support";

const ADA = "users:ada";
const BO = "users:bo";

const project = {
  _id: "projects:p1",
  userId: BO,
  kind: "passion",
  title: "A film",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
};
const world = () => ({
  users: [{ _id: ADA }, { _id: BO }],
  profiles: [
    { _id: "profiles:ada", userId: ADA, name: "Ada", interests: [] },
    { _id: "profiles:bo", userId: BO, name: "Bo", interests: [] },
  ],
  projects: [project],
});

const checkoutArgs = {
  projectId: "projects:p1",
  amountCents: 2500,
  recurring: false,
  visible: true,
};

/** An action's ctx: its reads and writes go through runQuery / runMutation. */
function actionCtx(viewerId: string | null) {
  return {
    ...makeCtx({}, viewerId),
    runQuery: vi.fn(async () => null),
    runMutation: vi.fn(async () => null),
  };
}

async function refusal(promise: Promise<unknown>) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ConvexError);
  return (err as ConvexError<{ code: string; reason: string }>).data;
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_backing_gate";
  flags.backing = false;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.STRIPE_SECRET_KEY;
});

describe("backing while FF_BACKING is off", () => {
  it("ships off", async () => {
    // The real default, not the mock. Delete this test when backing opens.
    const real = await vi.importActual<typeof import("../../app/lib/featureFlags")>("../../app/lib/featureFlags");
    expect(real.FF_BACKING).toBe(false);
  });

  it("requireBackingOpen refuses with a code and a reason a person can read", () => {
    let thrown: unknown;
    try {
      requireBackingOpen();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ConvexError);
    expect((thrown as ConvexError<{ code: string; reason: string }>).data).toEqual({
      code: "backing_not_open",
      reason: BACKING_NOT_OPEN_REASON,
    });
    expect(BACKING_NOT_OPEN_REASON).toMatch(/isn't open yet/);
  });

  it.each([
    ["a signed-in backer", ADA, checkoutArgs],
    ["a guest", null, { ...checkoutArgs, guestName: "Pat" }],
    ["a monthly backer", ADA, { ...checkoutArgs, recurring: true, interval: "month" }],
    ["a /give plus-up on a project", ADA, { ...checkoutArgs, memberGiftId: "memberGifts:g1", from: "project" }],
  ])("createBackingCheckout refuses %s before any read, row or Stripe call", async (_who, viewer, args) => {
    const ctx = actionCtx(viewer);
    const data = await refusal(run(createBackingCheckout, ctx, args));
    expect(data).toEqual({ code: "backing_not_open", reason: BACKING_NOT_OPEN_REASON });
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(ctx.runQuery).not.toHaveBeenCalled();
    expect(stripeClient.built).not.toHaveBeenCalled();
    expect(stripeClient.createCustomer).not.toHaveBeenCalled();
    expect(stripeClient.createSession).not.toHaveBeenCalled();
  });

  it("startBacking writes no row, even called directly", async () => {
    const ctx = makeCtx(world(), ADA);
    const data = await refusal(
      run(startBacking, ctx, { projectId: "projects:p1", userId: ADA, amountCents: 2500, recurring: false, visible: true }),
    );
    expect(data.code).toBe("backing_not_open");
    expect(ctx.store.projectSupport ?? []).toHaveLength(0);
  });

  it.each(["financial_one_time", "financial_recurring", "financial_annual"])(
    "supportProject refuses %s and writes no pledge",
    async (type) => {
      const ctx = makeCtx(world(), ADA);
      const data = await refusal(
        run(supportProject, ctx, { projectId: "projects:p1", type, amountCents: 2500, visible: true }),
      );
      expect(data).toEqual({ code: "backing_not_open", reason: BACKING_NOT_OPEN_REASON });
      expect(ctx.store.projectSupport ?? []).toHaveLength(0);
      expect(ctx.store.notifications ?? []).toHaveLength(0);
    },
  );

  it("supportProject still takes a cheer and an offer of help: those are not money", async () => {
    const ctx = makeCtx(world(), ADA);
    await run(supportProject, ctx, {
      projectId: "projects:p1",
      type: "encouragement",
      message: "Keep going.",
      visible: true,
    });
    await run(supportProject, ctx, {
      projectId: "projects:p1",
      type: "resource",
      resourceDescription: "A free weekend in the studio.",
      visible: true,
    });
    expect(ctx.store.projectSupport.map((r: { type: string; status: string }) => [r.type, r.status])).toEqual([
      ["encouragement", "confirmed"],
      ["resource", "confirmed"],
    ]);
  });
});

describe("backing once FF_BACKING is on", () => {
  beforeEach(() => {
    flags.backing = true;
  });

  it("requireBackingOpen lets it through", () => {
    expect(() => requireBackingOpen()).not.toThrow();
  });

  it("startBacking writes the pending row the checkout will confirm", async () => {
    const ctx = makeCtx(world(), ADA);
    const out = await run(startBacking, ctx, {
      projectId: "projects:p1",
      userId: ADA,
      amountCents: 2500,
      recurring: false,
      visible: true,
    });
    expect(out).toMatchObject({ projectTitle: "A film", supporterName: "Ada" });
    expect(ctx.store.projectSupport).toHaveLength(1);
    expect(ctx.store.projectSupport[0]).toMatchObject({ type: "financial_one_time", status: "pending", amountCents: 2500 });
  });

  it("supportProject takes the legacy pledge again", async () => {
    const ctx = makeCtx(world(), ADA);
    await run(supportProject, ctx, {
      projectId: "projects:p1",
      type: "financial_one_time",
      amountCents: 2500,
      visible: true,
    });
    expect(ctx.store.projectSupport).toHaveLength(1);
    expect(ctx.store.projectSupport[0]).toMatchObject({ type: "financial_one_time", status: "pledged" });
  });

  it("createBackingCheckout goes on to write the pending row and open a Stripe session", async () => {
    const ctx = actionCtx(ADA);
    ctx.runMutation.mockImplementation(async () => ({
      supportId: "projectSupport:s1",
      supporterName: "Ada",
      projectTitle: "A film",
      storySlug: undefined,
    }));
    const out = await run(createBackingCheckout, ctx, checkoutArgs);
    expect(out).toEqual({ url: "https://checkout.stripe.com/c/test" });
    expect(ctx.runMutation).toHaveBeenCalled();
    expect(stripeClient.createSession).toHaveBeenCalledTimes(1);
  });
});

describe("the webhook never reads the flag", () => {
  // A checkout paid before backing closed must still be recorded, so the
  // handlers that confirm it must not know the flag exists. The behaviour is
  // proved in stripeHandlers.test.ts; this keeps the flag from creeping in.
  const root = join(__dirname, "..");
  it.each(["garden/stripeHandlers.ts", "garden/memberships.ts", "http.ts"])("%s", (file) => {
    const text = readFileSync(join(root, file), "utf8");
    expect(text).not.toMatch(/featureFlags|FF_BACKING|backingGate|requireBackingOpen/);
  });
});
