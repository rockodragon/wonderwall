# Tables MVP rollout and handoff

Implemented on branch `tables` on 2026-10-03, using the latest **Garden Tables v3** file from Claude's Turn 3 design archive. The archive is visual reference material. Its mock examples, sponsorship, donations, and pay-what-you-can controls are not production requirements or seeded content.

## What ships in this branch

- Platform-wide `/tables` discovery, `/tables/new` creation, `/tables/:slug` participation, Your Tables, navigation/palette links, and a real-data Table shelf on the Desk. Reusable circular photo cards show approximate fullness, not individual seat positions.
- Free accounts host free one-time Tables. Paid Tables and manual series require an eligible paid or covered membership in the selected community. Hosting does not require an additional host tier. Independent free Tables have no community association.
- Community membership requirements, approval, schedule, and free/fixed pricing are independent. Joining an open paid Table requires an account and confirmed payment, without requiring community membership.
- Table membership records lifecycle and payment state; Events are the dated occurrences. Hosts approve/remove participants, add manual series Events, and record attendance. RSVP is intent, not attendance.
- Roster names/profile links stay private until enrollment is active and membership/payment gates are met. Applications, contacts, and attendance management are host-only. Raw Event RSVP/apply/video/attendee APIs enforce the parent Table policy. Sessionless `/j/` links never expose Table meeting URLs.
- Optional external guests can RSVP only to future Events on public, open, free Tables without a membership gate. Guest reservations and member/checkout reservations share the same chair limit; a series reserves the largest guest count among its upcoming Events rather than summing every date. Guest RSVP grants neither Table enrollment nor roster/meeting-link access. Guests receive the public Event details and an on-screen RSVP confirmation; private online room delivery is deferred until a verified guest identity flow exists.
- Fixed-price checkout reserves capacity atomically, reuses retry terms/idempotency keys, confirms access from the webhook, and preserves the shared class payment ledger and historical references. Unfulfillable paid checkouts are flagged for full operator refund and excluded from earnings. The operator ledger supplies an admin-only idempotent refund action, including the processing fee.
- Existing Offering links and new checkout attempts resolve to the migrated Table when one exists. Already-issued class checkout sessions keep their original references and reconcile Table enrollment when confirmed. Legacy Offering/session rows and reports are retained.

## Review refinements

Table details put the next gathering's date/time/location and participation action near the title in the right column. Host names reuse Event host labeling and link to existing profile and organization pages. Gathering titles open their canonical Event routes, and enrollment shows one chair confirmation. Person previews show a small portrait; organization previews reuse named member faces rather than only a count. Table and profile detail pages share a history-aware Back control.

The local design preview at `http://127.0.0.1:8802/tables` is an isolated fixture with a visible sample-data notice. Its checkout and linked detail destinations are demonstrations: it does not persist enrollment, collect payment details, or charge money. The normal app continues to use the existing Convex/Stripe transport and requires the rollout below for a live Table checkout.

## Verification

- `npm test -- --pool=forks`: 132 suites, 2,776 tests passing. The committed `vitest.config.ts` runs unit/handler tests without framework dev-server watchers.
- `npm run test:e2e:tables`: 10 Playwright tests exercise the actual React client handlers against a reactive API fixture, including creation payloads, community eligibility, join/checkout states, guest RSVP, host approval, attendance, and additional Events. These tests use no live Convex or Stripe connection and do not replace the deployment smoke tests below.
- `npm run typecheck` and `npm run build`: passing.
- Desktop/mobile visual checks for browse, detail and create: no horizontal overflow or broken images. Visual fixture data is isolated from the product.
- GitNexus change detection reviewed before each commit. The shared Event visibility/payment paths have broad impact; existing Event/payment regression suites and new Table handler tests pass.

Run the npm commands from `app/`.

## Deployment order

No deployment, Stripe endpoint reconfiguration, or production backfill was performed during implementation. Local API type generation is read-only with respect to running functions.

1. Deploy the additive Convex schema and functions from this branch to a test deployment. Configure existing Stripe credentials and site URL as for class checkout. Verify authentication, the free creator path, each enrollment policy, manual series, approval, host tools, and roster privacy with actual accounts.
2. Confirm the Stripe endpoint subscribes to `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`, alongside its existing subscription events. `app/scripts/stripe-bootstrap.ts` includes these events; inspect endpoint changes before applying them to a live Stripe account.
3. Test a fixed-price checkout and signed webhook in Stripe test mode. Confirm capacity, redirect-before-webhook state, repeated delivery, abandoned holds, paused/removed eligibility, and an exception refund. The hold-expiration cron runs every 15 minutes; read-time expiration prevents expired holds blocking seats between runs.
4. With an authenticated operator, call `garden/tablesMigration:migrateBatch` with `dryRun: true` (the default), `limit` at most 100, and each returned cursor. Inspect the result of every page. Phases are `offerings`, `signups`, `sessions`, and `rsvps`; apply source phases before their dependents.
5. In test data, run the same phases with `dryRun: false`. Repeat until `isDone`, then repeat from the beginning to verify idempotence. Compare original source IDs, payment references, reports, canonical links, meeting access, roster counts and attendance. Migration never turns RSVP intent into attendance or invents dates from cadence text. Skipped rows need operator review: unresolved host, missing email/date, existing enrollment, external unverified payment.
6. Deploy the frontend after the backend is ready. Verify the full app shell and real accounts on desktop/mobile. Apply the reviewed production migration in bounded batches only as part of the rollout, with a source-data snapshot and reconciliation report.

## Compatibility and later work

Legacy `/offerings` and operator creation remain available for unmigrated records during the additive rollout. Retire duplicate write paths only after all consumers and historical callbacks have been audited. A migrated detail URL resolves to its Table; original rows, payment/report references and IDs remain intact.

External-payment offerings migrate as unverified until an operator establishes payment evidence. This release does not fabricate paid access for a confirmed external signup. Tables created through this MVP use native fixed checkout.

Deferred: automatic recurrence, donations/pay-what-you-can, sponsored chairs, waitlists, invite token UX, member-only guest exceptions, verified guest private logistics, self-serve Table editing/cancellation, and automatic refunds for ordinary participant cancellation. These require explicit product/rollout decisions; the mockup alone does not enable them.

The canonical policy and projections are `garden/tablePolicy.ts` and `garden/tables.ts`. Checkout/hold/refund mutations are `garden/tablesCheckout.ts`; Stripe actions/webhooks reuse the existing payment integration. Bounded migration is `garden/tablesMigration.ts`. Shared card/filter logic is under `app/app/tables/`.
