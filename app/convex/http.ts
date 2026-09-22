import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import Stripe from "stripe";
import { auth } from "./auth";
import { autocomplete, autocompletePreflight } from "./location";
import {
  proxy as posthogProxy,
  proxyPreflight as posthogPreflight,
} from "./posthog";
import {
  handleResendEvent,
  verifySvixSignature,
  type ResendWebhookDb,
  type ResendWebhookEvent,
} from "./resendWebhook";

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
//
// Events to enable on this endpoint in the Stripe dashboard (all consumed by
// garden/stripeHandlers.ts's dispatcher):
//   checkout.session.completed        — memberships, event tickets, pool
//                                       contributions, project backing,
//                                       church coverage (issues the code)
//   customer.subscription.created     — memberships, coverage
//   customer.subscription.updated     — memberships, coverage
//   customer.subscription.deleted     — memberships, coverage
//   invoice.paid                      — dues shares into the grant pool ledger (new)
// ————————————————————————————————————————————————————————————————

// Matches the `stripe` package's pinned default (node_modules/stripe's
// apiVersion.js) at install time — keep these in lockstep on upgrade.
const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

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

// RFC 8058 one-click unsubscribe target (List-Unsubscribe-Post header sends
// a plain POST with no body). Convex's http router has no path-param
// syntax, so pathPrefix + parsing the token off the end of the URL is the
// way to express "/unsubscribe/:token". Turns off all categories — this is
// the automated-client target; a person visiting the same URL in a browser
// (GET) hits the frontend unsubscribe page instead.
http.route({
  pathPrefix: "/unsubscribe/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = decodeURIComponent(
      url.pathname.slice(url.pathname.indexOf("/unsubscribe/") + "/unsubscribe/".length),
    );

    await ctx.runMutation(api.emailPreferences.unsubscribeByToken, { token });

    return new Response("Unsubscribed", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }),
});

// ————————————————————————————————————————————————————————————————
// Resend delivery-event webhook (know whether email landed; stop sending to
// addresses that bounce or complain — see resendWebhook.ts's pure handler).
//
// Configure in the Resend dashboard: Webhooks → add endpoint
//   URL:    <this deployment's .convex.site origin>/resend/webhook
//   Events: email.sent, email.delivered, email.delivery_delayed,
//           email.bounced, email.complained
// Copy the endpoint's signing secret into this deployment's
// RESEND_WEBHOOK_SECRET env var (starts with "whsec_").
//
// Resend signs webhooks the Svix way (svix-id / svix-timestamp /
// svix-signature headers) — verifySvixSignature does the Web Crypto HMAC
// check locally, no dependency, since this httpAction runs in Convex's V8
// isolate (no "use node", same constraint as the Stripe route above).
// ————————————————————————————————————————————————————————————————

http.route({
  path: "/resend/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[resend webhook] RESEND_WEBHOOK_SECRET is not set");
      return new Response("Webhook not configured", { status: 500 });
    }

    const rawBody = await request.text();
    const svixHeaders = {
      svixId: request.headers.get("svix-id"),
      svixTimestamp: request.headers.get("svix-timestamp"),
      svixSignature: request.headers.get("svix-signature"),
    };

    const verified = await verifySvixSignature(secret, svixHeaders, rawBody, Date.now());
    if (!verified) {
      console.error("[resend webhook] signature verification failed");
      return new Response("Invalid signature", { status: 401 });
    }

    let event: ResendWebhookEvent;
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      console.error("[resend webhook] invalid JSON body", err);
      return new Response("Invalid body", { status: 400 });
    }

    const db: ResendWebhookDb = {
      async getDelivery(providerId) {
        return await ctx.runQuery(internal.emailDeliveries.getDeliveryByProviderId, { providerId });
      },
      async updateDelivery(providerId, patch) {
        return await ctx.runMutation(internal.emailDeliveries.applyDeliveryEvent, {
          providerId,
          ...patch,
        });
      },
      async addSuppression(row) {
        await ctx.runMutation(internal.emailDeliveries.addSuppression, row);
      },
    };

    const result = await handleResendEvent(event, db, Date.now());
    if ("unknown" in result && result.unknown) {
      console.log("[resend webhook] unknown email_id — send predates delivery tracking", event.data.email_id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
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
