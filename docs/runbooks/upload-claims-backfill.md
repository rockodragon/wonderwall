# Upload claims: one-off audit and backfill

v0.1 · 2026-10-26 · owner: Rick · about 10 minutes · run from `app/`

Since #119, a stored file belongs to the person who first attached it (an
`uploadClaims` row, `convex/uploads.ts`). Files attached before #119 went out
have no claim. Two things are left over from before:

- **Unclaimed files.** Their owner can't attach them to anything new (a file
  older than a day, with no claim, is refused). Rows that already hold them
  keep working.
- **Rows holding someone else's file.** Before #119 anyone could attach any
  file to a row of their own. That row still holds it, and replacing or
  removing it there deletes the file for its real owner too.

`convex/uploadClaimsBackfill.ts` deals with both. It reads every place a
stored-file id is held (the `STORED_FILE_FIELDS` list), works out who owns
each row, then:

- claims each unclaimed file whose rows all have one owner;
- reports each file held by rows of **different** owners (a conflict), and
  changes nothing about it. You decide;
- reports files it can't pin on one person, and rows pointing at a file
  that's gone.

It is operator-only (an internal action, never callable from the site), reads
a page at a time and writes claims in small batches.

## Who owns a row

| Where the file is | Owner |
|---|---|
| profile picture | the profile's person |
| piece (media, cover), wondering | the person whose profile it's on |
| event cover, gallery, reel still | the organizer (co-hosts aren't counted) |
| project photo, reel still, body pictures | the project's person |
| story update pictures | the update's author |
| class photo | the teacher |
| Table photo | the Table's host |
| Update picture | the admin who created it |
| organization logo | its admin, when it has exactly one. Who set a logo isn't stored, so with several admins the logo is **unresolved** unless another row ties it to one of them (an admin's own avatar, say). Platform admins aren't counted |

Sharing the app does on purpose counts as one owner, not a conflict:

- a Table's dates wear the Table's photo: they count as the Table's;
- a date migrated from a class wears the class's photo: it counts as the class's;
- "Run it again" gives the new Table the old one's photo: it counts as the
  old Table's, even when a co-host ran it again.

## Run it

From `app/`. Dev first (`giant-wildebeest-814`), then prod.

1. Dry run. Changes nothing:

   ```sh
   npx convex run uploadClaimsBackfill:backfillUploadClaims '{}'          # dev
   npx convex run uploadClaimsBackfill:backfillUploadClaims '{}' --prod   # prod
   ```

2. Read the report (below). Nothing in it has to be settled before applying:
   conflicts and unresolved files are never claimed. **Do clear the conflicts
   soon after this deploys** (how: below). Until a conflict is cleared, the
   wrong row can still replace or remove the file, and most of those paths
   delete it for its owner too. Class photos are the exception: a class
   never deletes a photo someone else claimed.

3. Apply:

   ```sh
   npx convex run uploadClaimsBackfill:backfillUploadClaims '{"apply":true}' --prod
   ```

   `counts.claimed` should equal the dry run's `counts.claimable`, give or take
   files claimed or deleted in between.

4. Run the dry run again. `counts.claimable` is 0.

The dashboard works too: Functions → `uploadClaimsBackfill:backfillUploadClaims` → Run, with `{}` or `{"apply": true}`.

## Reading the report

```json
{
  "apply": false,
  "ranAt": 1793000000000,
  "rowsScanned": { "profiles": 80, "events": 41, "...": 0 },
  "counts": {
    "filesHeld": 212,
    "alreadyClaimed": 30,
    "claimable": 175,
    "claimed": 0,
    "conflicts": 1,
    "unresolved": 2,
    "missing": 4
  },
  "conflicts": [
    {
      "storageId": "kg2…",
      "createdAt": 1789000000000,
      "claimedBy": null,
      "holders": [
        { "table": "artifacts", "id": "j57…", "field": "mediaStorageId", "owners": ["k17…victim"] },
        { "table": "projects", "id": "jd7…", "field": "photoStorageId", "owners": ["k17…other"] }
      ]
    }
  ],
  "unresolved": [{ "storageId": "kg2…", "reason": "several people could have attached it (an organization's admins)", "holders": ["…"] }],
  "missing": [{ "storageId": "kg2…", "holders": ["…"] }],
  "truncated": false
}
```

- **counts**: `claimable` is what apply claims; `claimed` is what this run
  wrote (0 on a dry run).
- **conflicts**: one file, rows of different owners. `holders` lists every
  row holding it: table, row id, field and the owner(s). A holder with `via`
  wears another row's picture (a Table's photo, a class's photo). `createdAt`
  is when the file was uploaded. `claimedBy` is set when someone has claimed
  it since #119. Usually the oldest holder is the real owner. To settle one,
  open each row in the dashboard (Data → table → search by id). Clear the
  field on the row that shouldn't have it (set it to unset; don't delete the
  file). Then rerun. Clearing the field from the dashboard doesn't touch the
  file.
- **unresolved**: nobody could be pinned down. `reason` says why: a row with
  no owner on record (a Table with no host, a piece whose profile is gone),
  or an organization logo with several admins. These stay unclaimed. That's
  fine: the rows keep showing them; it only means nobody can attach that file
  to something new.
- **missing**: rows still pointing at a file that's gone (the hole #119 closed
  deleted some). Pages fall back to a blank or the pasted link. Nothing to
  claim; clear the field if the blank bothers anyone.
- **truncated**: each list shows its first 200. The counts are always whole.
  Settle what's shown and rerun.

## Safe to rerun

Yes, as often as you like. Each claim write checks again that nobody has
claimed the file and that it still exists. A file that's claimed is skipped.
Conflicts and unresolved files are only ever reported.

Backfilled claims carry `claimedAt` from the run: at or a few seconds after
the report's `ranAt`. To undo a run, delete the `uploadClaims` rows from that
window. A member's own upload claimed in the same seconds looks the same;
dropping its claim only means they can't attach that file to something new.
The rows holding it keep it.

## Adding a stored-file field later

Add it to `STORED_FILE_FIELDS` with its owner. `convex/uploadClaimsBackfill.test.ts`
fails when `schema.ts` has a `v.id("_storage")` or rich-text field the list
doesn't cover.

Not covered: picture *addresses*. A Table migrated from a class keeps the
class photo's URL in `photoUrl`, and some pieces keep a still's URL in
`ogImageUrl`. They hold no id, and nothing attaches by URL.
