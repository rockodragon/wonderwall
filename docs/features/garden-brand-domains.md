# The Garden brand on its own domains

Status, 2026-10-03: the frontend and edge parts are built on `claude/garden-brand` (cut from `tables`, with main merged in). The UX review (BMAD UX designer) is folded in. D1–D4 and the backend items below are open.

## Goal

On **createthegarden.com** and **thegarden.thecreative.exchange**, the site wears The Garden's brand. Every other host (thecreative.exchange, previews, localhost) stays TheCreative.exchange. Accounts are the same everywhere; only the chrome changes.

## The brand (Claude Design, "Garden Brand", Turns 5–7)

- **Mark:** a clean single-stroke G.
- **Badge:** a crimson disc with the G cut out (transparent).
- **Crimson:**
  - `#D93A4B` on dark, `#A51C30` on paper.
  - For the mark only, never text: it's about 4.2:1 on ink.
- **Wordmark:** "The Garden" in Jost Medium 500, tracking −1%, never all caps.
- **Lockup:** the disc is 1.25× the font size, and the gap is ¼ of the disc.
- **Motion:** a sprout grows, curls into the G, and the disc swells in.
- **Files:** the kit is in `app/public/brand/garden/`: favicons, Apple and Android icons, the social avatar and the manifest.
- **The G is a draft.** When the member artist delivers the final G, change `GARDEN_G_PATH` (`app/app/brand/GardenMark.tsx`) and the files in `public/brand/garden/`.

## How the brand is chosen

| Layer | File | What it does on a Garden domain |
|---|---|---|
| Registry | `app/app/brand/brandConfig.ts` | Hosts, colors, icon paths. Its host list must match `hostOrgs.domains` for `the-garden` in Convex. |
| Edge | `app/functions/_middleware.ts` + `app/app/brand/gardenHtml.ts` | Sets `<html data-brand="garden">`. Puts The Garden in the title and share text, and shares the disc picture (square card). Adds the manifest, theme color `#121212` and Jost. Serves The Garden's icon files at the usual addresses: `/favicon.svg`, `/favicon.ico`, `/apple-touch-icon.png` and so on. Other hosts pass straight through. `public/_routes.json` keeps static files from running it. |
| Before paint | `BRAND_BOOT` in `root.tsx` | Same `data-brand`, manifest, color and font, for whatever the edge didn't do. `?brand=garden` works only on localhost and `*.pages.dev`. |
| CSS | `app.css` | `.brand-garden` / `.brand-exchange`, for prerendered pages that carry both. |
| React | `useBrand()` | `exchange` during hydration, then the real brand. Never read the hostname during render (React #418). |
| Tab title | `BrandTitle.tsx` | "… TheCreative.exchange" reads "… The Garden"; "The Garden — The Garden" collapses to "The Garden". |

Icon links are never rewritten, because React owns them. A changed href makes React put the original back next to it. The edge answers the same addresses with The Garden's files instead.

## What shows where (Garden domains only)

- **Desktop top-left (desk):**
  - The lockup (disc 20 + Jost 16) replaces "THE GARDEN · YOUR DESK".
  - The greeting or the view's title says where you are; a Shortlist crumb still follows.
  - No animation.
- **Phone Today:** the lockup on the left, the date on the right. The heading "Today" is kept for screen readers.
- **Public header:** the lockup only, disc 25 + Jost 20 (disc 20 + Jost 16 on phones). Labelled "The Garden home".
- **Community page `/communities/the-garden`:**
  - A lockup with disc 40 + Jost 32, and the host-tools tagline in Jost 20.
  - Signed out: a citron "Join The Garden" button (to `/signup`, which asks for an invite code or offers the waitlist), with "Sign in" as a link.
  - The grow animation plays here only, at most once a day on a device, and never with reduced motion.
- **Login:** the lockup, "Sign in to The Garden" and "Same account as TheCreative.exchange." It uses the on-paper lockup in the light theme.
- **Signup:** the lockup in the header link.
- **Invite share sheet:** "Join me in The Garden" (the link already uses the page's own domain).

## UX review (2026-10-03): what changed

- **Adopted:**
  - no desk animation
  - drop "· YOUR DESK"
  - phone Today fixed
  - a Join button for strangers
  - the same-account line on login
  - the light-theme lockup
  - theme color `#121212`
  - manifest `start_url` `/today`
  - `?brand=` limited to previews
  - the tagline cut from the header
  - animation at most once a day
- **Not adopted (Rick's call):** showing the lockup to Garden members on thecreative.exchange as well. The reviewer's point: members are signed in there, so on domain-only most never see it. Rick asked for domain-only.
  - Flipping it is one line: `gardenMark` in `DeskHeader.tsx`, `useGardenHome` in `communities.$slug.tsx`.

## Open

**Decisions (Rick):**

- **D1.** createthegarden.com is the one Garden home, and thegarden.thecreative.exchange 301s to it. Also retire thegardensd.org (named in `communityDomains.ts`).
- **D2.** `createthegarden.com/` shows The Garden's page, not the Exchange home. The Join button and the `/?invite=` handoff are needed first.
- **D3.** The Garden page's canonical moves to createthegarden.com, after D1.
- **D4.** Google sign-in finishes on the Garden domain. Blocks announcing the domain.

**Backend (needs a prod deploy):**

1. OAuth return allowlist: Convex Auth `callbacks.redirect` plus an absolute `redirectTo` (D4).
2. Garden email links use the Garden domain. Today they use `SITE_URL`, where Garden-domain members are signed out.
3. Sign-in code texts say "The Garden" when sent from a Garden domain (`convex/auth.ts`, `convex/phoneLink.ts`).
4. `setCommunityDomains` for `the-garden` in prod.

**Setup (Rick):**

- Add both domains as Custom Domains on the Pages project.

**Known leftovers:**

- **Prerendered `/for/*` and `/showcase` text** still says TheCreative.exchange in the body. Only the head and the logo change.
- **The home page title** reads "The Garden — Create better together…" until D2.
- **React re-adds the original `og:title` and `description` meta beside the edge's after hydration.** That's harmless: crawlers read the raw HTML.
- **There is no 1200×630 Garden share image yet.** The square disc is used.
- **Testing the edge locally:** `wrangler pages dev` from `app/` serves static files before Functions, because `wrangler.toml` has a Workers `[assets]` block. To test the edge, run it from a folder without that file. Production Pages runs `_middleware` in front of static files.
