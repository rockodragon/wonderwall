# Media route: serving stored files from our own domain

Stored files (pictures, and audio and video) used to load from Convex's domain
(`courteous-rabbit-750.convex.cloud/api/storage/<key>`), where none of our
protections reach. `app/functions/media/[id].ts` serves the same file at
`thecreative.exchange/media/<key>`:

- AI training crawlers get the 403 from `functions/_middleware.ts`, as pages do.
- Every file carries `X-Robots-Tag: noai, noimageai` and `tdm-reservation: 1`.
- Files are cached at Cloudflare's edge for a day, so Convex serves a popular
  picture about once a day per data centre instead of once a view.
- Range requests (video and audio seeking) pass straight through, uncached.

`convex/images.ts` `servedFileUrl` swaps Convex's address for ours only while
the Convex environment variable `MEDIA_BASE_URL` is set. Unset, every address
is exactly what it was. That variable is the on/off switch.

## Turning it on

1. Merge and deploy the site. `/media/<key>` is live but nothing points at it yet.
2. Pick a real file key (any stored picture's URL, the part after `/api/storage/`) and check:
   - `curl -sI https://thecreative.exchange/media/<key>` → `200`, the right
     `content-type`, `cache-control: public, max-age=86400`, `x-robots-tag: noai, noimageai`.
   - The same request again shows `cf-cache-status: HIT` or comes back faster.
   - `curl -sI -A "GPTBot/1.2" https://thecreative.exchange/media/<key>` → `403`.
3. `npx convex env set MEDIA_BASE_URL https://thecreative.exchange/media/ --prod`
4. Open a project with pictures, a profile, an event gallery and a project
   update, on thecreative.exchange and on the Garden domain. Pictures load from
   `thecreative.exchange/media/...` (check one in the browser's network tab).

## Turning it off

`npx convex env remove MEDIA_BASE_URL --prod`. Pages go back to Convex's
addresses on their next load; nothing else changes.

## Things to know

- **Deleted files** stop resolving at Convex at once and fall out of every
  cache within a day.
- **Requests count.** Every `/media` view runs the function, cached or not.
  Check the Cloudflare plan's daily request allowance against expected
  picture views before a big push.
- **Addresses already saved in the database** (link-preview stills, a piece's
  cover saved at creation) keep Convex's address. New ones get ours.
- **Left to move:** the two wondering-image lookups in `convex/profiles.ts`
  (moved once the public-profile branch merges, to avoid a conflict) and the
  one-off `convex/garden/tablesMigration.ts`.
