# Covers in 4:5

Status: built on branch `covers-4x5` (2026-10-03).

## What changes

Event and project covers become portrait 4:5, the Instagram feed shape (1080 × 1350). Creatives already make their flyers and posts in this shape (Rick, 2026-10-01: "2 great").

- **On upload we frame the picture.** When someone picks a cover that isn't already 4:5, a small framer opens:
  - **Fill** (the default) shows the picture filling a 4:5 frame. They drag it into place and zoom. We save that crop.
  - **Whole** keeps the entire picture, for flyers with type near the edges. We save the picture as it is, and every page shows it whole in a 4:5 frame over a blurred copy of itself (`ImageFill`).
- **Pictures that are already 4:5** (within 3%) skip the framer.
- **Either way we save a smaller copy.** It's a JPEG at quality 0.86: 1080 × 1350 for Fill, and at most 2160 px on the long side for Whole. Phone photos of 5–12 MB become a few hundred KB, so pages load faster. Because the saved file is small, the pick limit rises from 5 MB to 20 MB.
- **Old covers aren't touched.** A wide cover already saved shows whole in the 4:5 frame (`ImageFill`), never cropped.
- **The hint** under each cover picker reads: "Portrait 4:5 works best (1080 × 1350)."

## Shared pieces

- `app/app/components/CoverFrame.tsx`, `CoverFrame({ src, alt, className?, children? })`: a `relative aspect-[4/5] overflow-hidden` box that shows `src` with `ImageFill`. `children` sit on top (chips, buttons). Every cover display uses it.
- `app/app/lib/uploadFile.ts`, `uploadToStorage(generateUploadUrl, blob)`: returns a storage id. It is the one upload path for covers.
- `app/app/lib/coverCrop.ts`: the framer's geometry as pure, tested functions.
  - `COVER_ASPECT = 4 / 5`
  - `isCoverShape(w, h)`: within 3% of 4:5
  - `cropRect({ w, h, zoom, x, y })`: returns the source rectangle `{ sx, sy, sw, sh }` for a 4:5 crop. `zoom` is at least 1, where 1 means the crop just covers the shorter side. `x` and `y` run from 0 to 1 and position the crop across the slack.
  - `wholeSize(w, h, maxLong)`
- `app/app/lib/useCoverPick.tsx`, `useCoverPick(onReady: (blob: Blob) => Promise<void> | void)`. It returns:
  - `pick(file)` checks the file:
    - It must be `image/*`, at most 20 MB, and decodable.
    - A 4:5 file is encoded straight away.
    - Any other shape opens the framer.
  - `picker`: a ReactNode to render once.
  - `error`: a string or null.
  - `busy`: true while preparing.
  - A file that can't be decoded (HEIC on Chrome) sets the error "This picture can't be read here. Try a JPG or PNG."
- `app/app/components/CoverPicker.tsx` is the framer dialog:
  - a 4:5 frame, up to `min(80vw, 360px)` wide
  - drag to move, a zoom slider, and the arrow keys to nudge
  - two choices, "Fill" and "Whole"
  - two buttons, "Use this" and "Cancel"; Escape cancels
  - Copy is short: the title is "Cover", and "Drag to frame it." shows only in Fill.

## Where covers show (all 4:5 through `CoverFrame`)

- **Event page.** A 4:5 cover is a poster:
  - On a phone it's full width (capped at about 70vh), with the title below.
  - From md up it's a two-column header: the poster on the left (`w-80`), the title, meta and actions on the right.
- **Wide covers on the event page.** A cover wider than 6:5 (an old landscape one, or a flyer kept whole) keeps the full-width banner above the title, shown whole. Rick's earlier complaint was a wide banner looking tiny; a wide picture in a 320px portrait frame would bring that back.
  - The page measures the picture in the browser (`lib/useImageAspect.ts`, `isWideCover`). Until it loads, it counts as a poster.
  - No picture keeps the gradient band.
- **Project page.** The hero follows the same rules: a poster beside the title (`w-72`), or a wide picture as a 16:9 banner, shown whole. The kind chip, money chip and "Change image" stay on the picture. "Add image" stays as it is when there's no cover.
- **Cards.** `EventCard` (/events, search, orgs, favorites), `ProjectCard` (/projects), the public /garden/events list, and Today on a phone (`FeaturedProject`, `ProjectRow`) all go from 16:10, 16:9 or 4:3 to 4:5.
- **Left as they are:**
  - **The desk.** Its cards are about 3:4, close enough. A 4:5 picture loses about 6% at the edges, and wide ones are already framed.
  - **Small thumbs.** The 44 px shortlist and 48 px profile thumbs.
  - **Gallery squares.**
  - **Link previews.** Event links now use the small card: the cover as a thumbnail beside the title (`functions/events/[id].ts`). The large card cropped a portrait to a wide strip through the middle.
    - X, Slack and Discord follow this.
    - iMessage, Facebook and WhatsApp choose for themselves and may still crop.
    - A preview image made for each event (the poster whole on a blurred background) would fix those too, as a later pass.

## Fixed along the way

- An uploaded project photo (`photoStorageId`) didn't show on `/opportunities`, the `/projects` index or a story page. They read only the external `photoUrl`. `convex/garden/projectsPublic.ts` (`shapeProjectCard`'s caller) and `convex/garden/stories.ts` (`getStoryPage`) now resolve the stored photo first. **Backend change: deploy it with the merge.**

## Checked (2026-10-03)

- **The framer**, on a throwaway page with sample pictures:
  - Fill saves 1080 × 1350 and matches the frame.
  - Whole saves the picture uncut.
  - A 4:5 picture skips the framer.
  - Escape cancels, and focus starts in the dialog.
- **A bug found while checking.** `img.decode()` never settles while the page is hidden, which can happen while a phone's photo picker is open. The hook loads with `onload` instead.
- **The event page on prod data, signed out:**
  - wide flyer → banner on desktop and phone
  - poster layout, with the rule forced
- **Cards:** /garden/events and /projects.
- **Signed in, on a throwaway local backend** with a test account and seeded data:
  - **Project page:** Add image, then the framer, then the poster beside the title (desktop) and full width (phone). The saved file is 1080 × 1350.
  - **Today on a phone:** the featured project as a 4:5 poster.
  - **/opportunities** shows the uploaded photo (the backend fix).
  - **Host an event:** the framer opens above the form, the 4:5 preview shows on step 2, and the created event shows the poster beside the title.
  - **Event Setup tab:** Whole with a wide picture saves it uncut, and the page switches to the banner.
