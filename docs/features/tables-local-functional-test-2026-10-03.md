# Tables local functional test — October 3, 2026

Tested `tables` at `33c164558c8da6c4165c0a1ba59e53ed1c1aef37`, after pulling the branch. Security testing was stopped at the user's request. This pass made no live enrollment changes, collected no payment details, and executed no payment or deployment.

## Results

- **10/10 browser tests passed:** `npm run test:e2e:tables -- --workers=3` in `app/`. These render the actual Tables routes with an isolated API transport fixture, on port 8801. They cover free creation; community eligibility for paid/series hosting; pending, successful and failed join behavior; checkout routing and return; Event/person/community navigation; payment-confirmation state; guest RSVP; host acceptance/attendance; and appending an Event. The fixture deliberately sends no Convex or Stripe requests.
- **87/87 focused backend tests passed** across `tablesHandlers.test.ts`, `tablesEventsIntegration.test.ts`, `tablesCheckout.test.ts`, `tablesPayments.test.ts`, and `tablesStripeActions.test.ts`. These execute handlers with synthetic database contexts and mocked Stripe dependencies. They cover creation, enrollment, capacity, checkout, payment/refund handling, and migration behavior.
- **Running rich preview, port 8802:** search for songwriter returned one card; Free returned three cards; host profile link and Back returned to the originating Table; a 390px viewport had no horizontal document overflow; no uncaught page errors. This preview uses sample data and synthetic destination pages.
- **Normal app, port 5173:** discovery successfully reads a real development-backend Table, Third Thursday Songwriters. Signed-out creation displays its sign-in gate. Opening `/tables/third-thursday` fails with `Cannot read properties of undefined (reading 'find')` at `TableDetailPage`.

## Live testing blocker

The normal app connects to development Convex `giant-wildebeest-814`. Its deployed `garden/tables:getTable` returns a legacy response with `sessions`, but no `events`; its `viewer` contains only `canJoin` and `isMember`. The current frontend expects the new canonical Events and participation response. This explains the detail crash and prevents a meaningful real join/checkout test.

Update the chosen development backend from this branch, or configure an isolated local Convex backend, before continuing authenticated functional testing. The shared development backend was left unchanged pending the user's backend choice.

## Remaining functional gaps

1. External guest RSVP uses the busiest Event's guest occupancy across the series, so a full Event can incorrectly block guests on another Event with space. Persistent Table chairs should still use the aggregate capacity rule.
2. An accepted member of an approval-access Table is asked to obtain approval again for each canonical Event. No independently configured Event approval policy has been established for this MVP.
3. The existing browser suite does not exercise real profile-page Back navigation, organization host destinations, or Desk people-preview avatar/name rendering. Fixture destinations are synthetic.

The first two gaps were established in the completed review; the passing suites do not contain their regression cases. Previously confirmed host-removal and external-ticket webhook findings are tracked separately, with no additional security testing in this pass.

## Next live checks

Once backend and frontend match, use development accounts to create a free one-time Table, join and leave, verify accepted roster access, follow real host/Event/profile links, and test host management. Then use an eligible community host and Stripe test mode to verify fixed-price checkout, cancellation, webhook confirmation, and refund. Real card charges are outside this test pass.
