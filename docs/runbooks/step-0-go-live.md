# Step 0 — go live in Stripe test mode

v0.1 · owner: Rick · about an hour · run from `app/`

Clears the money gate in `docs/features/community-groups.md` §5 ("Step 0").
Nothing in Step 1's community routes needs this; every money check (seat
checkout, the dues-share ledger row, the pool contribution button) does.

## 1. Convex codegen (one-time)

```
npx convex dev
```

Log in when prompted. Creates/confirms your dev deployment and regenerates
`convex/_generated/*` against the current schema. `Ctrl-C` out once synced —
you don't need it running for the rest of this runbook.

## 2. Stripe test-mode secret key

Stripe dashboard → Developers → API keys (toggle set to **Test mode**) →
copy the secret key (`sk_test_...`).

```
npx convex env set STRIPE_SECRET_KEY sk_test_...
```

## 3. Bootstrap prices + webhook

```
STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-bootstrap.ts --webhook https://<deployment>.convex.site
```

No `tsx` installed? Use
`node --experimental-strip-types scripts/stripe-bootstrap.ts ...` or
`pnpm run stripe:bootstrap -- --webhook ...`.

`<deployment>.convex.site` is your deployment's **site URL** (from
`npx convex dev`'s output, or the Convex dashboard's Settings → URL &
Deploy Key — the `.convex.site` one, not `.convex.cloud`).

Idempotent; refuses a live key (`sk_live_...`) unless you also pass
`--live`. It prints the exact commands to run — paste all of them:

```
npx convex env set STRIPE_PRICE_SEAT price_...
npx convex env set STRIPE_PRICE_FIVE price_...
npx convex env set STRIPE_PRICE_HOST price_...
npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
```

The webhook secret is only ever returned at endpoint *creation*. If the
script found an existing endpoint instead of creating one, get the secret
from Stripe dashboard → Developers → Webhooks → that endpoint → Reveal, or
delete it and re-run to mint a fresh one.

Also set the redirect base for checkout:

```
npx convex env set SITE_URL https://www.thegarden.app
```

## 4. Seed the platform + community rows

```
npx convex run garden/devSeed:seedCommunityLaunch
npx convex run garden/devSeed:seedCommunityLaunch --prod   # once ready to go live
```

Idempotent. Ensures the `creatives-exchange` platform row, re-kinds/patches
`the-garden` to `kind: "community"` (with its tagline, description, and
location), ensures `abiding-practice`, and makes every admin account a
**host** of The Garden. To name the hosts explicitly instead:

```
npx convex run garden/devSeed:seedCommunityLaunch '{"hostEmails":["you@example.com"]}'
```

## 5. Confirm the webhook

Stripe dashboard → Developers → Webhooks → your endpoint → confirm all five
events are enabled: `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.paid`.

## 5b. Turn on the customer portal

Stripe dashboard → Settings → Billing → **Customer portal** (test mode) →
enable it and allow: cancel subscriptions, update payment method, invoice
history. The "Manage billing" button in Settings opens this portal;
cancellations flow back through the existing subscription webhooks.

## 6. Acceptance test

1. Run a **test-mode** $10 checkout from `/join` (card `4242 4242 4242
   4242`, any future expiry/CVC).
2. An **active** `memberships` row exists for your test user — this is the
   real Step 0 exit criteria.
3. A `grantContributions` row of type `dues_share` with `poolCents: 500`
   and `platformCents: 500` was written (the `invoice.paid` handler in
   `convex/garden/stripeHandlers.ts`). If the membership row exists but
   this row doesn't, `invoice.paid` isn't enabled on the webhook endpoint.
4. Open `/fund/creatives-exchange`, add $25 to the project pool with the
   test card: a `contribution_in` row with `poolCents: 2250` and
   `platformCents: 250`, and the page's Balance moves.
5. The webhook route verifies signatures instead of 404ing:
   ```
   curl -i https://<deployment>.convex.site/stripe/webhook
   ```
   Expect **400** (missing/invalid signature). **404** means the route
   isn't deployed or the URL is wrong.

## 7. Deploy

```
pnpm deploy
```

## What can go wrong

- **Webhook signature failed** (Convex logs: `missing signature header or
  STRIPE_WEBHOOK_SECRET`, or a verification error). `STRIPE_WEBHOOK_SECRET`
  doesn't match the endpoint you're sending to — test and live mode each
  have their own secret. Re-run the bootstrap script or copy it fresh from
  the dashboard.
- **Checkout throws a price error** (`Stripe price env var for level "X"
  is not set`). One of the three price env vars is unset — redo step 3's
  `npx convex env set` lines; verify with `npx convex env get
  STRIPE_PRICE_SEAT`.
- **Community page 404s / checkout says "Host org not found."**
  `the-garden` is still `kind: "platform"`. Re-run
  `npx convex run garden/devSeed:seedCommunityLaunch` (add `--prod` for
  prod).
- **Wrong deployment host for the webhook.** `.convex.site` (HTTP routes)
  is not `.convex.cloud` (the client API URL) — same deployment, different
  hosts.
