# Phone preview

The app shell and its phone screens (Today, People, Projects, Events,
Shortlist, Messages, and your own profile at `/profile/me`, with its
"Share your profile" panel; your code at `/code`; and someone else's page
as a scan of their code opens it, `/profile/dee?ref=f2f`, with `&visitor`
to see it signed out) on sample data, for looking at them at a phone width
without an account. The screens are the real ones (`app/routes/*`); only
`convex/react` and `@posthog/react` are swapped for the stand-ins here, and
every query is answered from `data.ts` by the function's name.

Run from `app/`:

```bash
node node_modules/vite/bin/vite.js --config e2e/phone-fixture.vite.config.ts
```

Then open http://127.0.0.1:8802/today in a 390px-wide window (or the
`phone-preview` entry in `.claude/launch.json`). A query with no sample
answer warns once in the console and stays loading, which is also how the
screen draws before the real answer arrives.

Nothing here reaches Convex, Stripe or PostHog, and nothing is a real person
or project. Not part of any test run.
