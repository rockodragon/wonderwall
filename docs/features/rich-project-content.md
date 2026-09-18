# Rich project content

Project pages and project updates carry formatted text, images and video, not
just a paragraph and a link.

Two surfaces, one content model:

- **The project page** — `projects.body`, the full description a visitor reads
  after clicking into a project. The existing `blurb` stays exactly what it
  was: the one-line summary on cards, browse grids and search results.
- **Updates** — `storyUpdates.bodyDoc`, posts on a project as the work
  happens. These already existed as plain text on `/story/:slug` with no way
  to write one; they now have a composer on `/projects/:id` and render on
  both pages.

## 1. The content model

Content is a **typed array of blocks**, defined once in
[`convex/garden/richText.ts`](../../app/convex/garden/richText.ts) and
re-exported to the client through `app/app/lib/richText.ts` — the same
single-source-of-truth shim `app/app/garden/capabilities.ts` uses.

| Block | Holds |
|---|---|
| `heading` | text, `level` 2 or 3 (h1 is the page's own title) |
| `text` | a paragraph run; blank lines inside it are paragraph breaks |
| `quote` | a pulled-out line |
| `list` | items, `ordered` for numbers instead of bullets |
| `image` | an uploaded file (`storageId`) or a URL, plus `alt` and `caption` |
| `video` | an uploaded file or a YouTube/Vimeo link, plus `caption` |
| `divider` | a rule |

Inside `heading`, `text`, `quote` and list items, three inline marks are
available: `**bold**`, `*italic*` and `[label](url)`. They are tokenized by
`parseInline` into a flat token list; the renderer maps those to
`<strong>`/`<em>`/`<a>`. Marks do not nest, and none of them can run across a
line break.

### Why blocks, and not HTML or Markdown

Stored HTML would mean running a sanitizer on every read, forever, and one
missed attribute is a stored-XSS hole on a page strangers visit. Stored
Markdown would mean shipping a parser's whole surface — raw HTML passthrough,
reference links, autolinks — to get four features, and it still has no way to
express "this is a YouTube embed".

With a closed union of block types, nothing arbitrary can be *stored*, so
nothing arbitrary can be *rendered*. The safety property holds at rest.
[`RichContent.tsx`](../../app/app/components/RichContent.tsx) is a switch over
the union with no `dangerouslySetInnerHTML` anywhere in it, and a block type
it doesn't recognise is skipped rather than guessed at.

### Limits and normalization

`normalizeRichDoc` runs on every write. It trims each block, drops the empty
ones, clamps over-long text, and removes leading, trailing and doubled
dividers. It refuses the save outright for the three things worth refusing
over: more than 120 blocks, more than 60,000 characters of text, or a media
URL that isn't `http(s)`. `normalizeBlocks` is the non-throwing half, which is
what the editor's Preview and its "is this empty?" check use, so the preview
is what actually saves.

## 2. The project page

`projects.body` is optional and additive — a project written before this
existed has a blurb and no body, which is a perfectly good project page.
`updateProject` takes `body`; passing `[]` clears it (an omitted field means
"leave it alone").

The owner edits it in place on `/projects/:id`. Saving writes the whole
document at once rather than per block: a project page is composed and then
published, and autosaving half-written blocks onto a public page would be
worse than a Save button.

`/story/:slug` renders the same body under the blurb.

## 3. Updates

`postStoryUpdate` is still **project-owner only** — the rule
`assertStoryOwner` has always enforced. `editStoryUpdate` and
`deleteStoryUpdate` belong to whoever wrote the row, and an edit stamps
`editedAt` so the timeline says "edited" rather than changing silently under
people who already read it.

Each row stores both `bodyDoc` (the rich version) and `body` (its plain-text
rendering). `body` stays a real column, not something derived on read, because
notifications, excerpts and every row written before `bodyDoc` existed read it
directly. A photo-only update is valid and its plain text is legitimately
empty — emptiness is asked of the document, not the string.

Posting fans out to the author's followers through the existing
`notifyFollowers` path (see [following.md](following.md)), fire-and-forget: a
notification failure never rolls back the post. This is separate from the
**Message team and supporters** announcement composer, which is a deliberate
broadcast with its own audience resolution and delivery tracking.

## 4. Uploads

Images and video upload to Convex file storage through the existing
`api.files.generateUploadUrl`. Blocks store the `storageId`; read paths call
`resolveRichDocMedia`, which attaches the resolved URL to each media block —
the same shape `getProject` already used for artifact media, so the renderer
never makes a second round trip per image.

Caps are enforced client-side at 12MB for images and 64MB for video. Convex
takes larger files, but a project page that streams a 200MB upload to every
visitor is a bad page, and the video block accepts a YouTube or Vimeo link,
which is the better answer for anything longer.

When a save replaces a document, files the old version referenced and the new
one doesn't are deleted (`orphanedStorageIds`), best-effort — an author who
swaps a photo five times while writing shouldn't leave five files behind. A
file deleted out from under a document resolves to `null` and its block
renders as nothing rather than a broken-image icon.

Pasted video links go through the existing
[`videoEmbed.ts`](../../app/app/lib/videoEmbed.ts) resolver: YouTube and Vimeo
embed, everything else fails closed to a link-out button, for the reason that
file already documents — Zoom and Meet send `frame-ancestors` headers that
make an `<iframe>` render an empty box with no visible failure.

## 5. The editor

[`RichTextEditor.tsx`](../../app/app/components/RichTextEditor.tsx) edits the
block array directly — what an author arranges is literally the stored
document, with no conversion step to keep in sync.

Inline marks are written into plain `<textarea>`s by a format bar that wraps
the author's selection, so nobody types a marker by hand. That is a deliberate
trade against a contenteditable WYSIWYG: textareas give native undo, native
spellcheck, native mobile keyboards and native accessibility for free, and the
document can never come to hold markup — which is what keeps the renderer a
switch instead of a sanitizer.

## 6. Not built

- **Drag-to-reorder.** Blocks move with ↑/↓ buttons, which work on touch and
  with a keyboard. Drag would need a pointer-events layer and a keyboard
  fallback anyway.
- **Team members posting updates.** Still owner-only. `projectMembers` with
  `status: "accepted"` is the obvious audience to widen to, and
  `assertStoryOwner` is the one place that would change.
- **Rich content on events, offerings and profiles.** The editor and renderer
  take a block array and nothing project-specific; adopting them elsewhere is
  a schema field and two call sites.
- **Draft/publish for the project page.** Saving publishes.
