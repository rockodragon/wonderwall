# The Garden brand on its own domains

Status, 2026-10-03: built on `claude/garden-brand` (PR #61 into `tables`, with main merged in). The UX review (BMAD UX designer) and Rick's answers are folded in.

## Addresses

- **garden.thecreative.exchange**: The Garden's address (Rick, 2026-10-03; DNS set up the same day).
- **thegarden.thecreative.exchange**: also recognized.
- **createthegarden.com**: **not listed yet.** Every listed address is also a place sign-in may return a one-time code to. createthegarden.com is registered to someone (Squarespace, 2026-09-29) and isn't pointed at the site, so whoever holds it could finish someone else's Google sign-in. Add it once it's Rick's and on the Pages project.
- `www.` versions of these addresses count too, for both the brand and sign-in.

The list is `GARDEN_HOSTS` in `app/convex/garden/brandHosts.ts`, shared by the backend, the site and the edge. `hostOrgs.domains` for `the-garden` should list the same.

## The brand (Claude Design, "Garden Brand", Turns 5–7)

- **Mark:** a crimson disc with the G cut out.
- **Crimson:** `#D93A4B` on dark, `#A51C30` on paper. It's for the mark only and never text, because it's about 4.2:1 on ink.
- **Wordmark:** "The Garden" in Jost Medium 500, never all caps. The disc is 1.25× the font size, and the gap is ¼ of the disc.
- **Kit:** `app/public/brand/garden/`.
- **The G is a draft.** For the final one, change `GARDEN_G_PATH` (`app/app/brand/GardenMark.tsx`) and the kit files.
- **Words come from host tools only:** the tagline, the description and the agreements. Nothing about The Garden is written into the code.

## Where it shows

**On a Garden address:**

- `/` is The Garden's page: the public header, then its community page (D2). The edge serves this path without the prerendered Exchange home, so that doesn't flash first. Old `/?invite=` links still go to signup.
- The public header shows the lockup, labelled "The Garden home".
- The tab title says The Garden. The favicon, home-screen icons, manifest, theme color `#121212` and link previews are The Garden's.
- Login shows the lockup, "Sign in to The Garden" and "Same account as TheCreative.exchange." Signup's header link is the lockup.
- Sign-in codes say The Garden:
  - texts: "The Garden sign-in code: …"
  - emails: "Your code for The Garden is …", from "The Garden"
  - adding a phone in Settings: "The Garden verification code: …"
- Google sign-in starts and finishes on the Garden address (D4), so the person is signed in there.
- The invite share sheet says "Join me in The Garden".

**On every address** (Rick: everyone signs in to The Garden, so the app shows it):

- The desk's top-left is the lockup (disc 20 + Jost 16) in place of "THE GARDEN · YOUR DESK". There's no animation there.
- The phone Today page shows the lockup and the date. "Today" is the heading for screen readers.
- The Garden's community page:
  - the lockup (disc 40 + Jost 32) and the host-tools tagline in Jost 20
  - signed-out visitors get a citron "Join The Garden" and a "Sign in" link
  - the grow animation, at most once a day on a device, never with reduced motion
- The showcase says "profiles in The Garden" and its title ends "| The Garden".

On thecreative.exchange, the public pages, tab, icons and login stay TheCreative.exchange.

## How it works

| Layer | File |
|---|---|
| Addresses, return-address rule, name for codes | `app/convex/garden/brandHosts.ts` |
| Sign-in: `callbacks.redirect`, SMS and email code text | `app/convex/auth.ts`, `emails.ts`, `phoneLink.ts` |
| Site side of sign-in: `isOAuthHost`, `oauthReturnTo`, `codeRequestParams` | `app/app/lib/oauthHost.ts` |
| Edge: head rewrite, icons at their usual addresses, `/` | `app/functions/_middleware.ts`, `app/app/brand/gardenHtml.ts`, `public/_routes.json` |
| Before paint: `<html data-brand>` (`?brand=garden` on localhost and `*.pages.dev` only) | `BRAND_BOOT` in `app/app/brand/brandConfig.ts` |
| React | `useBrand()` (`exchange` during hydration), `BrandTitle`, `GardenMark` |

How sign-in knows the address: on a Garden address, the page asks for a code or Google sign-in with its own address as `redirectTo`. The backend's `callbacks.redirect` accepts SITE_URL and The Garden's https addresses, and refuses anything else. For a code, Convex Auth hands that address to the sender, and its host picks the name.

**Gotchas:**

- **Icon links are never rewritten.** React owns them, and a changed href makes React put the original back next to it. The edge answers the same addresses with The Garden's files instead.
- **Testing the edge locally:** `wrangler pages dev` from `app/` serves static files before Functions, because `wrangler.toml` has a Workers `[assets]` block. To test the edge, run it from a folder without that file. Production Pages runs `_middleware` in front of static files.

## Order to go live

1. **Deploy the backend from this branch first.** A Garden address's phone, email and Google sign-ins pass their own address, and the old backend refuses it. The new "add a phone" argument is only sent from a Garden address, so thecreative.exchange works with either backend.
2. **Add garden.thecreative.exchange as a Custom Domain on the Pages project.**
3. **Run `setCommunityDomains` for `the-garden` on prod** with `garden.thecreative.exchange`, so waitlist and signup there are tagged The Garden.
4. **Try it on the live address:** phone code text, Google sign-in, `/`, link preview.

## Open

- **D3:** move the canonical address of The Garden's page to its own domain. Later, once that domain is live.
- **Email links:** emails link to SITE_URL (thecreative.exchange). Someone who signed in only on a Garden address is signed out there and is asked to sign in again. Fix later: emails about The Garden link to its address.
- **Body text on `/for/*`:** still says TheCreative.exchange; only the head and the logo change.
- **No wide share image yet.** There's no 1200×630 Garden share picture; the square disc is used.
- **Duplicate meta tags.** React re-adds the original `og:title` and `description` meta beside the edge's after load. That's harmless, because crawlers read the raw HTML.
