import { v } from "convex/values";
import { action, httpAction, internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requireUserId } from "./helpers";
import { EVENT_ATTEMPTS, EVENT_LEASE_MS, eventProperties, eventRetryDelay, isServerEvent, type EventProperties, type ServerEvent } from "./productEventPolicy";

const POSTHOG_HOST = "https://us.i.posthog.com";


/** A product event from the server, under the member's user id: the same id
 *  the browser identifies them by (components/PostHogIdentify.tsx), so it
 *  joins their person in PostHog. For events that must count whatever the
 *  browser does (ad blockers, a closed tab): project_created, the activation
 *  event (docs/features/activation-onboarding-audit.md). Scheduled, so the
 *  mutation never waits on PostHog or fails because of it. */
export async function trackEvent(
  ctx: MutationCtx,
  event: ServerEvent,
  userId: string,
  properties?: EventProperties,
): Promise<void> {
  const id = await ctx.db.insert("productEvents", {
    eventId: crypto.randomUUID(), event, userId, properties: eventProperties(properties),
    occurredAt: Date.now(), status: "queued", attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.posthog.captureServerEvent, { id });
}

export const claimProductEvent = internalMutation({
  args: { id: v.id("productEvents") },
  handler: async (ctx, { id }): Promise<Doc<"productEvents"> | null> => {
    const row = await ctx.db.get(id);
    const now = Date.now();
    if (!row || row.status === "accepted" || row.attempts >= EVENT_ATTEMPTS) return null;
    if (row.status === "sending" && (row.leaseUntil ?? 0) > now) return null;
    if ((row.nextAttemptAt ?? 0) > now) return null;
    const attempts = row.attempts + 1;
    const leaseUntil = now + EVENT_LEASE_MS;
    await ctx.db.patch(id, { status: "sending", attempts, leaseUntil, nextAttemptAt: undefined });
    await ctx.scheduler.runAfter(EVENT_LEASE_MS, internal.posthog.recoverProductEvent, { id, attempt: attempts });
    return { ...row, status: "sending", attempts, leaseUntil };
  },
});

export const recoverProductEvent = internalMutation({
  args: { id: v.id("productEvents"), attempt: v.number() },
  handler: async (ctx, { id, attempt }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "sending" || row.attempts !== attempt || (row.leaseUntil ?? 0) > Date.now()) return;
    await ctx.db.patch(id, { status: row.attempts >= EVENT_ATTEMPTS ? "failed" : "queued", leaseUntil: undefined, lastError: "capture_timeout" });
    if (row.attempts < EVENT_ATTEMPTS) await ctx.scheduler.runAfter(0, internal.posthog.captureServerEvent, { id });
  },
});

export const finishProductEvent = internalMutation({
  args: { id: v.id("productEvents"), attempt: v.number(), accepted: v.boolean(), error: v.optional(v.string()), retryable: v.optional(v.boolean()) },
  handler: async (ctx, { id, attempt, accepted, error, retryable }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "sending" || row.attempts !== attempt) return;
    const retry = !accepted && retryable && attempt < EVENT_ATTEMPTS;
    const delay = eventRetryDelay(attempt);
    await ctx.db.patch(id, {
      status: accepted ? "accepted" : retry ? "queued" : "failed", leaseUntil: undefined,
      acceptedAt: accepted ? Date.now() : undefined, lastError: accepted ? undefined : error,
      nextAttemptAt: retry ? Date.now() + delay : undefined,
    });
    if (retry) await ctx.scheduler.runAfter(delay, internal.posthog.captureServerEvent, { id });
  },
});

// Compatibility for jobs queued before the outbox was deployed.
export const enqueueLegacyServerEvent = internalMutation({
  args: { event: v.string(), distinctId: v.string(), properties: v.optional(v.any()) },
  handler: async (ctx, args) => {
    if (isServerEvent(args.event)) await trackEvent(ctx, args.event, args.distinctId, args.properties);
  },
});

export const captureServerEvent = internalAction({
  args: { id: v.optional(v.id("productEvents")), event: v.optional(v.string()), distinctId: v.optional(v.string()), properties: v.optional(v.any()) },
  handler: async (ctx, args): Promise<void> => {
    if (!args.id) {
      if (args.event && args.distinctId) await ctx.runMutation(internal.posthog.enqueueLegacyServerEvent, { event: args.event, distinctId: args.distinctId, properties: args.properties });
      return;
    }
    const row = await ctx.runMutation(internal.posthog.claimProductEvent, { id: args.id });
    if (!row) return;
    const key = process.env.POSTHOG_API_KEY;
    let accepted = false;
    let error = "missing_configuration";
    let retryable = false;
    try {
      if (key) {
      const response = await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key, uuid: row.eventId, event: row.event, distinct_id: row.userId,
          properties: { ...(row.properties ?? {}), source: "server", platform: "server", schema_version: 1, event_id: row.eventId },
          timestamp: new Date(row.occurredAt).toISOString(),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      accepted = response.ok;
      error = `http_${response.status}`;
      retryable = response.status === 429 || response.status >= 500;
      }
    } catch {
      error = "network_error";
      retryable = true;
    }
    await ctx.runMutation(internal.posthog.finishProductEvent, { id: args.id, attempt: row.attempts, accepted, error, retryable });
  },
});

// Old browser clients used these endpoints with caller-selected identities.
// Browser SDK capture now owns UI telemetry; only trusted mutations emit facts.
export const capture = action({
  args: { event: v.string(), distinctId: v.string(), properties: v.optional(v.any()) },
  handler: async (ctx) => {
    await requireUserId(ctx);
    return { status: "retired" as const };
  },
});

export const identify = action({
  args: { distinctId: v.string(), properties: v.optional(v.any()) },
  handler: async (ctx) => {
    await requireUserId(ctx);
    return { status: "retired" as const };
  },
});

export const batch = action({
  args: { events: v.array(v.object({ event: v.string(), distinctId: v.string(), properties: v.optional(v.any()), timestamp: v.optional(v.string()) })) },
  handler: async (ctx) => {
    await requireUserId(ctx);
    return { status: "retired" as const };
  },
});

// HTTP proxy for PostHog SDK - extracts client IP for geolocation
export const proxy = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const posthogPath = url.pathname.replace("/api/ph", "");
  const posthogUrl = `${POSTHOG_HOST}${posthogPath}${url.search}`;

  // Get client IP from headers (Convex/Cloudflare sets these)
  const clientIp =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("X-Real-IP");

  try {
    const isPost = request.method === "POST";
    let body = isPost ? await request.text() : undefined;

    // Inject client IP into POST body for geolocation
    if (isPost && body && clientIp) {
      try {
        const parsed = JSON.parse(body);
        parsed.ip = clientIp;
        body = JSON.stringify(parsed);
      } catch {
        // Not JSON, leave body as-is
      }
    }

    const headers: Record<string, string> = {
      "User-Agent": request.headers.get("User-Agent") || "",
    };
    if (isPost) {
      headers["Content-Type"] =
        request.headers.get("Content-Type") || "application/json";
    }

    const response = await fetch(posthogUrl, {
      method: request.method,
      headers,
      body,
    });

    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("PostHog proxy error:", error);
    return new Response(JSON.stringify({ status: 0 }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});

export const proxyPreflight = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
});
