# Instagram import: before you delete, bring your work home

Spec, 2026-10-25. Owner: Rick. Status: **not built**. To be announced on stage at the Nov 6 Showcase (Lightchurch, Encinitas). Every "today" statement describes the code on `claude/safe-home-security` at `bacccf4`, checked 2026-10-25. Every "verified" statement about Meta's export was checked the same day against public write-ups and open-source importers (sources at the end), not against a fresh export. Day one of the build requests a real export and corrects this file where it's wrong.

**Plain version.** A person asks Meta for their own Instagram download. When the ZIP arrives they open it here, on their phone, and pick the posts they want. Their browser reads the file; only the pictures they picked, with the caption and the date, come to us. Each becomes a piece in their Portfolio with its own page. Nothing points back to Instagram, and nothing we do depends on Meta.

## 1 · Why

- **Meta used public accounts as AI reference by default.** Meta announced Muse Image on Tue 2026-07-07 with an Instagram "account reference" feature: every adult public account was enrolled, no notice. It pulled that feature on Fri 2026-07-10 after SAG-AFTRA and CAA objected; the model itself stayed. Verified (ANI, Music Business Worldwide, DIY Photography). Artists are asking how to leave. The sources confirm the backlash and the default-on design, not a count of people deleting or going private, so **no number goes on stage.**
- **What exists today is an embed, not a copy.** Pasting an Instagram link (docs/features/creator-media-cross-post.md) plays the post in Instagram's player and copies a still for the card. `artifacts.mediaUrl` points at instagram.com. The day the account goes private or is deleted, the player shows "post unavailable" and the piece is a dark tile. For someone leaving Instagram, the paste is the wrong tool.
- **The ground is already prepared.** As of `bacccf4`, every image upload loses its GPS location before it leaves the browser (`app/lib/imageLocation.ts`), and AI training crawlers get a 403, `noai`/`noimageai` and the EU `tdm-reservation` header. "Your work here is not training data" is true today, which is what makes the pitch honest.
- **No Meta API, on purpose.** The Basic Display API (personal accounts) shut down December 2024. The Instagram API with Instagram Login needs a professional account, a Meta app, App Review and business verification, which waits on the entity question (docs/entity-structure-research.md), and it hands back expiring CDN URLs, not files. Meta's own "Download your information" is the person exercising their data-portability right; it gives real files, and it needs nothing from us or from Meta.

## 2 · Who and when: the event

The download is not instant. Sources put Meta's email anywhere from 5–30 minutes to 24 hours, occasionally days; the download link lasts about four days; a large account arrives as several ZIP parts (verified: safeunfollow.app, redact.dev). So the honest shape of Nov 6 is **request tonight, bring it home this week.**

| Moment | What happens |
|---|---|
| On stage, one slide | The one-line promise (§8) and a QR code. Rick does the five taps in Accounts Center on his own phone, projected, and taps Create files. |
| QR | `thecreative.exchange/bring-your-work-home?invite=<code>`. Public and prerendered, outside the `_app` layout like `/showcase`. The `?invite=` code rides through signup (`lib/carriedInvite.ts`), because the community new accounts join is invite-only (2026-10-02) and the room is full of people without one. |
| The page | The promise, the five steps with a screenshot each, "Request it tonight. When Meta's email comes, open this page again." A "Send me the steps" email box: writes the existing waitlist row (`waitlist.addToWaitlist`, source `instagram-import`) and sends one Resend email with the steps and the link. The email is the one thing we can't afford to lose (convex/showcase.ts). |
| Live demo | A real import, on a phone, projected: an export Rick (or a performer who agreed) requested the day before, ten pieces picked, Portfolio and one story page shown. Real pieces, real account, under a minute. |
| Saturday | One follow-up email to everyone who asked for the steps: "Your download is probably ready. Here's where to bring it." |
| What the night can't do | Import for the audience from the stage. Say so. |

## 3 · What the person does

1. **Request.** Instagram → profile → menu → Settings and privacy → Accounts Center → Your information and permissions → Download your information → Download or transfer information. Pick the Instagram profile only. "Some of your information" → Posts (under Your Instagram activity) if the chooser offers it, else everything; we read posts and nothing else either way. Download to device. Date range **All time**. Format **JSON**. Media quality **High**. Create files. (Menu names verified against 2025–26 guides; confirm on a phone before the slide is made.)
2. **Wait.** Meta emails. The link opens Accounts Center; the ZIP downloads. On iPhone it lands in Files.
3. **Open** `thecreative.exchange/import/instagram`, signed in. Pick the ZIP. Several parts: pick them all.
4. **Pick.** The browser reads the file and shows a grid of posts, newest first: picture, month and year, a carousel count. Already-imported posts are greyed "Here already". Video posts are greyed "Video comes later." Tap to pick up to 30. "Latest 30" picks for them.
5. **Review.** Each pick with its title (the caption's first line) and "First posted March 2023". One line: "Each piece gets its own page and shows in your Portfolio. Only bring work that's yours to show." Button: **Bring them home**.
6. **Done.** "12 pieces are home." Links: your Portfolio, the first story page. **Bring more** reopens the same file with the imported ones greyed.

## 4 · What we build

### 4.1 Reading the export, in the browser

The export layout, as verified. The first build checks it against a real export and fixes this table.

| What | Where / shape | Source |
|---|---|---|
| Posts index | `your_instagram_activity/media/posts_1.json` (2025–26), `your_instagram_activity/content/posts_1.json` (2023–24). Large accounts split into `posts_2.json`… **Find by file name anywhere in the ZIP; never hard-code the folder.** | gist (JoeGermuska 2026), Pixelfed importer |
| A post | `{ media: [...], title?, creation_timestamp? }`. **Single image: caption and timestamp sit on `media[0]`, not on the post.** Carousel (2–20 items): caption and timestamp on the post; items may carry their own `title`. | gist, Pixelfed `ImportPostController.php` |
| A media item | `{ uri, creation_timestamp, title, media_metadata, cross_post_source?, backup_uri? }`. `uri` is a path from the ZIP root (`media/posts/YYYYMM/<file>.jpg`); use it verbatim. `creation_timestamp` is Unix seconds, UTC. | gist, Pixelfed |
| Location in JSON | `media_metadata.photo_metadata.exif_data[0].latitude/longitude` (and `video_metadata.exif_data`), present on some items. **Dropped: never parsed past "exists", never sent.** | gist (afonsofrancof), exiftool forum |
| Text encoding | Meta writes each UTF-8 byte as its own `\u00XX` escape, so "é" arrives as `Ã©` and every emoji is four Latin-1 characters. Fix per string: if every code point ≤ 0xFF, map code points to bytes and decode with `TextDecoder("utf-8", { fatal: true })`; on failure keep the original. | krvtz.net, Meta exports generally |
| `posts.json` (no number) | A newer file using Meta's `label_values` schema, one media item per post and timestamps that are often a 2015 migration date. **Ignored.** | gist |
| Reels, stories | `reels.json` (`ig_reels_media`), `stories.json` (`ig_stories`) beside the posts file. Not read in v1 (§6). Shape to confirm against the real export. | unverified |
| Files | JPEG mostly, some WebP on newer exports, MP4 for video. Instagram never stores HEIC. | guides; confirm |
| Archive | Can exceed 4 GB (ZIP64) and can come as several parts. | redact.dev, Kaludii README |
| HTML format | Same media folders, HTML pages instead of JSON. v1 says "Request it again as JSON" with the steps. Phase 2 falls back to the media folders alone: pictures, month from the folder name, no captions. | guides |

**Library.** `fflate@0.4.9` is in the lockfile only as posthog-js's dependency; it isn't ours to import and is four years old. Add **`@zip.js/zip.js`**: ZIP64, reads a `File` through `BlobReader` so a multi-GB archive is never loaded whole, inflates only the entries asked for, runs in its own Web Worker. fflate 0.8 (8 kB, streaming `Unzip` with a filter, "files up to 4 GB", no ZIP64) is the fallback if bundle size wins; the import route is a lazy chunk either way.

**Module split.**
- `app/app/lib/instagramExport.ts`, pure and unit-tested: `findPostFiles(paths)`, `parsePosts(json)` → `ExportPost[]`, `decodeMetaText(s)`, `splitCaption(caption)` → `{ title?, body?, hashtags }`, `postKey(post)`.
- `app/app/lib/zipSource.ts`: the zip.js wrapper behind a tiny interface (`list()`, `read(path)`), so the parser is tested with JSON fixtures and the ZIP code is tested with the fixture archive (§10). A folder picked with `webkitdirectory` (Safari on Mac auto-unzips downloads) implements the same interface.
- A Worker does the listing, parsing and hashing. Thumbnails come from `createImageBitmap(blob, { resizeWidth: 360 })`, one at a time; chosen files are inflated one at a time, hashed with `crypto.subtle.digest("SHA-256")`, then handed to `uploadToStorage(generateUploadUrl, blob)` (`app/lib/uploadFile.ts`), which strips the location. The drift guard forbids any other upload path.

### 4.2 Mapping

| Export | Ours |
|---|---|
| One post, one image | One `artifacts` row, `type: "image"`, `mediaStorageId`, plus its companion passion project, as every shared piece today. |
| Carousel | One piece: the first image is the piece (`mediaStorageId`, the card). The companion project's `body` carries every image as an `image` block (`storageId`, `alt`), in order, so the story page shows the whole set. `RICH_LIMITS.blocks` is 120; Instagram's carousel cap is 20. |
| Caption | `splitCaption`: the first line, hashtags and bare mentions removed, trimmed at 80 chars on a word boundary → `title` (artifact and project). Fewer than two letters left → no title; the project falls back to "Untitled image" as today (`deriveProjectTitle`), and the slug base becomes `photo-2023-03`. The rest of the caption, hashtag-only lines dropped, `#` removed from inline tags, @mentions left as plain text, never linked → project `blurb` (clamped 500 chars) and the full cleaned caption → `artifacts.content`. |
| `creation_timestamp` | `artifacts.sourcePostedAt` (ms). `createdAt` stays "when it arrived here". Shown as "First posted on Instagram, March 2023" on `/story/:slug` and `/works/:id`. Pieces in one run get `order` values in chronological order after the existing max, so the Portfolio reads like their grid. |
| Alt text | The export carries none. `alt` = the title when there is one, else empty. We never invent a description. |
| Hashtags | Dropped in v1. Phase 2: match against `INTERESTS` (`#photography` → Photography) for the project's `interests`. |
| `media_metadata` | Dropped. |
| Provenance | `artifacts.source: "instagram"`, `artifacts.sourceHash` (SHA-256 of the piece's first file). No `mediaUrl`: nothing points at instagram.com. |

**The companion-project decision.** Today `artifacts.create` makes one passion project and one public story slug per piece. The cross-post spec left open whether a bulk import should. Decision: **keep one project per piece**, with guard rails, because the public page per piece *is* the promise, the Portfolio is a view of completed projects (project-ia.md) and one tile for thirty pieces would hide the work. The guard rails: 30 pieces a run, hand-picked; a carousel is one project, not ten; `origin: "portfolio"` keeps them off `/projects` and `/opportunities` (`isPostedProject`) exactly as a quick share is today; no follower fan-out (`artifacts.create` has none); **no embeddings** (`embedArtifact` is one OpenAI call per piece and these captions are mostly hashtags; a backfill can add them later); no preview fetch (there is no link). Rejected: pieces without projects (no public page, and V1's model is that every piece is a project) and one project per import (hides the work).

### 4.3 Server: `convex/instagramImport.ts`

- **Extract, don't copy.** Pull the body of `artifacts.create` after validation into `insertPiece(ctx, { userId, profile, type, title, content, mediaStorageId, order, createdAt, sourcePostedAt?, source?, sourceHash?, body? })` in `convex/artifacts.ts`, returning `{ artifactId, projectId }`. `artifacts.create` becomes a thin wrapper around it. The import is the second caller. Writing the insert twice is the drift the 2026-10-10 rule forbids.
- **`importPieces` mutation.** Args: `pieces: [{ mediaStorageIds: Id<"_storage">[] (1–20), title?, content?, blurb?, sourcePostedAt, sourceHash }]`, at most 10 per call (one slug lookup per piece, and mutations get one second of user code). `requireUserId` → `requireProfile`. For every storage id: `ctx.db.system.get(id)` must exist, `contentType` must start with `image/`, `size` ≤ 12 MB (the composer's cap), and the file's own `sha256` is what gets stored as `sourceHash` (the client's hash is only for greying out). A hash already on this profile is skipped, not refused. Returns `{ created, skipped, artifactIds }`. Refusals are `fail(code, reason)`: `too_many` "Up to 10 pieces at a time.", `invalid_input` "That file isn't a picture we can show." A failing piece fails its call; the client retries that call once, then shows which pieces didn't make it.
- **`alreadyImported` query.** `{ hashes: string[] }` → the subset already on the signed-in profile. Signed out: `[]`.
- **Schema** (additive, no migration): `artifacts.source?: string`, `artifacts.sourceHash?: string`, `artifacts.sourcePostedAt?: number`; index `by_profileId_sourceHash`.
- **Reads.** `getStoryPage` and `artifacts.get` return `firstPostedAt` from the piece. Two pages show the line. Nothing else changes.

### 4.4 UI

- **Route** `/import/instagram` in the `_app` layout (signed in; a signed-out visitor goes through `setPendingIntent` and comes back). Phone-first: a 3-column grid at 16 px gutters, a sticky bottom bar "Bring 12 home". Desktop is the same page, wider.
- **Entry points.** The public landing page's button. A card on the Canvas (phone and desktop) from Nov 1 to Dec 6: "Bring your Instagram work home." A button in Settings → Pieces. A row in the palette's Profile stack.
- **Copy** (PRODUCT.md: half the words, no money words): "Pick a file" · "Reading your download… nothing leaves your phone" · "Pick the posts to bring" · "Bring them home" · "12 pieces are home."
- **Analytics.** `instagram_import_started`, `instagram_import_parsed { posts, carousels, videos, parts }`, `instagram_import_completed { picked, created, skipped, seconds }`. Counts only: no captions, no file names.

## 5 · Privacy and safety

- **What never leaves the device:** the ZIP, the JSON, messages, contacts, followers, ad interests, login history, the location fields, the posts not picked, file names. The Worker reads the archive; the page sends exactly: the picked image bytes (location already removed), the title and caption text we derived, the timestamp, and a hash.
- **Two layers against location.** `media_metadata` is dropped at parse time, and `uploadToStorage` runs every file through `imageLocation.ts` (EXIF GPS emptied, XMP coordinates blanked). Secondary sources say Instagram strips GPS on upload, so exported files are probably clean already; we don't rely on that.
- **No Meta anything.** No API, no token, no Meta script on the page, no `mediaUrl` on the piece. Stored files are served from our storage. AI training crawlers are already refused (`app/lib/aiCrawlers.ts`, `_headers`).
- **The archive is untrusted input.** Caps: at most 50,000 entries listed, a posts file at most 64 MB, a picked file at most 12 MB; a `uri` must resolve to an entry inside the archive (no `..`, no absolute paths); type is sniffed from the first bytes, not the extension (Pixelfed does the same). Parsing runs in a Worker; a bad file fails the import, never the page.
- **Rights.** One line at Review: "Only bring work that's yours to show." The Terms already cover posting what you don't own. No new checkbox.
- **Same exposure as every upload today:** Convex storage URLs are open links, which is why the location strip exists.

## 6 · Limits and costs

| Limit | v1 | Why |
|---|---|---|
| Pieces per run | 30, hand-picked, repeatable | Enough for a Portfolio; keeps one run under a minute on a phone. Pixelfed caps at 100 a session for the same reason. |
| Images per carousel | 20 (Instagram's own cap) | A body block per image. |
| Per image | 12 MB | `CreateWorkComposer`'s cap. Export JPEGs are 100–600 KB at 1080 px. |
| Per mutation call | 10 pieces | §4.3. |
| Video | **Not in v1.** Phase 2: 5 a run, 64 MB each (the composer's cap), from `reels.json` and video posts. | Egress is the real cost (below), and there's no poster-frame or transcoding path. |

**Cost (Convex limits page, 2026-10-25, third-party pricing pages agree):** file storage 1 GB included on Starter then $0.033/GB-month, 100 GB included on Professional then $0.03; egress 1 GB on Starter then $0.132/GB, 50 GB on Professional then $0.12. A 30-piece image import is about 15 MB: storage is noise ($0.0005 a month on Pro); 1,000 members doing it is 15 GB, inside Pro's allowance, 15× over Starter's. Egress is the number to watch: a Portfolio of 30 full-size pieces is about 12 MB a page view because pieces are served full-size (no card-size copies exist), so 1,000 views are 12 GB, $1.44 on Pro. Video is 20–50× that per view: one 20 MB reel seen 500 times is 10 GB. Hence images first. **Which Convex plan production is on is an open question (§11); it decides whether this is a rounding error or a line item.**

## 7 · Edge cases

- **HTML export.** No posts JSON found but `media/posts/` exists: "This download is in HTML. Request it again as JSON" with the steps. Phase 2 imports the pictures anyway, dated from the folder.
- **Several parts.** The posts file is in one part, the pictures in others. The grid shows a piece whose file isn't loaded as "In another file"; "Add another file" adds a part. Part names look alike; we match by the `uri` path, not the part.
- **A post with no file in any loaded part** can't be picked.
- **Only `posts.json`, no `posts_1.json`.** Treat as unsupported with the same "request again" message; log the shape in analytics (`parsed.shape`) so we learn it exists.
- **Mojibake that won't decode** (a genuine Latin-1 string): keep the original. Hashtag-only caption: no title, blurb empty. Emoji-only first line: next line with letters is tried; else no title.
- **Duplicate.** Same hash on this profile: greyed, skipped. A piece the person deleted is gone from the table, so it can be brought back.
- **Half an import.** Chunks of 10 are saved as they land; a closed tab leaves whole pieces, never halves. Re-opening greys them out. A file uploaded whose mutation then failed is an orphan file; the client retries the chunk once, and Phase 2 adds a sweep for storage ids no row points at.
- **Mixed carousel** (images and a video): the images come; the piece says "1 video skipped".
- **Timestamp 0 or missing** (seen on old posts): `sourcePostedAt` unset, no "First posted" line, `order` by position in the file.
- **Big grids** (2,000 posts): render by month, newest first, 60 at a time.
- **Safari on Mac auto-unzips.** Accept a folder; say so under the picker.
- **Low memory on a phone.** One inflate at a time, thumbnails at 360 px, object URLs revoked as they scroll out. Tested on an older iPhone before Nov 6.
- **Cross-posted from Facebook** (`cross_post_source`): no difference.
- **Signed out at the QR.** Lands on the public page; "Open the import" goes through signup with the carried invite, then back.

## 8 · What we announce on Nov 6

The line: **"Download your Instagram, pick the posts that matter, and they live here on pages you own. Only what you pick leaves your phone."**

Then, out loud: "Photos tonight. Video comes next." Both have to be true on the night: the import route live in production, images only, the location strip on, the landing page and QR tested on an iPhone and an Android camera app, and one real import done in rehearsal. Nothing about numbers of artists leaving, nothing about Meta's intentions, no "free" or any other word from `CLAIMS` this feature doesn't need.

## 9 · Build plan

One strong developer with AI. Start Mon 2026-10-27; rehearsal Tue 2026-11-04.

| Phase | Days | What ships |
|---|---|---|
| **0 · Landing** (first) | 1 | `/bring-your-work-home`: steps, screenshots, "Send me the steps" (waitlist row + Resend), QR asset for the slide, Saturday email copy. Requests Rick's own export on day one so a real file arrives in time. |
| **1a · Parser** | 1.5 | `instagramExport.ts` + tests; fixture ZIP (§10); zip.js wrapper in a Worker; verified against the real export, table in §4.1 corrected. |
| **1b · Server** | 1 | `insertPiece` extraction; `importPieces`, `alreadyImported`; schema fields and index; "First posted" on story and work pages; handler tests on the in-memory ctx; drift-guard limits unchanged. |
| **1c · UI** | 1.5 | Route, grid, picker, review, progress, done; Canvas card, Settings button, palette row; analytics; phone layout. |
| **1d · Rehearsal** | 1 | Two real exports on two phones over LTE, one import live on the projector setup, fixes. |
| **Before Nov 6** | **6** | |
| **2 · Video** | 3 | `reels.json` and video posts, 5 a run, 64 MB cap, poster frame from the first frame in-browser, the cost gate. |
| **2 · Fallbacks** | 2 | HTML export (pictures only), orphan-file sweep, hashtags → interests, "Bring more" reminder email a week after a first import. |
| **3 · Card-size copies** | 2 | A 720 px copy per piece for grids, the egress lever. Decide once the public portfolio ships. |
| **3 · Public portfolio** | — | `thecreative.exchange/@handle` (cross-post spec, growth play 4) is a separate spec. Imported pieces are ordinary pieces, so they appear there with no extra work. |

Risk: the same developer is on the other Nov 6 items (guest backing, the per-performer QR). Phase 0 alone makes the announcement honest ("request tonight"); Phase 1 makes the demo real.

## 10 · Test plan

- **Unit, parser** (`instagramExport.test.ts`): single image (caption and date on `media[0]`); carousel (on the post); `posts_1`/`posts_2` found under `media/` and under `content/`; `posts.json` ignored; `decodeMetaText` on "é", "ñ", a 4-byte emoji, an already-clean string, and a genuine Latin-1 string that must not change; `splitCaption` on a plain line, a hashtag wall, hashtags inline, an @mention, an emoji-only first line, an 80-char cut on a word; a `uri` with `..` refused; `media_metadata` with coordinates present in input and absent from output.
- **Unit, server** (`instagramImport.test.ts` on `test-support/convexContext.ts`, the `drift.work.test.ts` shape): signed out refused with the shared refusal; no profile → `no_profile`; 11 pieces → `too_many`; a non-image storage id → `invalid_input`; duplicate hash skipped and counted; a carousel writes one artifact, one project, N−1 body image blocks; `origin: "portfolio"`, `stage: "completed"`, no `mediaUrl`; `order` chronological; `artifacts.create` still behaves (its existing tests pass against the wrapper).
- **Fixture ZIP** `app/test-support/fixtures/instagramExport/`: built by a committed script from synthetic JSON and tiny generated JPEGs (one with a GPS EXIF block, reusing `imageLocation.test.ts`'s builder) and one WebP. Contents: `your_instagram_activity/media/posts_1.json` with a single image, a 3-image carousel, a video post, a mojibake caption with an accent and an emoji, a hashtag-only caption, a post whose file is missing; `posts.json` in the new schema; `connections/followers_and_following/followers_1.json` and `your_instagram_activity/messages/inbox/x/message_1.json` as decoys that must never be read; a second ZIP part holding one of the carousel's images. No real person, no real caption. Under 300 KB.
- **Browser** (Playwright, the phone fixture's pattern): load the fixture at 390 px, pick three pieces, Bring them home; assert exactly three uploads and one `importPieces` call; assert no request body contains `messages`, `followers`, `latitude` or the JSON; assert the intercepted upload bytes carry no GPS block (`stripLocation` returns false on them).
- **Drift guard** passes with every limit unchanged: one `generateUploadUrl` call site, zero inline profile lookups, zero hand-read errors.
- **Real exports.** Rick's, requested on day one; a performer's; both on iPhone and Android, over LTE, before rehearsal. Correct §4.1 from them.
- **Live checks** (the cross-post lesson: anything near routing gets checked in production): the public page's SPA fallback, the QR on both camera apps, the carried invite through signup.

## 11 · Open questions

1. **Which Convex plan is production on?** Starter's 1 GB of storage is about 70 imports. Needs an answer before Phase 1c, not after Nov 6.
2. **A quieter option?** Every imported piece gets a public story page. Offer "keep these off public pages for now" (no companion project, loose piece in the Portfolio only), or trust the pick? This spec says trust the pick for v1.
3. **The invite code on the QR.** One code for the room, or per-performer codes (the Nov 6 QR work already in flight)? Whoever owns `wonderwall-2fti` decides.
4. **Embeddings for imported pieces: never, or a later backfill?** This spec says later backfill, by hand.
5. **Alt text.** Ask for one line per piece at Review (slower) or leave it to the editor (most will stay empty)? v1 leaves it.
6. **Terms.** Does legal want a sentence about imported work, or does the existing "you own what you post" cover it?
7. **Removing an imported piece** leaves its companion project and story page behind (pre-existing, §12). Fix before Nov 6, or accept and fix after?
8. **The name.** "Bring your work home" is the pitch; is "Import" the right word in Settings, or "Bring from Instagram"?

## 12 · Known pre-existing issues touched here, not fixed

- `artifacts.remove` deletes the files and the row but not the companion project, so the story page outlives the piece. Imports make this more visible.
- Settings → Pieces (`settings.tsx` ~2060) still caps uploads at 5 MB with `alert()`s, older than the composer's 12 MB.
- `/works/:id` and `/profile/:id` need sign-in; a piece's only public face is `/story/:slug` until the `@handle` portfolio lands.
- `routes.ts` cites `docs/marketing/showcase-open-call.md`, which is not in the repo.

## 13 · File map

| File | Change |
|---|---|
| `app/package.json` | `@zip.js/zip.js` |
| `app/app/lib/instagramExport.ts`, `.test.ts` | Pure parser, caption split, Meta text decode |
| `app/app/lib/zipSource.ts`, `instagramImport.worker.ts` | zip.js behind an interface; folder source; the Worker |
| `app/app/routes/import.instagram.tsx` | The import page (lazy chunk) |
| `app/app/routes/bring-your-work-home.tsx`, `routes.ts` | Public landing, outside `_app` |
| `app/convex/instagramImport.ts`, `.test.ts` | `importPieces`, `alreadyImported` |
| `app/convex/artifacts.ts` | `insertPiece` extracted; `create` wraps it |
| `app/convex/schema.ts` | `artifacts.source`, `sourceHash`, `sourcePostedAt`; `by_profileId_sourceHash` |
| `app/convex/garden/stories.ts`, `app/convex/artifacts.ts` (`get`) | `firstPostedAt` |
| `app/app/routes/story.$slug.tsx`, `work.tsx` | "First posted on Instagram, March 2023" |
| `app/app/routes/today.tsx`, `settings.tsx`, `app/app/desk/paletteConfig.tsx` | Entry points |
| `app/convex/waitlist.ts`, `emails.ts` | "Send me the steps" |
| `app/test-support/fixtures/instagramExport/` | Fixture ZIPs and the script that builds them |
| `app/e2e/instagram-import.spec.ts` | The browser test |

## Sources checked 2026-10-25

- Export shape: [JoeGermuska gist on `posts_1.json` vs `posts.json`](https://gist.github.com/JoeGermuska/5e0f91b6bee8fb2ee943b141214b9582) · [Pixelfed `ImportPostController.php`](https://github.com/pixelfed/pixelfed/blob/dev/app/Http/Controllers/ImportPostController.php) · [afonsofrancof gist, `photo_metadata.exif_data` coordinates](https://gist.github.com/afonsofrancof/6fcc469e9070dae10ff93561c7b35621) · [thefedi.wiki, Pixelfed import](https://thefedi.wiki/pixelfed/user/importing-from-instagram)
- Encoding: [krvtz.net, how Facebook got Unicode wrong](https://krvtz.net/en/posts/how-facebook-got-unicode-wrong.html)
- Requesting and delivery: [redact.dev](https://redact.dev/blog/instagram-data-file-download) · [safeunfollow.app](https://safeunfollow.app/docs/instagram-export) · [Measure Protocol steps](https://help.measureprotocol.com/support/solutions/articles/80001127112-instagram-data-file-retro-instructions) · [Instagram Help: download a copy of your information](https://help.instagram.com/181231772500920)
- Muse Image: [ANI, 2026-07-11](https://aninews.in/news/business/meta-withdraws-instagram-account-reference-feature-from-muse-image-after-user-feedback20260711125338/) · [Music Business Worldwide](https://www.musicbusinessworldwide.com/meta-scraps-ai-muse-image-feature-that-scraped-instagram-accounts-following-caa-backlash/) · [DIY Photography](https://www.diyphotography.net/meta-shuts-down-ai-training-muse-image-after-backlash/)
- Costs and limits: [Convex limits](https://docs.convex.dev/production/state/limits) · [budgetforge Convex pricing 2026](https://www.budgetforge.dev/tools/convex-pricing-2026)
- Libraries: [zip.js](https://github.com/gildas-lormeau/zip.js) · [fflate](https://github.com/101arrowz/fflate)
