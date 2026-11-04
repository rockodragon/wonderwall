import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { applyTelnyxEvent, telnyxEventOf } from "./telnyxWebhook";

const PHONE = "+16195550100";
const NOW = 1_800_000_000_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });

const reply = (text: string, phone = PHONE) => ({ eventType: "message.received", payload: { text, from: { phone_number: phone } } });
const world = (extra: Record<string, any[]> = {}) => makeCtx({ ...extra }, null);

describe("STOP and START", () => {
  it("records STOP for the phone, any case, and a second STOP is harmless", async () => {
    const ctx = world();
    await run(applyTelnyxEvent, ctx, reply("  Stop "));
    await run(applyTelnyxEvent, ctx, reply("STOP"));
    expect(ctx.store.smsOptOuts).toEqual([expect.objectContaining({ phone: PHONE, optedOutAt: NOW })]);
  });

  it("START clears it; START with nothing on record writes nothing", async () => {
    const none = world();
    await run(applyTelnyxEvent, none, reply("start"));
    expect(none.store.smsOptOuts ?? []).toEqual([]);
    const ctx = world({ smsOptOuts: [{ _id: "smsOptOuts:a", phone: PHONE, optedOutAt: 5 }] });
    await run(applyTelnyxEvent, ctx, reply("UNSTOP"));
    expect(ctx.store.smsOptOuts[0]).toMatchObject({ optedOutAt: 5, optedInAt: NOW });
  });

  it("STOP again after START opts out again; other replies are ignored", async () => {
    const ctx = world({ smsOptOuts: [{ _id: "smsOptOuts:a", phone: PHONE, optedOutAt: 5, optedInAt: 6 }] });
    await run(applyTelnyxEvent, ctx, reply("hello"));
    expect(ctx.store.smsOptOuts[0].optedOutAt).toBe(5);
    await run(applyTelnyxEvent, ctx, reply("stop"));
    expect(ctx.store.smsOptOuts[0].optedOutAt).toBe(NOW);
  });
});

describe("delivery", () => {
  const text = { _id: "messageTexts:a", telnyxId: "tx-1", status: "sent" };
  it("stores the status and the error code on the matching text", async () => {
    const ctx = world({ messageTexts: [text] });
    await run(applyTelnyxEvent, ctx, {
      eventType: "message.finalized",
      payload: { id: "tx-1", to: [{ status: "delivery_failed" }], errors: [{ code: "40300" }] },
    });
    expect(ctx.store.messageTexts[0]).toMatchObject({ deliveryStatus: "delivery_failed", deliveryDetail: "40300" });
  });

  it("an unknown id or another event type writes nothing", async () => {
    const ctx = world({ messageTexts: [text] });
    await run(applyTelnyxEvent, ctx, { eventType: "message.finalized", payload: { id: "nope", to: [{ status: "delivered" }] } });
    await run(applyTelnyxEvent, ctx, { eventType: "message.sent", payload: { id: "tx-1", to: [{ status: "delivered" }] } });
    expect(ctx.store.messageTexts[0]).toEqual(text);
  });
});

describe("telnyxEventOf", () => {
  const envelope = (text: string) => JSON.stringify({
    data: {
      event_type: "message.received", id: "evt-1", record_type: "event",
      payload: { direction: "inbound", from: { phone_number: PHONE }, to: [{ phone_number: "+18005550199" }], text },
    },
  });

  it("reads a real-shaped inbound envelope, which then records a STOP", async () => {
    const event = telnyxEventOf(envelope("STOP"));
    expect(event).toMatchObject({ eventType: "message.received" });
    const ctx = world();
    await run(applyTelnyxEvent, ctx, event as any);
    expect(ctx.store.smsOptOuts).toEqual([expect.objectContaining({ phone: PHONE, optedOutAt: NOW })]);
  });

  it("is null for bad JSON, no data, or an event_type that isn't a string", () => {
    expect(telnyxEventOf("{nope")).toBeNull();
    expect(telnyxEventOf("{}")).toBeNull();
    expect(telnyxEventOf(JSON.stringify({ data: { event_type: 5 } }))).toBeNull();
    expect(telnyxEventOf("null")).toBeNull();
  });
});

describe("ties and blocked texts", () => {
  it("a START and STOP in the same millisecond leaves the phone opted out", async () => {
    const ctx = world({ smsOptOuts: [{ _id: "smsOptOuts:a", phone: PHONE, optedOutAt: NOW, optedInAt: NOW }] });
    await run(applyTelnyxEvent, ctx, reply("start"));
    expect(ctx.store.smsOptOuts[0]).toMatchObject({ optedOutAt: NOW, optedInAt: NOW });
    // still stopped, so a further STOP is harmless and a START records
    await run(applyTelnyxEvent, ctx, reply("stop"));
    expect(ctx.store.smsOptOuts[0]).toMatchObject({ optedOutAt: NOW });
  });

  it("error 40300 on a finalized text records the opt-out for its phone", async () => {
    const ctx = world({ messageTexts: [{ _id: "messageTexts:a", telnyxId: "tx-1", status: "sent", phone: PHONE }] });
    await run(applyTelnyxEvent, ctx, {
      eventType: "message.finalized",
      payload: { id: "tx-1", to: [{ status: "delivery_failed" }], errors: [{ code: "40300" }] },
    });
    expect(ctx.store.smsOptOuts).toEqual([expect.objectContaining({ phone: PHONE, optedOutAt: NOW })]);
    await run(applyTelnyxEvent, ctx, {
      eventType: "message.finalized",
      payload: { id: "tx-1", to: [{ status: "delivery_failed" }], errors: [{ code: "40300" }] },
    });
    expect(ctx.store.smsOptOuts).toHaveLength(1);
  });

  it("another error code records no opt-out", async () => {
    const ctx = world({ messageTexts: [{ _id: "messageTexts:a", telnyxId: "tx-1", status: "sent", phone: PHONE }] });
    await run(applyTelnyxEvent, ctx, { eventType: "message.finalized", payload: { id: "tx-1", errors: [{ code: "40008" }] } });
    expect(ctx.store.smsOptOuts ?? []).toEqual([]);
  });
});
