# Updates

Status: building on branch `desk-updates` (2026-10-01).

## What it is

Updates are short cards written by admins. They show on a member's desk (and at the top of Today on a phone) until that person has read them, then they archive themselves for that person and don't come back.

Uses (Rick, 2026-10-01):
- **Onboarding.** "Welcome. Here's what this is and how to use it."
- **News.** "Why we're streaming Oct 6, and what it is."
- **Anything worth a member's attention this week.**

Admins can also **send one now**: it lands in each member's notifications and inbox, to bring them back to the desk.

Rick's decisions:
- Only admins write Updates for now. Community hosts come later.
- Version one sends right away. A "What's new" digest email comes later.
- On screen they're called **Updates**.

## Why not just notifications

- A notification is one row per person, written the moment it's sent. Someone who joins next week never gets it, and new members are exactly who need onboarding.
- Read notifications are deleted after 30 days and unread ones after 90 (`notificationRetention.ts`).
- Notifications have no archive state and no button.

Updates are stored once with an audience rule, and each person's state is recorded lazily. Notifications and email are only the pipe that pulls people back.

## The record

`updates`, one row per Update:

| Field | Rules |
|---|---|
| `title` | Required, at most 80 characters. |
| `body` | Required plain text, at most 600 characters. |
| `imageStorageId` | Optional picture (Convex storage). |
| `actionLabel` / `actionUrl` | Optional and set together. The label is at most 24 characters. The URL is an in-app path (`/events/…`) or an `https://` link. |
| `audience` | `"everyone"`, `"community"` or `"new"`. |
| `hostOrgId` | Required when the audience is `"community"`. Members are the active `communityMembers` of that `hostOrgs` row. |
| `newForDays` | For `"new"`: accounts younger than this many days. Defaults to 14. |
| `startsAt` / `endsAt` | Shown from `startsAt`. `endsAt` is optional; with none set, it shows until archived. |
| `order` | Lower comes first. |
| `status` | `"draft"`, `"published"` or `"archived"`. Only published Updates inside their dates ever show. |
| `sentAt` / `sentCount` | Set once by **Send it now**. An Update can only be sent once. |
| `createdBy` / `createdAt` / `updatedAt` | Bookkeeping. |

`updateReads` holds one row per person per Update, created on first touch:
- `openedAt`: they opened the card. This counts as "seen".
- `clickedAt`: they pressed its button.
- `archivedAt`: it's done for them and never shows again.

## Rules

- **Who sees it.** A signed-in person sees a published Update when all of these hold:
  - it's inside its dates
  - they're in its audience
  - they haven't archived it
- **Audience "new".** Measured from the account's `users._creationTime`.
- **Archiving.**
  - Opening a card records `openedAt`.
  - Closing an opened card archives it. Reading it is what "seen" means, and seen ones don't come back.
  - Pressing the button records `clickedAt` and archives it.
  - On a phone, "Got it" archives it.
- **Send it now**:
  - Admin only, once per Update, published Updates only.
  - Each person in the audience at that moment gets one in-app notification (type `"update"`, `linkUrl` `/today?card=update:<id>`) and one email.
  - Email goes through `scheduleNotificationEmail` with `category: "announcements"`, so the existing opt-out and unsubscribe apply.
  - It is sent in scheduled batches of 50, the same as announcement delivery.
- **Starter drafts.** "Add starter drafts" on the admin page creates the four drafts below if they're missing (matched by title), as drafts. Rick reviews and publishes them.

## Backend contract (`convex/updates.ts`)

Viewer:
- `listMine()` returns `UpdateCard[]`: the Updates this person should see, sorted by `order` then newest `startsAt`. It returns `[]` when signed out. `UpdateCard` is `{ _id, title, body, imageUrl: string | null, actionLabel: string | null, actionUrl: string | null }`.
- `open({ updateId })`, `click({ updateId })` and `archive({ updateId })` upsert the person's `updateReads` row. They need sign-in, and are idempotent.

Admin (`requireAdmin`):
- `adminList()` returns every Update with its fields, plus stats:
  - `opened`, `clicked` and `archived` counts
  - `audienceNow`: how many people match today
  - `imageUrl`
- `save({ updateId?, title, body, imageStorageId?, actionLabel?, actionUrl?, audience, hostOrgId?, newForDays?, startsAt, endsAt?, order })` creates or edits an Update. It validates every rule in the table above, and new Updates start as drafts.
- `setStatus({ updateId, status })` changes the status.
- `audienceCount({ audience, hostOrgId?, newForDays? })` returns the count shown in the editor.
- `generateImageUploadUrl()` returns an upload URL for the picture.
- `sendNow({ updateId })` returns `{ recipients }`. It refuses if the Update was already sent or isn't published, and schedules delivery with an internal batch mutation.
- `addStarterDrafts()` returns `{ added }`.

## Where it shows

- **Desk (desktop, /today).**
  - Updates are cards of a new kind, `update`, with card id `update:<id>`. They come first on home (at most 2 in the scatter) and first in the Today view (all of them).
  - Face: a mono `UPDATE` kicker, the title, and the picture when there is one. Without a picture, the card is dark with the kicker in the accent color.
  - Opened card: the body in full and the button (accent). Closing it archives it.
- **Today on a phone.** The current Updates sit stacked at the top, each showing its title, body, button and "Got it".
- **Admin, /admin/updates.** Linked from /admin. It lists every Update with:
  - its status
  - its audience
  - its dates
  - opened / clicked / archived counts, against the audience size

  Each Update can be edited, published, or archived from the list. The editor previews the card and shows the audience count. "Send it now" shows a confirm with the count. "Add starter drafts" creates the drafts below.

**Past Updates in Messages.** `listPastMine()` returns the Updates a person archived, plus published ones whose dates have ended. Each comes with `archivedAt` and `endsAt`, newest first. It never includes drafts.
- Audience is judged by time. An Update a member read while they were new stays in their list after they stop being new.
- An Update that ended before they joined is left out.

The inbox shows these under an "Updates" heading, below the conversations. Tapping a row opens the full body.

## Starter drafts (copy)

1. **Welcome**
   - Body: CLAIMS.whatItIs, then CLAIMS.theGarden, verbatim.
   - Button: "Meet people" → `/today?view=people`.
   - Audience: everyone. Order 1.
2. **Your tools are in the corner**
   - Body: "On a computer, everything is behind the yellow button in the lower left. Hover it. Each tool sorts your desk, and its menu takes you where you want to go."
   - Audience: everyone. Order 2.
3. **Add a photo and a few lines**
   - Body: "People say yes to a face. Add yours and say what you make."
   - Button: "Edit my profile" → `/settings`.
   - Audience: new members, first 14 days. Order 3.
4. **Oct 6: What is this and why?**
   - Body: "The first Creator Notes, online. What TheCreative.exchange is, why it exists, and what happens next."
   - Button: "See the event" → that event's page, found by title if it exists, otherwise `/events`.
   - Audience: everyone. Order 4. Ends the day after the event.

## Later

- A "What's new" digest email, daily or weekly, sent from the bulk `updates.` subdomain.
- Community hosts writing Updates for their own community.
- "Done when" conditions, such as hiding "Add a photo" once there is one.
