import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { makeCtx, run } from "../test-support/convexContext";
import { trackEvent, captureServerEvent, claimProductEvent, finishProductEvent, recoverProductEvent, capture, identify, batch } from "./posthog";
import { EVENT_ATTEMPTS, EVENT_LEASE_MS } from "./productEventPolicy";

const NOW = 1_800_000_000_000;
function world() { const ctx = makeCtx({}, null); ctx.scheduler.runAfter = vi.fn(); return ctx; }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("durable server analytics", () => {
  it("records occurrence and UUID before scheduling, filtering private fields", async () => {
    const ctx = world();
    await trackEvent(ctx, "message_sent", "users:one", { messageId: "messages:one", body: "Private", email: "private@example.com", count: 1 });
    expect(ctx.store.productEvents[0]).toMatchObject({ event: "message_sent", userId: "users:one", occurredAt: NOW, attempts: 0, status: "queued", properties: { messageId: "messages:one", count: 1 } });
    expect(ctx.store.productEvents[0].eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
  });

  it("claims once, preserves identity across retry, and ignores stale completions", async () => {
    const ctx = world();
    await trackEvent(ctx, "first_reply", "users:one");
    const original = { ...ctx.store.productEvents[0] };
    const id = original._id;
    expect((await run(claimProductEvent, ctx, { id })).attempts).toBe(1);
    expect(await run(claimProductEvent, ctx, { id })).toBeNull();
    await run(finishProductEvent, ctx, { id, attempt: 1, accepted: false, error: "network_error", retryable: true });
    expect(ctx.store.productEvents[0].status).toBe("queued");
    expect(await run(claimProductEvent, ctx, { id })).toBeNull();
    vi.setSystemTime(NOW + 60_000);
    expect((await run(claimProductEvent, ctx, { id })).attempts).toBe(2);
    await run(finishProductEvent, ctx, { id, attempt: 1, accepted: true });
    expect(ctx.store.productEvents[0].status).toBe("sending");
    await run(finishProductEvent, ctx, { id, attempt: 2, accepted: true });
    expect(ctx.store.productEvents[0]).toMatchObject({ eventId: original.eventId, occurredAt: original.occurredAt, status: "accepted" });
  });

  it("recovers a crashed lease and stops after bounded attempts", async () => {
    const ctx = world();
    await trackEvent(ctx, "message_sent", "users:one");
    const id = ctx.store.productEvents[0]._id;
    for (let attempt = 1; attempt <= EVENT_ATTEMPTS; attempt++) {
      await run(claimProductEvent, ctx, { id });
      vi.setSystemTime(Date.now() + EVENT_LEASE_MS);
      await run(recoverProductEvent, ctx, { id, attempt });
    }
    expect(ctx.store.productEvents[0]).toMatchObject({ status: "failed", attempts: EVENT_ATTEMPTS });
    expect(await run(claimProductEvent, ctx, { id })).toBeNull();
  });

  it("uses stable UUID and original time on the provider request, never raw network errors", async () => {
    const ctx = world();
    await trackEvent(ctx, "conversation_read", "users:one");
    const row = { ...ctx.store.productEvents[0], attempts: 1 };
    const runMutation = vi.fn(async (ref, _input: unknown) => getFunctionName(ref) === "posthog:claimProductEvent" ? row : undefined);
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetch); vi.stubEnv("POSTHOG_API_KEY", "test-key");
    vi.setSystemTime(NOW + 120_000);
    await run(captureServerEvent, { runMutation }, { id: row._id });
    const sent = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sent).toMatchObject({ uuid: row.eventId, timestamp: new Date(NOW).toISOString(), distinct_id: "users:one", properties: { source: "server", schema_version: 1 } });
    fetch.mockRejectedValue(new Error("private response or credentials"));
    await run(captureServerEvent, { runMutation }, { id: row._id });
    expect(runMutation.mock.calls.at(-1)?.[1]).toMatchObject({ error: "network_error", retryable: true, accepted: false });
  });

  it("persists missing configuration as a failure and retires unauthenticated legacy writes", async () => {
    const ctx = world();
    await trackEvent(ctx, "message_sent", "users:one");
    vi.stubEnv("POSTHOG_API_KEY", "");
    const row = { ...ctx.store.productEvents[0], attempts: 1 };
    const runMutation = vi.fn(async (ref, _input: unknown) => getFunctionName(ref) === "posthog:claimProductEvent" ? row : undefined);
    await run(captureServerEvent, { runMutation }, { id: row._id });
    expect(runMutation.mock.calls.at(-1)?.[1]).toMatchObject({ error: "missing_configuration", retryable: false });
    for (const fn of [capture, identify, batch]) await expect(run(fn, ctx, {})).rejects.toThrow();
  });
});
