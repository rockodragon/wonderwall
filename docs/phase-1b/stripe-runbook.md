# Stripe runbook

v1.0 · 2026-09-04 · owner: Rick

What is wired, what to configure, and what still has to be built. Money paths and splits live in the Business Model doc; this is the operational setup.

---

## 1 · Environment variables

Set on the Convex deployment (`npx convex env set NAME value`, add `--prod` for production). All six are required before any checkout works.

| Variable | What it is | Where to get it |
|---|---|---|
| `STRIPE_SECRET_KEY` | Secret API key | Stripe → Developers → API keys. `sk_test_…` for dev, `sk_live_…` for prod. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook endpoint | Created with the endpoint in step 2. `whsec_…` |
| `STRIPE_PRICE_SEAT` | Price ID for the $10/mo seat | Stripe → Product catalogue, recurring monthly. `price_…` |
| `STRIPE_PRICE_FIVE` | Price ID for the $25/mo five-project tier | Same |
| `STRIPE_PRICE_HOST` | Price ID for the $50/mo Leader tier | Same |
| `SITE_URL` | Base URL for checkout return links | `https://creatives.exchange` in prod |

Verify with `npx convex env list --prod`. A missing price variable throws a named error at checkout rather than failing silently.

## 2 · Webhook endpoint

The handler is a Convex `httpAction`, so it lives on the **`.convex.site`** domain, not `.convex.cloud`.

1. Stripe → Developers → Webhooks → Add endpoint.
2. URL: `https://<deployment>.convex.site/stripe/webhook`
3. Events to send: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

The handler returns 400 only for a missing signature, a missing secret, or a failed signature check. Unknown event types return 200, so extra events subscribed by mistake are harmless — they are ignored, not errors.

## 3 · API version

`STRIPE_API_VERSION` in `convex/garden/stripe.ts` is pinned and must match the version the installed `stripe` package ships with (`node_modules/stripe/…/apiVersion.js`). Bump both together or the SDK types stop compiling.

## 4 · What is wired today

| Flow | Function | State |
|---|---|---|
| Membership subscription | `createMembershipCheckout` | Complete |
| Event tickets | `createTicketCheckout` | Complete — per-event tiers via inline `price_data`, guests can buy |
| Membership state from webhooks | `stripeHandlers.ts` + `memberships.ts` | Complete, idempotent, replay-tested |
| Nightly reconcile sweep | `reconcileMemberships` | Complete — the backstop against missed webhooks |

## 5 · What still has to be built

Ordered by effort.

**Church coverage checkout** — half a day. `createCoverageCheckout` is a commented-out stub in `stripe.ts`. The webhook side is already implemented and tested; what's outstanding is the checkout session (`mode: "subscription"`, `quantity = seats`, metadata `{kind: "coverage", hostOrgId, sponsorName}`) and issuing the `coverageCodes` row on completion.

**Class and premium checkout** — half a day. `offerings` carries `priceCents`; `offeringSignups` records a signup but no charge. Needs a checkout action mirroring `createTicketCheckout`, a `checkout.session.completed` branch writing the signup as paid, and the buyer-pays-fee line item.

**Project backing checkout** — about a day. `projectSupport` records intent only. Needs the checkout action, the fee-on-the-backer calculation (charge = (amount + 0.30) / 0.971 so the creative nets the full amount), a webhook branch, and a payout path to the creative.

**Payouts to creatives and hosts** — Stripe Connect Express. A day of integration plus onboarding time per recipient, since each one completes Stripe's identity verification themselves. Costs $2 per active account per month and $0.25 + 0.25% per payout.

**On-site donations to the grant fund** — a day of integration, plus AP's own onboarding. AP connects their Stripe account; donations are created as charges on AP's connected account so AP stays merchant of record and issues the receipt with their EIN. Our 5% comes out as a Stripe `application_fee_amount`, automatically. The donor designates the Grant Fund on our checkout, so the gift is designated rather than landing in AP's general giving. Replaces the outbound link in `app/routes/fund.$slug.tsx`.

## 6 · Testing

Use Stripe test mode with card `4242 4242 4242 4242`, any future expiry, any CVC. `stripe listen --forward-to https://<deployment>.convex.site/stripe/webhook` replays events locally. Every webhook handler has a replay test in `stripeHandlers.test.ts` — keep it that way.
