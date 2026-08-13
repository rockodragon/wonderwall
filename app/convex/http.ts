import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";
import { auth } from "./auth";
import { autocomplete, autocompletePreflight } from "./location";
import {
  proxy as posthogProxy,
  proxyPreflight as posthogPreflight,
} from "./posthog";

const http = httpRouter();

auth.addHttpRoutes(http);

// ————————————————————————————————————————————————————————————————
// Stripe webhook (Phase 1B W1 — docs/phase-1b/spec.md §5, architect §2.3).
//
// httpActions run in Convex's V8 isolate, not Node — the SDK's synchronous
// `stripe.webhooks.constructEvent` needs `node:crypto` and throws here.
// `constructEventAsync` + the SubtleCrypto provider work in V8; that's the
// only reason this file constructs its own Stripe client instead of using
// garden/stripe.ts's ("use node" — a different runtime, can't be imported
// from a non-node file). Verification needs no network call, so a client
// built without a real secret key still verifies signatures correctly.
//
// NOTE (codegen): `internal.garden.memberships.applyStripeEvent` isn't in
// the generated API yet (stale codegen, see garden/memberships.ts's header)
// — cast through `as any` until `npx convex dev` regenerates it.
// ————————————————————————————————————————————————————————————————

// Matches the `stripe` package's pinned default (node_modules/stripe's
// apiVersion.js) at install time — keep these in lockstep on upgrade.
const STRIPE_API_VERSION = "2026-07-29.dahlia" as const;

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      console.error("[stripe webhook] missing signature header or STRIPE_WEBHOOK_SECRET");
      return new Response("Webhook not configured", { status: 400 });
    }

    const payload = await request.text();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_not_configured", {
      apiVersion: STRIPE_API_VERSION,
    });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch (err) {
      console.error("[stripe webhook] signature verification failed", err);
      return new Response("Invalid signature", { status: 400 });
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).garden.memberships.applyStripeEvent, { event });
    } catch (err) {
      // Stripe retries non-2xx responses with backoff — surfacing 500 here
      // is intentional so a transient Convex error gets retried rather than
      // silently dropping a membership state transition.
      console.error("[stripe webhook] handler failed", event.type, event.id, err);
      return new Response("Handler error", { status: 500 });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Location autocomplete API
http.route({
  path: "/api/location/autocomplete",
  method: "POST",
  handler: autocomplete,
});

http.route({
  path: "/api/location/autocomplete",
  method: "OPTIONS",
  handler: autocompletePreflight,
});

// PostHog proxy - bypasses ad blockers by routing through first-party domain
// Each endpoint needs explicit route since Convex doesn't support wildcards
const posthogPaths = [
  // Core event ingestion (with and without trailing slash)
  "/capture",
  "/capture/",
  "/batch",
  "/batch/",
  "/e",
  "/e/",
  "/s",
  "/s/",
  // New versioned event ingestion (PostHog v1.335+)
  "/i/v0/e",
  "/i/v0/e/",
  // Feature flags and config
  "/decide",
  "/decide/",
  "/flags",
  "/flags/",
];
for (const path of posthogPaths) {
  http.route({
    path: `/api/ph${path}`,
    method: "POST",
    handler: posthogProxy,
  });
  http.route({
    path: `/api/ph${path}`,
    method: "GET",
    handler: posthogProxy,
  });
  http.route({
    path: `/api/ph${path}`,
    method: "OPTIONS",
    handler: posthogPreflight,
  });
}

export default http;
