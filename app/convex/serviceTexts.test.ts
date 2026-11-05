// The welcome text and the HELP reply (convex/serviceTexts.ts), run against
// the in-memory ctx with the scheduler recorded and Telnyx mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { makeCtx, run } from "../test-support/convexContext";
import { MESSAGE_TEXTS_KEY, setMessageTexts } from "./messageAlerts";
import {
  claimServiceText, finishServiceText, sendOwedWelcomes, sendServiceText, welcomeAfterOptIn,
} from "./serviceTexts";
import { sendSms } from "./smsSender";
import { setMyTexts } from "./textConsent";
import { TEXT_HELP_REPLY, TEXT_WELCOME } from "./textConsentWording";
import { applyTelnyxEvent } from "./telnyxWebhook";

vi.mock("./posthog", () => ({ trackEvent: vi.fn(async () => {}) }));
vi.mock("./smsSender", () => ({ sendSms: vi.fn(async () => ({ id: "telnyx-w" })) }));

const ANA = "users:ana";
const PHONE = "+16195550100";
const UPDATES = "+18664813837";
const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("TELNYX_UPDATES_FROM", UPDATES);
  vi.stubEnv("TELNYX_PUBLIC_KEY", "key");
  vi.mocked(sendSms).mockClear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const textsSwitch = (enabled: boolean) => ({ _id: "engagementLoops:texts", key: MESSAGE_TEXTS_KEY, enabled, subject: "", body: "", updatedAt: 1 });

function world(textsOn: boolean, extra: Record<string, any[]> = {}) {
  const ctx = makeCtx({
    users: [{ _id: ANA, phone: PHONE, phoneVerificationTime: 1 }],
    profiles: [{ _id: "profiles:ana", userId: ANA, name: "Ana" }],
    engagementLoops: [textsSwitch(textsOn)],
    ...extra,
  }, ANA);
  ctx.scheduler.runAfter = vi.fn(async () => {});
  return ctx;
}

/** Runs what got scheduled, in order, as Convex would: the welcome checks
 * and then the sends. */
async function runScheduled(ctx: any) {
  const mutations: Record<string, unknown> = {
    "serviceTexts:welcomeAfterOptIn": welcomeAfterOptIn,
    "serviceTexts:sendOwedWelcomes": sendOwedWelcomes,
  };
  const actionCtx = {
    runMutation: (reference: any, args: any) => run(
      { "serviceTexts:claimServiceText": claimServiceText, "serviceTexts:finishServiceText": finishServiceText }[getFunctionName(reference)],
      ctx, args,
    ),
  };
  for (let i = 0; i < vi.mocked(ctx.scheduler.runAfter).mock.calls.length; i++) {
    const [, reference, args] = vi.mocked(ctx.scheduler.runAfter).mock.calls[i] as any[];
    const name = getFunctionName(reference);
    if (mutations[name]) await run(mutations[name], ctx, args);
    if (name === "serviceTexts:sendServiceText") await run(sendServiceText, actionCtx, args);
  }
  vi.mocked(ctx.scheduler.runAfter).mockClear();
}

const sent = () => vi.mocked(sendSms).mock.calls.map(([to, body, from]) => ({ to, body, from }));
const reply = (text: string) => ({ eventType: "message.received", payload: { text, from: { phone_number: PHONE } } });

describe("the welcome text", () => {
  it("goes out from the updates number, word for word, once texts are on and someone opts in", async () => {
    const ctx = world(true);
    await run(setMyTexts, ctx, { on: true });
    await runScheduled(ctx);
    expect(sent()).toEqual([{ to: PHONE, body: TEXT_WELCOME, from: UPDATES }]);
    expect(ctx.store.serviceTexts).toEqual([expect.objectContaining({ kind: "welcome", status: "sent", telnyxId: "telnyx-w" })]);
  });

  it("is owed while texts are off, and goes out once when an operator switches them on", async () => {
    const ctx = world(false);
    await run(setMyTexts, ctx, { on: true });
    await runScheduled(ctx);
    expect(sent()).toEqual([]);
    await run(setMessageTexts, ctx, { enabled: true });
    await runScheduled(ctx);
    expect(sent()).toEqual([{ to: PHONE, body: TEXT_WELCOME, from: UPDATES }]);
    await run(setMessageTexts, ctx, { enabled: true });
    await runScheduled(ctx);
    expect(sent()).toHaveLength(1);
  });

  it("isn't owed to someone who switched off again before texts went on", async () => {
    const ctx = world(false);
    await run(setMyTexts, ctx, { on: true });
    vi.setSystemTime(NOW + 1000);
    await run(setMyTexts, ctx, { on: false });
    await run(setMessageTexts, ctx, { enabled: true });
    await runScheduled(ctx);
    expect(sent()).toEqual([]);
  });

  it("goes out at most once a day, however often texts are switched off and on", async () => {
    const ctx = world(true);
    await run(setMyTexts, ctx, { on: true });
    await runScheduled(ctx);
    vi.setSystemTime(NOW + HOUR);
    await run(setMyTexts, ctx, { on: false });
    await run(setMyTexts, ctx, { on: true });
    await runScheduled(ctx);
    expect(sent()).toHaveLength(1);
    vi.setSystemTime(NOW + 25 * HOUR);
    await run(setMyTexts, ctx, { on: false });
    await run(setMyTexts, ctx, { on: true });
    await runScheduled(ctx);
    expect(sent()).toHaveLength(2);
  });

  it("stays owed while the updates number isn't set, rather than being used up", async () => {
    const ctx = world(true);
    vi.stubEnv("TELNYX_UPDATES_FROM", "");
    await run(setMyTexts, ctx, { on: true });
    await runScheduled(ctx);
    expect(ctx.store.textConsents[0].welcomedFor).toBeUndefined();
    vi.stubEnv("TELNYX_UPDATES_FROM", UPDATES);
    await run(sendOwedWelcomes, ctx, {});
    await runScheduled(ctx);
    expect(sent()).toEqual([{ to: PHONE, body: TEXT_WELCOME, from: UPDATES }]);
  });

  it("reaches everyone owed, however many before them can't have one", async () => {
    const stuck = Array.from({ length: 60 }, (_, i) => ({ _id: `users:s${i}`, phone: `+1619555${String(1000 + i)}`, phoneVerificationTime: 1, email: `s${i}@example.com` }));
    const ctx = world(false, {
      users: [...stuck, { _id: ANA, phone: PHONE, phoneVerificationTime: 1 }],
      textConsents: [
        // Opted in, then added an email: can't have texts, never welcomed.
        ...stuck.map((u, i) => ({ _id: `textConsents:s${i}`, userId: u._id, phone: u.phone, agreedAt: 5 })),
        { _id: "textConsents:ana", userId: ANA, phone: PHONE, agreedAt: 5 },
      ],
    });
    await run(setMessageTexts, ctx, { enabled: true });
    await runScheduled(ctx);
    expect(sent()).toEqual([{ to: PHONE, body: TEXT_WELCOME, from: UPDATES }]);
  });

  it("isn't sent when texts were switched off again before it went", async () => {
    const ctx = world(true);
    await run(setMyTexts, ctx, { on: true });
    // Queue it, then switch off before the send runs.
    const calls = vi.mocked(ctx.scheduler.runAfter).mock.calls;
    await run(welcomeAfterOptIn, ctx, (calls[0] as any[])[2]);
    vi.setSystemTime(NOW + 1000);
    await run(setMyTexts, ctx, { on: false });
    const send = calls.find(([, ref]: any[]) => getFunctionName(ref) === "serviceTexts:sendServiceText") as any[];
    await run(claimServiceText, ctx, send[2]);
    expect(ctx.store.serviceTexts).toEqual([expect.objectContaining({ kind: "welcome", status: "skipped", detail: "no_consent" })]);
  });

  it("never goes to a number that said STOP", async () => {
    const ctx = world(true, { smsOptOuts: [{ _id: "smsOptOuts:a", phone: PHONE, optedOutAt: 1 }] });
    await run(setMyTexts, ctx, { on: true });
    await runScheduled(ctx);
    expect(sent()).toEqual([]);
  });

  it("confirms START after a STOP when the number still has a consent", async () => {
    const ctx = world(true, { smsOptOuts: [{ _id: "smsOptOuts:a", phone: PHONE, optedOutAt: 1 }] });
    await run(setMyTexts, ctx, { on: true });
    await runScheduled(ctx); // opted out: no welcome
    await run(applyTelnyxEvent, ctx, reply("START"));
    await runScheduled(ctx);
    expect(sent()).toEqual([{ to: PHONE, body: TEXT_WELCOME, from: UPDATES }]);
  });

  it("sends nothing for START from a number with no consent", async () => {
    const ctx = world(true, { smsOptOuts: [{ _id: "smsOptOuts:a", phone: PHONE, optedOutAt: 1 }] });
    await run(applyTelnyxEvent, ctx, reply("start"));
    await runScheduled(ctx);
    expect(sent()).toEqual([]);
    expect(ctx.store.smsOptOuts[0].optedInAt).toBe(NOW);
  });
});

describe("the HELP reply", () => {
  it("answers HELP or INFO word for word, even while texts are off", async () => {
    const ctx = world(false);
    await run(applyTelnyxEvent, ctx, reply(" Help "));
    await runScheduled(ctx);
    expect(sent()).toEqual([{ to: PHONE, body: TEXT_HELP_REPLY, from: UPDATES }]);
  });

  it("answers at most once an hour per number", async () => {
    const ctx = world(false);
    await run(applyTelnyxEvent, ctx, reply("HELP"));
    await run(applyTelnyxEvent, ctx, reply("info"));
    await runScheduled(ctx);
    expect(sent()).toHaveLength(1);
    vi.setSystemTime(NOW + HOUR + 1);
    await run(applyTelnyxEvent, ctx, reply("help"));
    await runScheduled(ctx);
    expect(sent()).toHaveLength(2);
  });

  it("doesn't answer a number that said STOP, or anything that isn't HELP", async () => {
    const stopped = world(false, { smsOptOuts: [{ _id: "smsOptOuts:a", phone: PHONE, optedOutAt: 1 }] });
    await run(applyTelnyxEvent, stopped, reply("help"));
    const other = world(false);
    await run(applyTelnyxEvent, other, reply("help me please"));
    await run(applyTelnyxEvent, other, reply("stop help"));
    await runScheduled(stopped);
    await runScheduled(other);
    expect(sent()).toEqual([]);
  });

  it("answers only HELP texted to the updates number", async () => {
    const ctx = world(false);
    await run(applyTelnyxEvent, ctx, { eventType: "message.received", payload: { text: "help", from: { phone_number: PHONE }, to: [{ phone_number: "+18555390406" }] } });
    await runScheduled(ctx);
    expect(sent()).toEqual([]);
    await run(applyTelnyxEvent, ctx, { eventType: "message.received", payload: { text: "help", from: { phone_number: PHONE }, to: [{ phone_number: UPDATES }] } });
    await runScheduled(ctx);
    expect(sent()).toEqual([{ to: PHONE, body: TEXT_HELP_REPLY, from: UPDATES }]);
  });

  it("sends nothing when the updates number isn't set", async () => {
    vi.stubEnv("TELNYX_UPDATES_FROM", "");
    const ctx = world(false);
    await run(applyTelnyxEvent, ctx, reply("help"));
    await runScheduled(ctx);
    expect(sent()).toEqual([]);
  });

  it("records a failed send once and doesn't retry", async () => {
    vi.mocked(sendSms).mockRejectedValueOnce(new Error("Telnyx send failed with status 503"));
    const ctx = world(false);
    await run(applyTelnyxEvent, ctx, reply("help"));
    await runScheduled(ctx);
    expect(ctx.store.serviceTexts).toEqual([expect.objectContaining({ kind: "help", status: "failed", detail: "telnyx_503" })]);
  });
});

describe("delivery", () => {
  it("stores Telnyx's final status on a welcome or HELP reply, and a STOP block opts the number out", async () => {
    const ctx = world(false, { serviceTexts: [{ _id: "serviceTexts:a", phone: PHONE, kind: "help", status: "sent", createdAt: 1, telnyxId: "tx-9" }] });
    await run(applyTelnyxEvent, ctx, {
      eventType: "message.finalized",
      payload: { id: "tx-9", to: [{ status: "delivery_failed" }], errors: [{ code: "40300" }] },
    });
    expect(ctx.store.serviceTexts[0]).toMatchObject({ deliveryStatus: "delivery_failed", deliveryDetail: "40300" });
    expect(ctx.store.smsOptOuts).toEqual([expect.objectContaining({ phone: PHONE })]);
  });
});
