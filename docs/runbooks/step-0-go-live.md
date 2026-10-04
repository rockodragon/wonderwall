# Stripe test mode on the dev backend

v0.2 · 2026-10-03 · owner: Rick · about 45 minutes · run from `app/`

Test money in a safe copy of Stripe before anything touches real cards. Memberships, sponsored seats, backings and paid Tables all use this.

## Two separate worlds — never mix them

| | Live (real money) | Test (fake money) |
|---|---|---|
| Stripe | Live mode | **Test mode** or a **Sandbox** (Stripe's account menu, top left) |
| Keys | `sk_live_…` | `sk_test_…` |
| Convex backend | prod: `courteous-rabbit-750` | dev: `giant-wildebeest-814` |
| Webhook endpoint | `https://courteous-rabbit-750.convex.site/stripe/webhook` (exists) | `https://giant-wildebeest-814.convex.site/stripe/webhook` (you create it below) |
| Site | https://thecreative.exchange | http://localhost:5173 |

Each world has its own keys, prices, webhook and webhook secret. Never put a test key on prod, and never put a live key on dev.

Webhook addresses end in **`.convex.site`**, not `.convex.cloud`. They're the same backend on two different hosts, and webhooks only work on `.convex.site`.

## What Stripe needs (and doesn't)

- **Products and prices:** the bootstrap script in step 3 creates three monthly prices, so you don't make them by hand:
  - "A seat", $10 (`seat_monthly`): membership and sponsored seats
  - "Five seats", $25 (`five_monthly`): the `/join` plan; see `docs/features/pricing-page.md`
  - "Leader", $50 (`leader_monthly`): the `/join` plan; same note
- **Paid Tables, backings, gifts and pool contributions** need no products. The checkout makes the price on the spot.
- **Payment Links:** not needed. They're only for events whose tickets are sold through Abiding Practice's own Stripe account. Those arrive at a different route (`/stripe/ap/webhook`, secret `AP_STRIPE_WEBHOOK_SECRET`). Skip them unless you're testing that.
- **Stripe Connect:** not needed for these tests. It only pays out member-directed gifts and backings automatically.

## Environment variables on the dev backend

| Name | Value | What it does |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` | Lets the backend create checkouts |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the **test** endpoint | Lets the backend trust Stripe's "payment done" messages |
| `STRIPE_PRICE_SEAT` | `price_…` ($10) | Membership and sponsored seats |
| `STRIPE_PRICE_FIVE` | `price_…` ($25) | `/join`'s $25 plan |
| `STRIPE_PRICE_HOST` | `price_…` ($50) | `/join`'s $50 plan |
| `SITE_URL` | `http://localhost:5173` | Where Stripe and sign-in send people back. If unset, Stripe sends test buyers to the real site |
| `AP_STRIPE_WEBHOOK_SECRET` | optional | Only for Abiding Practice payment-link tickets |

The sign-in keys (`JWT_PRIVATE_KEY`, `JWKS`) and email settings are already on dev. Leave them alone.

## Steps

**1. Put the current code on the dev backend.** Run this from the branch you want to test (for Tables, `tables`). It replaces whatever code is on dev, so tell any other session working on dev first.

```bash
npx convex dev --once
```

**2. Copy your test secret key.** In Stripe, switch to Test mode (or your Sandbox), then go to Developers → API keys → Secret key. It starts with `sk_test_`.

```bash
npx convex env set --deployment giant-wildebeest-814 STRIPE_SECRET_KEY sk_test_PASTE_HERE
```

**3. Create the prices and the test webhook.**

```bash
STRIPE_SECRET_KEY=sk_test_PASTE_HERE pnpm run stripe:bootstrap -- --webhook https://giant-wildebeest-814.convex.site
```

It prints four `npx convex env set …` lines: three prices and the webhook secret. Run each one with `--deployment giant-wildebeest-814` added after `env set`. The webhook secret is shown **only once**, at creation.

If a test endpoint already existed at that address, the script leaves it alone. In that case:
- In Stripe, open Developers → Webhooks → that endpoint.
- Make sure it listens to all eight events:
  - `checkout.session.completed`, `.expired`, `.async_payment_succeeded`, `.async_payment_failed`
  - `customer.subscription.created`, `.updated`, `.deleted`
  - `invoice.paid`
- Copy its secret with "Reveal" and set `STRIPE_WEBHOOK_SECRET` yourself.

**4. Tell Stripe where to send people back.**

```bash
npx convex env set --deployment giant-wildebeest-814 SITE_URL http://localhost:5173
```

**5. Turn on the billing portal** (test mode). In Stripe, go to Settings → Billing → Customer portal. Allow canceling, updating the card and viewing invoices. "Manage billing" in Settings opens it.

**6. Make sure The Garden exists on dev.**

```bash
npx convex run --deployment giant-wildebeest-814 garden/devSeed:seedCommunityLaunch
```

**7. Check the webhook is reachable.**

```bash
curl -i -X POST https://giant-wildebeest-814.convex.site/stripe/webhook
```

Expect **400**: no signature, so the route is there. **404** means the code from step 1 isn't on dev or the address is wrong. (A plain GET returns 404 even when everything is right; the route only takes POST.)

## Try it

Start the site on dev: `pnpm run dev` (it reads `.env.local`, which points at dev). Then open http://localhost:5173. Don't use the desktop app's "app-dev" preview — it points at **prod**. Sign in with email and password; Google sign-in isn't set up for dev.

Test card: `4242 4242 4242 4242`, any future date, any 3-digit code.

1. **Membership:** pay $10 at `/join`.
   - Stripe shows the payment.
   - Your membership turns active.
   - A `grantContributions` row of type `dues_share` appears, with `platformCents 100`, `groupCents 400`, `poolCents 500` (The Garden's 10/40/50).
   - If the membership is active but that row is missing, `invoice.paid` isn't on the webhook.
2. **Paid Table:** as a member, create a $10 Table with one seat. From another account, pay for it.
   - Stripe charges **$10.61**; the card fee is added on top.
   - The buyer is enrolled after the "confirming payment" screen.
   - `classPayments` has one paid row: 1000 / 100 / 900.
3. **Resent message:** in Stripe, go to Webhooks → the endpoint → that event → Resend. There should still be only one payment.
4. **Leaving checkout:** open checkout from a third account and close it. The seat stays held for about 31 minutes, then frees up.

## Prod, later (live mode)

The live webhook (`https://courteous-rabbit-750.convex.site/stripe/webhook`) was made before Tables. Before paid Tables go live, open it in Stripe (live mode) and add:
- `checkout.session.expired`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

Leave its secret as it is. Check that prod's `SITE_URL` is `https://thecreative.exchange`.

## What can go wrong

- **"Invalid signature" in the Convex logs:** `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint Stripe is sending from. Test and live each have their own.
- **"Stripe price env var for level … is not set":** a `STRIPE_PRICE_*` line from step 3 wasn't run with `--deployment giant-wildebeest-814`.
- **After paying, you land on thecreative.exchange:** `SITE_URL` isn't set on dev (step 4).
- **Your Table page breaks or your test data vanishes:** someone pushed other code to dev. Re-run step 1 from your branch.
- **"Schema validation failed" on step 1:** old rows block the push. Ask before turning validation off; the migrations under `convex/garden/*Migration.ts` fix them.
