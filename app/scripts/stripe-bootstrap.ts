// Step 0 bootstrap — creates the three recurring Prices (and, optionally,
// the webhook endpoint) that convex/garden/stripe.ts and convex/http.ts
// expect to find via env vars. Idempotent: safe to re-run.
//
// Run (from app/):
//   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-bootstrap.ts
//   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-bootstrap.ts --webhook https://<deployment>.convex.site
//
// `tsx` isn't installed in this repo — if it's still missing when you run
// this, use the Node built-in TypeScript stripper instead (Node 22.6+):
//   STRIPE_SECRET_KEY=sk_test_... node --experimental-strip-types scripts/stripe-bootstrap.ts
//
// Refuses to run against a live secret key (sk_live_...) unless --live is
// passed explicitly. Never prints the secret key.
//
// See docs/runbooks/step-0-go-live.md for the full walkthrough this script
// is step 3 of.

import Stripe from "stripe";

// Keep in lockstep with convex/garden/stripe.ts's STRIPE_API_VERSION —
// that file pins the same string against the installed `stripe` package's
// default. Bump both together on a Stripe SDK upgrade.
const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

type Level = "seat" | "five" | "host";

interface PriceSpec {
  level: Level;
  lookupKey: string;
  productName: string;
  unitAmountCents: number;
  envVar: string;
}

const PRICE_SPECS: PriceSpec[] = [
  { level: "seat", lookupKey: "seat_monthly", productName: "A seat", unitAmountCents: 1000, envVar: "STRIPE_PRICE_SEAT" },
  { level: "five", lookupKey: "five_monthly", productName: "Five seats", unitAmountCents: 2500, envVar: "STRIPE_PRICE_FIVE" },
  { level: "host", lookupKey: "leader_monthly", productName: "Leader", unitAmountCents: 5000, envVar: "STRIPE_PRICE_HOST" },
];

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
];

function parseArgs(argv: string[]): { live: boolean; webhookUrl: string | undefined } {
  let live = false;
  let webhookUrl: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--live") {
      live = true;
    } else if (arg === "--webhook") {
      webhookUrl = argv[i + 1];
      i++;
    } else if (arg.startsWith("--webhook=")) {
      webhookUrl = arg.slice("--webhook=".length);
    }
  }
  return { live, webhookUrl };
}

async function ensurePrice(stripe: Stripe, spec: PriceSpec): Promise<{ priceId: string; created: boolean }> {
  const existing = await stripe.prices.list({ lookup_keys: [spec.lookupKey], limit: 1 });
  const found = existing.data[0];
  if (found) {
    return { priceId: found.id, created: false };
  }

  const product = await stripe.products.create({ name: spec.productName });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: spec.unitAmountCents,
    recurring: { interval: "month" },
    lookup_key: spec.lookupKey,
  });
  return { priceId: price.id, created: true };
}

async function ensureWebhook(
  stripe: Stripe,
  siteUrl: string,
): Promise<{ endpointId: string; url: string; created: boolean; secret: string | undefined }> {
  const url = `${siteUrl.replace(/\/+$/, "")}/stripe/webhook`;

  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  const found = list.data.find((e) => e.url === url);
  if (found) {
    return { endpointId: found.id, url, created: false, secret: undefined };
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS,
  });
  return { endpointId: endpoint.id, url, created: true, secret: endpoint.secret ?? undefined };
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error("Missing STRIPE_SECRET_KEY — set it in your shell env before running this script.");
    process.exitCode = 1;
    return;
  }

  const { live, webhookUrl } = parseArgs(process.argv.slice(2));

  if (secretKey.startsWith("sk_live") && !live) {
    console.error(
      "Refusing to run against a live secret key (sk_live_...) without --live. " +
        "Re-run with --live if that's really what you want.",
    );
    process.exitCode = 1;
    return;
  }

  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });

  console.log(`Bootstrapping Stripe ${secretKey.startsWith("sk_live") ? "LIVE" : "test"} mode…\n`);

  const results: { spec: PriceSpec; priceId: string; created: boolean }[] = [];
  for (const spec of PRICE_SPECS) {
    const { priceId, created } = await ensurePrice(stripe, spec);
    results.push({ spec, priceId, created });
    console.log(
      `${created ? "created" : "found "} price for "${spec.productName}" (${spec.lookupKey}): ${priceId}`,
    );
  }

  let webhookResult: Awaited<ReturnType<typeof ensureWebhook>> | undefined;
  if (webhookUrl) {
    webhookResult = await ensureWebhook(stripe, webhookUrl);
    console.log(
      `\n${webhookResult.created ? "created" : "found "} webhook endpoint at ${webhookResult.url}: ${webhookResult.endpointId}`,
    );
    if (webhookResult.created) {
      if (webhookResult.secret) {
        console.log("Signing secret returned (only shown once at creation) — copy it now.");
      } else {
        console.log(
          "Endpoint was just created but Stripe did not return a signing secret in the response — " +
            "check the Stripe dashboard (Developers → Webhooks → this endpoint → Reveal).",
        );
      }
    } else {
      console.log(
        "Endpoint already existed — its signing secret is not returned again by the API. " +
          "Find it in the Stripe dashboard (Developers → Webhooks → this endpoint → Reveal), " +
          "or delete and re-run this script to mint a fresh one.",
      );
    }
  }

  console.log("\n--- Run these to configure Convex ---\n");
  for (const { spec, priceId } of results) {
    console.log(`npx convex env set ${spec.envVar} ${priceId}`);
  }
  if (webhookResult?.created && webhookResult.secret) {
    console.log(`npx convex env set STRIPE_WEBHOOK_SECRET ${webhookResult.secret}`);
  }
  if (!webhookUrl) {
    console.log(
      "\n(No --webhook <https://<deployment>.convex.site> passed — webhook endpoint not touched. " +
        "Re-run with that flag once you know your deployment's site URL.)",
    );
  }
  console.log("");
}

main().catch((err) => {
  console.error("Stripe bootstrap failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
