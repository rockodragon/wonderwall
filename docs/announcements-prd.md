# Announcements Feature - Product Requirements Document

## Overview

Give the person who runs a Project, event, or offering a way to reach everyone tied to it at once. Two capabilities: a manual broadcast (the sender composes a message; everyone currently attached — supporters, RSVPs, signups — receives it), and an automatic reminder (system-sent, fires 24 hours before an event or offering session starts, no sender action required).

Announcements are one-way. Recipients see them in the existing in-app notifications feed and by email; they do not reply into a group thread. A recipient who wants to respond sends a normal 1:1 direct message to the sender through the existing messaging system (docs/messaging-feature-prd.md). This is a new primitive, not an extension of the `conversations`/`messages` tables — those stay exactly-two-participant DMs.

## Goals

1. **Close the organizer gap** - Today the only way to reach an audience is one DM at a time (capped at 5/day by the messaging rate limit)
2. **Reduce no-shows** - Automatic day-before reminders for events and offering sessions, with zero sender effort
3. **Reuse delivery rails** - Fan out through the existing `notifications` table and `emails.sendNotificationEmail` action; build no new delivery mechanism
4. **Stay one-way** - No group threads, no reply-all; replies route into existing 1:1 DMs

## Jobs to Be Done

### Job 1: Manual broadcast

- The Creative who owns a **Project** wants supporters to hear something — "New photos from the shoot are up," sent to everyone with a `projectSupport` row on that Project.
- An **event** organizer needs to tell attendees something before the day — "Venue moved to the side entrance" — sent to every `eventRsvps` row (including guests who RSVP'd with just name + email) and every accepted `eventApplications` applicant.
- The Creative who runs an **offering** (a class, coaching, a workshop) messages everyone signed up — "Bring a laptop this week" — sent to every `offeringSignups` row, `"pledged"` and `"confirmed"` alike.

In each case the sender sees the reachable-recipient count before sending, sends once, and is done. Account recipients get one in-app notification and one email; guest RSVPs get the email only.

### Job 2: Auto-reminder

- An event is tomorrow. Every RSVP gets "Reminder: {title} is tomorrow" without the organizer doing anything.
- An offering with a `startDate` set gets the same treatment for its signups.

The reminder must fire exactly once per (target, start time) no matter how many times the checking cron runs while the target is inside the reminder window.

## Features & Requirements

### 1. Recipient resolution

**One shared implementation**, not three: a single `resolveAudience(ctx, targetType, targetId)` in `convex/announcements.ts` returning `{ recipients: Array<{ userId?, email? }>, unreachable: number }`, with one `switch` over `targetType` inside it. It is called by the audience query, the broadcast mutation, and the reminder cron — three callers, one function. Nothing else in the feature reads the source tables directly.

| Target | Source rows | Reachability |
|--------|-------------|--------------|
| Project | `projectSupport` by `by_projectId` | `supporterUserId` set → in-app + email. Absent → **unreachable** (the table has no email field). Optional in schema, but `garden/support.ts:supportProject` is the only write path and it requires auth, so this is defensive, not an expected state |
| Event | `eventRsvps` by `by_eventId`, **plus** `eventApplications` by `by_eventId_status` with `status: "accepted"` | RSVP with `userId` → in-app + email. Guest RSVP (no `userId`) → **email only**, via `eventRsvps.email` (required field). Accepted applicant (`applicantId`, required) → in-app + email |
| Offering | `offeringSignups` by `by_offeringId`, status `"pledged"` or `"confirmed"` | `userId` is required on this table → always in-app + email |

Why events union two tables: both attendance paths are live and write against the **same** `events` table. `/events/:eventId` (`routes/event.tsx` → `events.apply`) creates `eventApplications`; `/garden/events/:id` (`routes/events_.garden.$id.tsx` → `garden.eventRsvps.rsvpToEvent`) creates `eventRsvps`. One event can hold both. Resolving only one table would silently drop half an audience.

Why offerings include `"pledged"`: `signUpForOffering` assigns `"confirmed"` only to free offerings and to paid ones with `externalPaymentLinkUrl` set. A paid offering with no external link can *only* ever produce `"pledged"` rows — there is no on-platform charge to confirm them. Excluding pledges would leave exactly those creators with an empty audience. The composer shows the split so the count isn't mistaken for paid attendance (see UX).

Dedupe rules:
- Account recipients dedupe by `userId` (an RSVP and an accepted application from the same user produce one recipient).
- Email dedupes by normalized address across all recipients of one announcement, so a guest RSVP and an account holder sharing an address get one email. Because delivery is batched across transactions this cannot be an in-memory pass: before scheduling, the batch checks `announcementRecipients.by_announcementId_email` for an existing row with that address and `emailQueuedAt` set, and skips if there is one. `eventRsvps.email` is already normalized on write; reuse `normalizeEmail` from `convex/garden/eventRsvps.ts` for addresses coming back from `getUserEmail`, which are not.
- The sender is excluded from their own audience (a Creative who supported their own Project doesn't get their own broadcast) — by `userId` and by normalized email.
- Anonymous supporters who hid their name (`projectSupport.visible: false`) but have a `supporterUserId` **are** included — they asked for public anonymity, not silence.

### 2. Manual broadcast

- Sender composes a plain-text body, max 2000 chars (same cap `messaging.ts` enforces on `messages.content`).
- Before send, the composer shows the resolved audience: "12 people will get this," and any unreachable count when one exists.
- Send is two-phase (see Fan-out below): the sender's mutation records the announcement and its recipient rows and returns counts; delivery runs in scheduled batches.
- Subject/title is derived, not composed: "Update on {target title}" in-app, "{sender name} — update on {target title}" as the email subject. The body is the message.
- Rate limit: 2 broadcasts per target per 24 hours. Enough for "one update and one correction," not enough for spam. Note this is per *target*, not per user as `messaging.ts` limits DMs (5/day/user) — a Creative running three offerings can send three separate audiences 2 each, which is intended: the limit protects each audience from repetition, not the sender from effort.
- Empty or whitespace-only bodies are rejected, reusing the `normalizeUpdateBody` trim convention from `garden/stories.ts`.

### 3. Auto-reminder

- Fires once per (target, start time), 24 hours ahead. Applies to published events (`events.datetime`) and active offerings that have `startDate` set.
- System-sent: `senderUserId` is absent on the announcement row; copy is fixed ("Reminder: {title} is tomorrow" / "Starts {formatted time}").
- The formatted time is rendered server-side in **America/Los_Angeles** via `Intl.DateTimeFormat`, with the zone abbreviation shown ("Starts Tue, Sep 2 at 6:00 PM PT"). There is no per-user timezone anywhere in the schema and the browser isn't in the loop for an email or a stored notification row — naming one zone is honest; "local time" would be a guess.
- Reminders do not count against the sender's broadcast rate limit — they aren't the sender's messages.
- Full trigger/idempotency logic in Technical Considerations below.

### 4. Reply routing

- No reply mechanism is built. The in-app notification carries `relatedUserId` (the sender) and `linkUrl` (the target's page); from either the sender's profile or the target page, the recipient uses the existing message affordance to open a normal 1:1 DM.
- The email body ends with a fixed line: "To reply, message {sender name} on The Exchange." with the CTA linking to the target page. System reminders carry no reply line.
- Guest recipients (email-only, no account) get no reply affordance — the email's CTA links to the public event page, which is all a guest can see anyway.

## Technical Considerations

### Convex Schema Additions

```typescript
// schema.ts additions

// One row per send (manual broadcast or system reminder). Cross-table
// target reference follows the `favorites` idiom (targetType + string id),
// tightened to a literal union — `favorites.targetType` is a bare v.string().
announcements: defineTable({
  targetType: v.union(
    v.literal("project"),
    v.literal("event"),
    v.literal("offering"),
  ),
  targetId: v.string(), // Id of the projects/events/offerings row
  senderUserId: v.optional(v.id("users")), // absent = system reminder
  kind: v.union(v.literal("broadcast"), v.literal("reminder")),
  // Reminder idempotency: "reminder24h:{targetType}:{targetId}:{startsAt}".
  // Absent on broadcasts. Uniqueness enforced in the mutation via
  // by_reminderKey lookup-before-insert (transactional in Convex).
  reminderKey: v.optional(v.string()),
  body: v.string(), // max 2000 chars (enforced in mutation)
  // Denormalized audit counts. recipientCount/unreachableCount are final at
  // send time; emailedCount starts at 0 and each delivery batch adds to it.
  recipientCount: v.number(), // rows in announcementRecipients
  emailedCount: v.number(), // unique addresses emails were scheduled for
  unreachableCount: v.number(), // resolved audience members with no channel
  createdAt: v.number(),
})
  // createdAt in the index so the rate-limit window check and the
  // newest-first history list are both index scans, not filters.
  .index("by_target_createdAt", ["targetType", "targetId", "createdAt"])
  .index("by_reminderKey", ["reminderKey"]),

// One row per resolved recipient of one announcement. Doubles as the
// delivery worklist: deliveredAt is absent until the batch job processes
// the row. Delivery fields record what was QUEUED, not what landed —
// emails.sendNotificationEmail is fire-and-forget (no Resend webhook in
// V1), so "delivered" would be a lie. Exactly one of userId/email may be
// absent, never both.
announcementRecipients: defineTable({
  announcementId: v.id("announcements"),
  userId: v.optional(v.id("users")), // absent for guest (email-only) recipients
  email: v.optional(v.string()), // normalized; set for guests at resolve time,
                                 // and for account recipients at delivery time
  notificationId: v.optional(v.id("notifications")), // absent for guests
  emailQueuedAt: v.optional(v.number()), // absent if no address on file
  deliveredAt: v.optional(v.number()), // absent = still pending
  createdAt: v.number(),
})
  // eq(announcementId).eq(deliveredAt, undefined) is the batch cursor —
  // same undefined-in-index pattern as notifications.by_userId_readAt.
  .index("by_announcementId_deliveredAt", ["announcementId", "deliveredAt"])
  // Cross-batch email dedupe (see Recipient resolution).
  .index("by_announcementId_email", ["announcementId", "email"]),
```

No changes to `notifications`, `conversations`, or `messages`. Announcements land in `notifications` as ordinary rows with `type: "announcement"` or `type: "reminder"` (the `type` column is a free string; no union to extend).

No changes to `storyUpdates` or `postStoryUpdate` either — see Design Decisions #2.

### Key Queries

```typescript
// Owner-or-admin. Wraps resolveAudience; returns counts only, never rows:
// { reachable, emailOnly, unreachable, pledged } for the composer's
// pre-send line. `pledged` is 0 for non-offering targets.
getAnnouncementAudience(targetType, targetId)

// Owner-or-admin. Sent history for one target, newest first, with counts —
// backs the "Sent to 12 people · 2d ago" list under the composer. Reads
// by_target_createdAt with .order("desc"), take(20).
listAnnouncementsForTarget(targetType, targetId)
```

Recipients need no new queries — announcements arrive through the existing `notifications.getNotifications` / `getUnreadCount` surface.

### Key Mutations

```typescript
// Owner-only (see Permissions). Auth + ownership + rate limit + body
// validation, then resolveAudience, then inserts the announcement row and
// one pending announcementRecipients row per recipient. Schedules the
// first delivery batch and returns the counts. Sends nothing itself.
sendAnnouncement(targetType, targetId, body)

// Internal. Claims up to 25 pending recipient rows for one announcement,
// delivers them, marks them deliveredAt, and reschedules itself at 0 if
// any remain. The whole fan-out, for both jobs.
internal.announcements.deliverAnnouncementBatch({ announcementId })

// Internal, cron-only. Scans for events/offerings inside the reminder
// window, checks reminderKey, creates the announcement + recipient rows,
// schedules delivery. See Auto-reminder Cron below.
internal.announcements.sendDueReminders()
```

`postStoryUpdate` is **not** modified. It stays a story-update mutation with no audience or delivery concerns.

Delivery inside `deliverAnnouncementBatch` reuses the existing rails directly:
- In-app: one `ctx.db.insert("notifications", ...)` per account recipient (same shape `likesDigest.ts` uses — not the public `createNotification` mutation, which is a `mutation`, not callable from server code).
- Email, account recipients: `scheduleNotificationEmail(ctx, { userId, subject, previewText, heading, body, ctaText, ctaUrl })` (convex/emailHelpers.ts), which resolves the address via `getUserEmail` and no-ops if none is on file.
- Email, guests: `ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, { to: rsvp.email, subject, previewText, heading, body, ctaText, ctaUrl })` — same arg shape, address supplied directly.
- `ctaUrl` is a **path**, not an absolute URL: `sendNotificationEmail` prefixes `SITE_URL`.
- **Escape the body.** `sendNotificationEmail` interpolates `heading` and `body` into the email HTML unescaped (that's deliberate — `events.ts` passes `<strong>` through it). An announcement body is user-authored, so it must be HTML-escaped before it is passed, then `\n` converted to `<br>` so a multi-line note survives the single `<p>`. Skipping this is an HTML-injection hole with a broadcast audience attached.
- `sendNotificationEmail` silently no-ops when `RESEND_API_KEY` is unset (dev environments); the in-app half still delivers. Not a blocker.

**Why fan-out is batched, not one transaction.** A single mutation covering 1,000 recipients would do ~1,000 recipient inserts + ~1,000 notification inserts + ~1,000 scheduler rows (scheduling counts as a write) plus up to three sequential reads per recipient inside `getUserEmail` — several thousand documents touched sequentially, well past what fits in a Convex mutation's execution budget. It would not fail cleanly at a threshold we chose; it would fail at whatever size the transaction happened to blow up on. So:

- `sendAnnouncement` writes the announcement row plus one recipient row each — bounded, one indexed read per source table, no per-recipient email lookup.
- Audiences above **500** are refused with an explicit `code: "audience_too_large"` error. That's the cap on the resolve-and-record transaction only, and it is far above any real audience in this product today.
- `deliverAnnouncementBatch` handles **25** recipients per invocation (≤75 reads, ≤75 writes) and reschedules itself while pending rows remain. Because it claims rows by `deliveredAt: undefined` and patches them, a retried or duplicated batch re-delivers nothing.

### Auto-reminder Cron

Follows the established `crons.ts` + `likesDigest.ts` pattern: a periodic job calls an internal mutation that scans for due work and processes it.

```typescript
// crons.ts addition
crons.interval(
  "announcement-reminders",
  { minutes: 15 },
  internal.announcements.sendDueReminders,
);
```

**Trigger window.** A target is due when all three hold:

1. `startsAt - now <= 24h` (inside the window)
2. `now < startsAt` (not already started — a cron outage that ends after start must not send "is tomorrow" for something underway)
3. The target is live: `events.status === "published"`, or `offerings.status === "active"` with `startDate` set

Where `startsAt` is `events.datetime` or `offerings.startDate`. The scan uses the existing `events.by_datetime` index with a range of `[now, now + 24h]`, then filters on `status`; offerings are scanned via the existing `offerings.by_status` index (`"active"`) and filtered on `startDate` in memory (no datetime index exists; active-offering counts are small). No new indexes on either table.

The cron mutation creates announcement + recipient rows only, then hands each one to `deliverAnnouncementBatch` — it never delivers inline. It processes at most **20 due targets per run**; anything left over is picked up on the next tick, which the `reminderKey` makes safe. At a 15-minute cadence that is 80 targets an hour, far past any plausible backlog.

**Idempotency.** Before sending, the mutation computes `reminderKey = "reminder24h:{targetType}:{targetId}:{startsAt}"` and looks it up via `by_reminderKey`. A hit means this reminder already went out — skip. Miss means insert-and-send. Convex mutations are serializable, so lookup-then-insert inside one mutation cannot race with itself; the key makes the job safe under any cron cadence, restarts, or manual re-invocation. The 15-minute interval means a reminder lands between 23h 45m and 24h before start (or immediately, for a target created already inside the window — still once, still before start).

**Edits and cancellations:**
- **Rescheduled after the reminder fired:** the new `startsAt` produces a new `reminderKey`, so the new date gets its own reminder when it enters the window. Recipients who got the old reminder get a second one for the new time — that is correct behavior, not a bug. Corollary: a micro-adjustment (moving start by 10 minutes while inside the window) also re-arms; accepted, it's rare and the re-sent time is accurate.
- **Rescheduled before the reminder fired:** the old key was never written; only the new date's reminder ever fires.
- **Cancelled/archived before the window:** condition 3 excludes it; no reminder.
- **Cancelled after the reminder went out:** nothing already delivered can be unsent. Batches still pending *are* stoppable, so `deliverAnnouncementBatch` re-reads the target and aborts when `kind === "reminder"` and the target is no longer live. Reminder-only: a broadcast on a cancelled event is very likely the cancellation notice itself and must still go out. For anything already delivered, the organizer's tool is a manual broadcast ("Cancelled — details inside"), which is exactly Job 1.
- **Recurring offerings:** `startDate` is the first/next session and there is no recurrence engine (`cadence` is display-only free text). One reminder fires per `startDate` value. When the creator updates `startDate` to the next session, the changed key re-arms the reminder. Sessions the creator never rolls the date forward for get no reminder — named, accepted.

## UI/UX Specifications

### Sender: where the composer lives

No new pages, and **one** `<AnnouncementComposer targetType targetId />` component — the three surfaces differ only in the props they pass and the heading they show. Do not build three composers.

- **Project** — a "Message supporters" section inside the owner's project card on `routes/projects.tsx`, which already branches on `isOwn` and already hosts the owner's `StatusSelect`. Not the public story page: `routes/story.$slug.tsx` is unauthenticated and read-only (`getStoryPage` only), rendered by the CF Pages Function, with no owner identity available to it.
- **Event** — a "Message attendees" section in the organizer-only area of `routes/event.tsx`, which already renders blocks off `event.isOrganizer` (`events.get` returns it) and already holds the applications list. `routes/events_.garden.$id.tsx` has **no** organizer branch today — it renders only a first-names attendance line — so the composer does not go there.
- **Offering** — a "Message participants" section in the `isOwner` block of the owner's offering card on `routes/offerings.tsx`, alongside the existing status select / Edit / Delete controls. That block shows no signups today; the count comes from `getAnnouncementAudience`, so wiring the (currently uncalled) `listSignupsForOffering` query is optional, not required.

For offerings the count line names the split when pledges exist — "12 people will get this — 8 confirmed, 4 pledged" — so a creator reading a headline number knows what it is made of.

### Sender: composer

```
┌─────────────────────────────────────────┐
│ Message attendees                       │
│ ┌─────────────────────────────────────┐ │
│ │ Write your announcement...          │ │
│ └─────────────────────────────────────┘ │
│ 14 people will get this — 11 on The     │
│ Exchange and by email, 3 by email only. │
│                        [Send to 14]     │
├─────────────────────────────────────────┤
│ Sent                                    │
│ "Venue moved to the side…"  12 · 2d ago │
│ Reminder (automatic)        12 · 3d ago │
└─────────────────────────────────────────┘
```

- The count line comes from `getAnnouncementAudience` and is live, not cached.
- After sending: "Sent to 14 people." No modal, no celebration. The mutation returns before delivery finishes; that is fine — the recipient rows are already committed, so the count is accurate even though the emails are still queuing.
- At the rate limit: composer disabled with "You've sent 2 announcements today. Try again tomorrow."
- Sent history (`listAnnouncementsForTarget`) lists broadcasts and system reminders in one place so the sender knows what their audience has already received.

### Recipient: in-app

An ordinary notification row, no new surface:

- **Title:** "Update on {target title}" (broadcast) / "Reminder: {title} is tomorrow" (reminder)
- **Message:** the body (broadcast) / "Starts {formatted time}" (reminder)
- **linkUrl:** the target's page; **relatedUserId:** the sender (broadcasts only), so the existing notification renderer shows the sender's avatar and profile link
- Unread badge, mark-as-read: existing behavior, untouched

### Recipient: email

Rendered by the existing `sendNotificationEmail` template (heading, body, CTA button):

- **Subject:** "{Sender name} — update on {target title}" / "Reminder: {title} is tomorrow"
- **Heading:** target title. **Body:** the message, then one provenance line: "You're getting this because you RSVP'd to {title}." (or "…because you support {title}" / "…signed up for {title}")
- **CTA:** "View event" (or "View Project" / "View offering") → the target page, passed as a path (the template prefixes `SITE_URL`)
- Broadcast emails append: "To reply, message {sender name} on The Exchange."
- The assembled `body` string is HTML. Escape the sender's text before concatenating the provenance and reply lines onto it — see Key Mutations.

## Permissions

Sender must be the actual owner of the target, checked against the same fields the existing management mutations check:

| Target | Check | Precedent |
|--------|-------|-----------|
| Project | `project.userId === userId` | `assertStoryOwner` (garden/stories.ts) — owner only, no admin override (verified) |
| Event | `event.organizerId === userId` | `events.update` / `events.cancel` — organizer only, no admin path (verified) |
| Offering | `offering.userId === userId` | `updateOffering` / `updateOfferingStatus` / `deleteOffering` all check `offering.userId !== userId && !profile?.isAdmin`; announcements deliberately drop the admin path for **sending** |

**Sending is owner-only, no admin override.** A broadcast is authored speech signed with the sender's name — an admin sending "as" a Creative is impersonation, not moderation. This knowingly diverges from the owner-or-admin pattern on `updateOffering`/`updateProjectStatus`.

**Reading is owner-or-admin**, which is not a softening of that call — it is the lever admins actually need. An admin fielding "this organizer is spamming us" must be able to see what went out and to whom; they should not need database access to answer it. This also matches the codebase rather than diverging from it: `getEventRsvps` and `listSignupsForOffering` both already grant admins the full view. The moderation levers for a misused broadcast stay the existing ones — cancel the event, archive the offering, act on the account. An admin who needs to reach an audience operationally does it under their own name, in V2, if that need materializes.

Other gates:
- `getAnnouncementAudience` and `listAnnouncementsForTarget` are owner-or-admin. Neither returns recipient rows — counts and sent history only — so no guest email list is reachable through this feature by anyone.
- Unauthenticated callers get `ConvexError({ code: "unauthenticated" })`; wrong owner gets `code: "forbidden"` with a plain reason string, matching the garden convention (`garden/stories.ts`, `garden/eventRsvps.ts`, `offerings.ts`). Note `convex/events.ts` predates that convention and throws bare `Error("Not authorized")` — the new module follows the garden convention; the event composer's error handling must not assume the `events.ts` shape.
- Recipients can only read their own notification rows (existing `notifications.ts` behavior, unchanged).

## V1 Scope Cuts

Deliberately not built:

1. **Account-less Project supporters are handled defensively, not solved for.** `projectSupport.supporterUserId` is optional in the schema and the table has no email column, so a row without it would be undeliverable. In practice this cannot happen today: `garden/support.ts:supportProject` is the only write path and it requires auth, always setting `supporterUserId`. The resolver counts such rows as unreachable and the announcement records `unreachableCount`, but the composer shows that line only when the count is non-zero — do not build UI copy around a state the app cannot currently produce. If a guest support path is ever added, it must capture an email or this stays true.
2. **No group threads, ever, in this feature.** `conversations` stays exactly-two-participant. Replies are ordinary DMs. If group chat is ever built it is its own spec.
3. **No composed subject lines, no rich text, no attachments.** Body-only, plain text, derived subjects. Keeps the composer one box.
4. **No delivery/read tracking beyond "queued."** No Resend webhook in V1, so per-recipient state is `emailQueuedAt`, not "delivered" or "opened." We record what we know and nothing we don't.
5. **No Tables.** `gardenTables`/`tableSessions`/`sessionRsvps` are operator-created (W4), `hostUserId` is optional so ownership is ambiguous, and sessions recur — three open questions this spec doesn't need to answer to ship. When Host-run Tables get self-serve management, session reminders should reuse this primitive (`targetType: "table_session"` slots in cleanly).
6. **No per-category email preferences or unsubscribe.** Recipients opted into a relationship (supported, RSVP'd, signed up); volume is bounded by the 2/day/target rate limit and one reminder per start time. Preference controls ride with any future notification-settings work, not this feature.
7. **No configurable reminder offsets.** 24 hours, fixed. Offsets ("1 hour before", "1 week before") are a `reminderKey` suffix away when wanted.
8. **No scheduled/drafted broadcasts.** Compose and send.

## Success Metrics

### Primary
- Announcements sent per week (by kind: broadcast vs reminder)
- Reminder coverage: % of events/offerings with a start time that got a reminder
- Recipient reach: notifications created + emails queued per announcement

All three are answerable from the `announcements` table alone — no instrumentation needed to report them.

### PostHog Events

PostHog is **not wired up in this app** (no `VITE_PUBLIC_POSTHOG_KEY`, no provider; every `posthog?.capture()` is a silent no-op — see `app/lib/featureFlags.ts`). These are the intended event contract for whenever it is, not a Phase 1 deliverable, and nothing in this feature should depend on them.

- `announcement_sent` — sender broadcasts (props: targetType, recipientCount, unreachableCount)
- `announcement_reminder_sent` — cron fires a reminder (props: targetType, recipientCount)
- `announcement_notification_clicked` — recipient opens the linkUrl

## Design Decisions

1. **Separate primitive, shared rails**: new `announcements`/`announcementRecipients` tables; delivery is 100% existing `notifications` rows + `emails.sendNotificationEmail`. No new delivery mechanism, no DM-table extension.
2. **Project broadcasts do *not* fold into `postStoryUpdate`.** An earlier draft added a `notifySupporters` flag to that mutation. Rejected on two grounds. Factual: `postStoryUpdate` has **zero callers** — there is no story-update form anywhere in the app — so there is nothing to fold a checkbox into, and the "one composer, one speech act" rationale describes a UI that doesn't exist. Structural: it would give a story-update mutation an audience-resolution and fan-out branch that every future caller inherits and has to reason about. `sendAnnouncement` stays the single fan-out entry point; when a story-update form is built, it can call both.
3. **Idempotency key includes the start time**: reschedules correctly re-arm the reminder; re-runs of the cron never double-send.
4. **Owner-only sending, owner-or-admin reading**: broadcasts are signed speech, so no admin sends as a Creative; admins keep visibility so a complaint is answerable, matching `getEventRsvps`.
5. **Batched fan-out from day one**: a thousand inserts and a thousand scheduled actions do not belong in one mutation, and a cap that large fails at an arbitrary size rather than a chosen one.
6. **Honest delivery states**: "queued," never "delivered," until a Resend webhook exists.
7. **Rate limit 2/target/day**: correction-friendly, spam-hostile.

## Timeline

- **Phase 1 (MVP)**: schema, `resolveAudience`, `sendAnnouncement` + `deliverAnnouncementBatch`, the shared composer on all three owner surfaces, reminder cron
- **Phase 2**: Table session reminders, configurable offsets, delivery webhooks, notification preferences

## Approval

- [ ] Reviewed by product
- [ ] Reviewed by engineering
- [ ] Approved for development

---

**Document Version**: 1.1 — codebase-verified pass: every cited file, field, index, and helper signature checked against `app/convex` and `app/routes`
**Last Updated**: 2026-08-30
**Author**: Claude (Product Planning)
**Status**: Draft
