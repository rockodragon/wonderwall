# Cross-posting a reel: make it once, paste it once

Proposal, 2026-09-22. Owner: Rick. Status: **not built**. Every "today" statement below was checked against the code on 2026-09-22; every "verified" statement was checked against the live Instagram and TikTok endpoints the same day.

## What this covers

Creatives make short video for Instagram and TikTok first. That is where their audience is and where the editing happens. The Exchange should take that same piece with no second upload, no second edit and no second caption. The example that prompted this is an Instagram reel (`instagram.com/reel/DdSHmHWSDFn/?stkn=…`): vertical video, a caption, a creator, and a share link with a tracking token on the end.

The recommendation is one sentence: **paste the link, we do the rest.** Everything else here is what "the rest" means, in three tiers that each stand on their own, and then the growth plays that ride on it.

## The decision, in one table

| Tier | The creative does | We do | Needs | Effort |
|---|---|---|---|---|
| **1 · Paste** | Copies the reel link from Instagram or TikTok, pastes it in the composer | Recognise it, play it inline, make a card for it, put it on their story page | No API key, no review, no new dependency | About a day |
| **2 · Share sheet** | Taps Share in the Instagram or TikTok app, picks creatives.exchange | Land them in the composer with the link filled in | A web manifest and a ten-line service worker (Android); an Apple Shortcut (iOS) | Half a day |
| **3 · Connect** | Connects their Instagram or TikTok account once | Import their recent posts, keep importing new ones | Meta and TikTok developer apps, app review, business verification | One to two weeks, mostly waiting |

Ship 1, then 2. Start the paperwork for 3 now because the review queue is the long pole, and because the same Meta app unlocks real Instagram thumbnails for Tier 1.

### What we are not doing, and why

- **Downloading the video file.** Breaks both platforms' terms, costs storage and bandwidth, and moves the view off the creative's own channel. Embedding keeps the view on Instagram or TikTok, where it still counts for them.
- **Publishing from the Exchange out to Instagram and TikTok.** Both content-publishing APIs exist, but they need heavier review, and creatives already have the native tools and will not switch. The Exchange is the destination, not the scheduler.
- **A second caption.** The reel's own caption is enough. Tier 1 asks for one optional line of title on Instagram only because Instagram gives a server nothing to read (see below).

## What exists today

The pieces are mostly there. What is missing is that each surface recognises YouTube on its own and nothing recognises Instagram or TikTok.

- **The composer** (`app/app/components/CreateWorkComposer.tsx`) already takes a pasted link. A link needs a title; a YouTube or Vimeo link is auto-detected and saved as type `video`. The onboarding "Share your first work" step (`routes/onboarding.tsx`) uses the same mutation.
- **The write** (`convex/artifacts.ts`, `create`) stores the `artifacts` row, creates the companion passion project with a public story slug, and schedules `fetchOgImage`, a 15-second scrape of the page for an `og:image`.
- **The player** (`app/app/lib/videoEmbed.ts`, `toEmbedUrl`) turns a watch link into an iframe URL for exactly two hosts, YouTube and Vimeo, with an allowlist of hosts and an id character class. `RichContent.tsx` uses it for video blocks on project pages and updates. Anything else falls closed to a "Watch on host" link.
- **Four more YouTube detectors**, each its own regex: the work detail page (`routes/work.tsx`), the works grid (`routes/works.tsx`), the profile page (`routes/profile.tsx`) and the composer's auto-detect. The server has a fifth (`artifacts.create` skips the scrape for YouTube and Vimeo).
- **Headers** (`app/public/_headers`) send `X-Frame-Options: DENY`, which stops others framing us and has no bearing on us framing Instagram or TikTok. There is no Content-Security-Policy, so nothing blocks the embeds.

### What happens when a creative pastes a reel today

Verified 2026-09-22 against the example reel.

- Pasted as a **link**: the scrape gets a 200 and 632 KB of HTML with zero `og:image` tags. Instagram serves its app shell to a server, not the page. So the card falls back to the gradient "link" tile and the detail page shows an "Open Link" button. The creative's work is a grey box.
- Pasted as a **video**: `work.tsx` and `works.tsx` render `<video src="https://www.instagram.com/reel/…">`, which is a page, not a video file. Nothing plays and nothing says why.
- TikTok is the same on the card, but TikTok has a public oEmbed endpoint that returns the title, the creator's name and a portrait thumbnail with no key (verified: `https://www.tiktok.com/oembed?url=…`). The thumbnail URL carries an `x-expires` about three days out, so it has to be copied, not linked.
- Both platforms' embed players answered 200 from the server (`instagram.com/reel/{code}/embed/captioned/`, `tiktok.com/player/v1/{id}`, `tiktok.com/embed/v2/{id}`). Instagram's response is the same JavaScript shell as the page, so the rendered player was not confirmed from a datacenter IP. It is the URL Instagram's own `embed.js` injects, so it is expected to work in a browser, and the first build should confirm it on a phone before anything else.

## Tier 1 · Paste

### One resolver, six call sites

Extend `toEmbedUrl` in `videoEmbed.ts` rather than adding a sixth detector. Every surface that asks "is this a video link, and how do I show it?" calls the one function. The next provider is one branch, not six.

The return type grows two fields:

```ts
export type EmbedKind = "youtube" | "vimeo" | "instagram" | "tiktok";
export interface VideoEmbed {
  kind: EmbedKind;
  embedUrl: string;
  aspect: "16/9" | "9/16";   // reels and TikToks are portrait
  canonicalUrl: string;      // the link with share tokens stripped
}
```

Providers, in the style the file already uses (exact host match after dropping `www.`, id matched against a character class, everything else returns null):

| Provider | Accepts | Id class | Embed URL |
|---|---|---|---|
| Instagram | `instagram.com/reel/{code}`, `/p/{code}`, `/tv/{code}`, and the newer `instagram.com/{username}/reel/{code}` share form; hosts `instagram.com`, `m.instagram.com` | `[A-Za-z0-9_-]{5,20}` | `https://www.instagram.com/reel/{code}/embed/captioned/` (`/p/` for posts). The captioned variant shows the creative's own caption, so nobody retypes it. |
| TikTok | `tiktok.com/@{user}/video/{id}`; hosts `tiktok.com`, `m.tiktok.com` | `[0-9]{15,22}` | `https://www.tiktok.com/player/v1/{id}` (the documented player; `embed/v2/{id}` is the fallback) |
| YouTube | add `youtube.com/shorts/{id}`, which today falls through to a link-out. Creatives who make reels make Shorts. | existing | existing |

Query strings are dropped the way `&t=90s` already is on YouTube: `?stkn=`, `?igsh=` and `?utm_source=ig_web_copy_link` are share tokens, not identity. `canonicalUrl` is what gets stored, so two people pasting the same reel store the same string.

Short links (`vm.tiktok.com/{code}`, `tiktok.com/t/{code}`) redirect, and a browser cannot follow them cross-origin. The server action below follows the redirect and stores the destination.

Tests go in `videoEmbed.test.ts` beside the existing ones: each accepted form, the share-token forms, the username-prefixed Instagram form, `instagram.com.evil.example`, a `javascript:` URL, and the Shorts form.

### The composer

- **Auto-detect.** A pasted Instagram or TikTok link becomes type `video`, exactly as YouTube does now. The placeholder reads "Paste a link from Instagram, TikTok, YouTube or Vimeo…".
- **Title.** Optional for a video today; keep it so. For TikTok the server fills a blank title from oEmbed. For Instagram there is no metadata a server can read, so the composer asks for one line with the prompt "One line about this piece (it shows on your page and in search)". This is the only typing the tier asks for, and it is optional.
- **Cover.** The composer already supports an uploaded image plus a link (the work page shows the image with a link badge). Label it "Add a cover (optional)" for video links. It is the Instagram fallback until Tier 3's Meta app unlocks real thumbnails.
- **Analytics.** `work_created` already carries `work_type` and `auto_detected_video`; add `provider`.

### The write

`artifacts.create` stores `canonicalUrl` in `mediaUrl` and, for Instagram and TikTok, schedules a new action `enrichMediaLink` instead of `fetchOgImage` (which burns 15 seconds on Instagram for nothing).

- **TikTok:** call oEmbed; patch a blank `title` with the post title; fetch the thumbnail and copy it into Convex storage with `ctx.storage.store`, because the CDN URL expires.
- **Instagram:** do nothing until Tier 3. The player carries its own image; only the grid card lacks one.
- **Short links:** follow the redirect, store the destination as `mediaUrl`.

One additive schema field on `artifacts`: `coverStorageId: v.optional(v.id("_storage"))`, resolved on read the way `mediaStorageId` is. Every reader prefers cover, then `ogImageUrl`, then a provider tile. No migration; old rows have none.

### The surfaces

- **Detail page** (`work.tsx`) and **video blocks** (`RichContent.tsx`): a portrait frame for `9/16` kinds, max width about 420px, centred, `loading="lazy"`, the same `allow` and `referrerPolicy` the YouTube frame uses. Instagram's player renders its own "post unavailable" state for a private account, which is the right failure: visible, and the creative's to fix.
- **Cards** (`works.tsx` bento, `profile.tsx`, project thumbnails): portrait kinds take `row-span-2`. TikTok shows the copied thumbnail with a play glyph. Instagram shows the cover if one was added, else a dark portrait tile with the Instagram glyph, the title and the word "Reel". Not a grey gradient.
- **Story page** (`routes/story.$slug.tsx`, line 410): the hero today is `project.photoUrl` only, so a reel's companion project has no hero. When the project's first artifact resolves to an embed, the embed is the hero. This is the page the creative will put in their bio, so it has to open on the work.
- **Project page** (`routes/projects.$id.tsx`, line 169): the thumbnail picker already reads the first attached media; extend it to prefer the cover.

Then delete the four page-level YouTube regexes and the composer's `includes("youtube.com")` check in favour of the resolver. That is the clean-up that makes this elegant rather than a fifth special case.

## Tier 2 · From the share sheet

The paste is still a paste. This tier removes the copy.

- **A `/share` route** inside the `_app` layout: reads `url`, `text` and `title` from the query string, opens the composer expanded with the link filled. Instagram and TikTok hand the link inside `text` ("Check out this reel: https://…"), so the route pulls the first URL out of `text` when `url` is empty. A signed-out visitor goes through `setPendingIntent` (`app/app/lib/pendingIntent.ts`, already used by the story page) and comes back to the same composer after login.
- **Android:** a web app manifest at `app/public/manifest.webmanifest` with `share_target: { action: "/share", method: "GET", params: { url: "url", text: "text", title: "title" } }`, a `<link rel="manifest">` in `root.tsx`, and a minimal service worker, which installability requires. The icons exist (`icon-192.png`, `icon-512.png`). Once installed, "creatives.exchange" appears in the Instagram and TikTok share sheets.
- **iOS:** Safari has no Web Share Target. Ship an Apple Shortcut ("Post to creatives.exchange") that takes a URL or text from the share sheet and opens `https://creatives.exchange/share?text=…`. It takes five minutes to build, and the iCloud link goes in Settings and in onboarding step 3. No code.
- **Verify the SPA fallback** on `/share` in production immediately, per the lesson in `functions/events/[id].ts`: anything near routing gets checked live.

## Tier 3 · Connect and import

This is the "import your whole grid in thirty seconds" onboarding, and the only way to get Instagram thumbnails without the creative uploading a cover. It is gated by review on both sides.

- **Instagram:** the Instagram API with Instagram Login. Scope `instagram_business_basic`; `GET /me/media` returns `permalink`, `media_type`, `thumbnail_url`, `caption` and `timestamp`. Professional (creator or business) accounts only; the Basic Display API for personal accounts shut down in December 2024. Switching an account to creator is free and most working creatives already have, so the onboarding copy says so. Needs a Meta app, App Review, and business verification, which means the legal entity question (`docs/entity-structure-research.md`) has to be settled first. The same app can request oEmbed Read, which gives Tier 1 real Instagram thumbnails.
- **TikTok:** Login Kit plus the Display API, scopes `user.info.basic` and `video.list`. Needs a TikTok for Developers app and review; a sandbox is available first.
- **Product shape, open:** an imported batch should not create one passion project and story slug per post the way `artifacts.create` does for a single share, or a thirty-post import floods `/works` and mints thirty story pages. Decide between "imported items are artifacts without companion projects" and "one project per import, many media". Decide also whether new posts keep flowing in automatically (with a hide control) or wait for a tap.

## Growth plays in the same vein

The principle is the same throughout: reduce what a creative has to do to be seen here, and borrow the audience they already have. Ordered by what to do first.

| # | Play | What it does for growth | Needs | Effort |
|---|---|---|---|---|
| 1 | **Share previews that work** (bead `wonderwall-vqq`) | A creatives.exchange link in an Instagram bio or a text thread unfurls with the work, the title and the name. Today story, project and profile pages unfurl as the site shell. The pattern is built for events in `functions/events/[id].ts`; copy it for `/story/:slug`, `/projects/:id` and `/profile/:id`. Prerequisite for every play below. | Three Pages Functions | A day |
| 2 | **Tier 1 · Paste** | The reel plays here, on a page with Follow, Back and a story. | Above | A day |
| 3 | **Post here, then share back** | After a post, offer a ready 9:16 story card (cover or thumbnail, title, name, QR to the story page) via `navigator.share` with a file. The creative posts it to their Instagram Story with a link sticker and their followers land here. Same QR pattern as the Nov 6 stage (bead `wonderwall-ke37`). | Client-side canvas; no server | One to two days |
| 4 | **The profile as the link in the bio** | A short public URL (`creatives.exchange/@name`) that opens on their latest reels with Follow, Back and Hire. Replaces Linktree, and gives every creative a reason to point their bio at us. | A vanity slug on `profiles`, `/profile` added to the public-path list in `routes/_app.tsx` | Two days |
| 5 | **Tier 2 · Share sheet** | One tap from the Instagram or TikTok app. | Manifest, service worker, Shortcut | Half a day |
| 6 | **Nov 6 reel wall** | Every performer pastes their reel; the event page shows a wall with Back under each; the QR on stage lands there. Also the run-up content: one performer's reel a day on the Exchange's own Instagram, tagging them. | Tier 1 plus one event-page section | Half a day |
| 7 | **"Made in San Diego this week"** | A weekly Resend email with five reels. Each featured creative gets a "you were featured" note with a share button, and reposts. Density over reach, per the outreach playbook. | Resend is wired; curation by likes or by hand | A day, then weekly |
| 8 | **Credits on reels** (V1 PRD §8, not built) | Reels are collaborative: editor, DP, musician, dancer. Tagging invites them, and they post their own cut. Already named the growth engine; the reel is the natural vehicle. | The `projectCredits` spec | Already specced |
| 9 | **Embeddable "Back me" card** | `<iframe src="creatives.exchange/embed/story/{slug}">` for Substack and personal sites: a backlink and a conversion surface on every page they own. | Lift `X-Frame-Options: DENY` for that one route in `_headers` | A day |
| 10 | **Tier 3 · Import your grid** | A full portfolio in thirty seconds at onboarding. | App review on both sides; start now | One to two weeks, mostly waiting |
| 11 | **Hashtag curation without an API** | Ask creatives to tag `#creativesexchange`; a weekly manual pass promotes the best to a Featured row on the home page, and the featured repost. | Nothing | Zero code |

## Open decisions

1. **Companion project per paste.** Today every share mints a passion project and story slug. Right for one reel, wrong for a thirty-post import. Decide before Tier 3; Tier 1 can keep today's behaviour.
2. **Instagram title.** Optional one line, or accept untitled reels and show "Reel" everywhere. This proposal says optional.
3. **Start the Meta app now.** Business verification needs entity documents. If the entity is months away, Instagram thumbnails stay on the "add a cover" fallback that long.
4. **The name in the share sheet.** "creatives.exchange" or "The Garden". This proposal says creatives.exchange, matching the docs index.

## File map for Tier 1

| File | Change |
|---|---|
| `app/app/lib/videoEmbed.ts` | Instagram, TikTok, YouTube Shorts; `aspect` and `canonicalUrl` |
| `app/app/lib/videoEmbed.test.ts` | Cases above |
| `app/convex/schema.ts` | `artifacts.coverStorageId` |
| `app/convex/artifacts.ts` | Store `canonicalUrl`; `enrichMediaLink` action; skip the scrape for the two hosts; resolve `coverStorageId` in the read queries |
| `app/app/components/CreateWorkComposer.tsx` | Auto-detect via the resolver; placeholder; optional title prompt; cover label; `provider` in analytics |
| `app/app/components/RichContent.tsx` | Portrait frame |
| `app/app/routes/work.tsx`, `works.tsx`, `profile.tsx` | Replace the local regexes with the resolver; portrait cards; provider tile |
| `app/app/routes/story.$slug.tsx` | Embed as hero when there is no photo |
| `app/app/routes/projects.$id.tsx` | Prefer the cover for the thumbnail |
