# Tables browser interactions

Run from `app/`:

```bash
npm run test:e2e:tables
```

The dedicated `playwright.tables.config.ts` starts an isolated Vite server on
127.0.0.1:8801 and imports the production Tables routes and components. Its only
API substitution is `convex/react`, supplied by a reactive in-memory fixture.
Tests exercise actual client form submission, serialization, asynchronous
pending/error states, router navigation, checkout redirection, roster rendering,
guest RSVP, host acceptance, attendance, and adding manually scheduled Events.
They verify that no live Convex or Stripe API connection is made. Vite's local
hot-reload socket is allowed. Browser traces/results stay in the system temporary
directory (`wonderwall-tables-browser-results`).

`tables.browser.ts` is explicitly excluded from the standard Playwright config,
which runs against the production build. This fixture is never imported by the
production route tree and creates no production records. Its synthetic IDs and
names exist only in the isolated test browser.

These tests validate the client/API contract and interactions. The Convex handler,
policy, capacity, migration, and payment tests separately validate server behavior.
They do not replace deployment smoke tests or Stripe test-mode webhook validation.
