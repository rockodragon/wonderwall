# Safety: report, block, suspend

Spec, 2026-10-01. Nothing here is built. Written for Rick to decide on. Code paths are relative to `app/`.

Rick's ask, word for word: "users must be able to report & block messaging. admins must be able to suspend accounts (whatever is standard: prevent login and messaging and block content = render posts and content archived, hidden)."

How to read this. **As coded** means I read it in the repo today, with file and line. **Proposed** is new. **Open** needs Rick. Money statements say only what the code does. Nothing here promises a refund, a payout hold, or a deadline.

Why now. Signup is open as of the 10/1 launch pass, and any member can message any member (cold messages: 5 a day free, 50 for members, `convex/messaging.ts:53-61`). A stranger can now reach people, and today there is no way to report them or stop them.

## Short version

- Block is built for messaging. Report is not built for people, messages, projects or events. Suspend does not exist.
- The only admin action on a person today is hard delete. It leaves their projects, events, classes and messages behind (`convex/admin.ts:232-345`).
- Suspend is the hard part. Sign-in checks are spread over about 240 call sites. A deleted session still works for up to an hour. So the block has to sit in one shared helper, and every call site has to use it.
- Build order: reports and the admin queue first, then suspend, then hide content, then block-hides-content, then the audit log everywhere.

## 1. What exists today

| Capability | State | Where |
|---|---|---|
| Block a person | **As coded:** built. Block, unblock, "have I blocked", "who I blocked". Idempotent. | `convex/messaging.ts:641-757` |
| Block button | **As coded:** on a profile (not your own), and a "Blocked people" list in Settings. **Not** in the message thread. | `app/routes/profile.tsx:109-130,875`, `app/routes/settings.tsx:1226` |
| Where a block is enforced | **As coded:** sending a message, opening a thread, the conversation list, the unread badge, gig respond/pick, project invite/apply. Either direction. | `messaging.ts:76-83,140-161,352-373,591-604`, `convex/garden/gigs.ts:128-140,863,1064`, `convex/garden/projectTeam.ts:630-634,768,927,1211` |
| Where a block is not enforced | **As coded:** reading an existing thread (`getMessages`, `getConversation`, `markConversationRead` never check). Nothing hides the blocked person's profile, projects, events or classes from the blocker. | `messaging.ts:295,443,533` |
| "They aren't told" | **As coded:** partly. No notice is sent. But the refusal wording differs by direction: "You blocked this person" vs "You can't message this person", and `getOrCreateConversation` throws `code: "blocked"`. The blocked person can work it out. `projectTeam.ts` already uses a neutral line. | `messaging.ts:82,149,160`, `projectTeam.ts:633` |
| Report a person or message | **As coded:** a `reports` table exists (reporter, reported user, optional message, reason, details, status). Nothing writes it. Nothing reads it. No UI. Beads 2x3, dug, h0k are open. | `convex/schema.ts:706-730` |
| Report a class | **As coded:** built. Any member except the teacher. Anonymous to the teacher. Goes to the community's hosts. A class with no community goes to admins, but there is no queue, so hosts and admins only see it on the class page. | `convex/offerings.ts:214-240,914-1010`, `schema.ts:1440-1458`, `app/routes/offerings.$id.tsx:629-720` |
| Report a project or event | **As coded:** nothing. | no mutation, no button |
| Admin hide / delete | **As coded:** projects and events only. Hide is a status. Delete refuses when money is on record. The menu is on the page itself; a "Hidden" list is on `/admin`. | `convex/moderation.ts:56,80,155,179,230`, `convex/moderationRules.ts:16-57`, `app/components/AdminMenu.tsx`, `app/routes/admin.tsx:532` |
| Pause a class | **As coded:** community hosts or admin. Hides it from everyone but the teacher, hosts and admins. Stops sign-ups and payments. | `offerings.ts:139-179,839-912`, `schema.ts:1418-1429` |
| Suspend a person | **As coded:** does not exist. The word "suspended" is used only for a church coverage code with a failed card. That is a different thing. | `convex/garden/coverage.ts:42`, `schema.ts:1077` |
| Admin action on a person | **As coded:** hard delete (`admin.ts:232`) and grant/revoke admin (`admin.ts:351`). Neither writes a log. | `convex/admin.ts` |
| Audit log | **As coded:** none. Hide records only `hiddenAt`, not who. | `schema.ts:334,1204` |
| What the Terms already say | **As coded:** we may suspend or end an account for breach; we can read messages to investigate a report. | `app/routes/legal.terms.tsx:126,140,189` |

## 2. Report

### What can be reported

| Target | Reached from | Goes to | State |
|---|---|---|---|
| A person | their profile (a "..." menu next to Block) | admin queue | **Proposed** |
| A message | the message in the thread | admin queue | **Proposed** |
| A project | the project page | admin queue | **Proposed** |
| An event | the event page | admin queue | **Proposed** |
| A class | the class page | hosts (as coded); also shown in the admin queue | built; **Proposed** to list in the queue |

### The form

**Proposed.** Copy the class report control (`offerings.$id.tsx:629-720`). It already works and reads well.

- Reasons: harassment, spam, unsafe, misleading, other. These match the class list (`schema.ts:1444-1450`). The old `reports` table has a shorter list ("inappropriate" instead of "unsafe" and "misleading"). Use the class list.
- Details: optional, up to 500 characters.
- The reported person never learns who reported. Admins can see the reporter.
- One open report per reporter per target. A second report from the same person edits the first (same rule as `offerings.ts:214-240`).
- Cap: 10 new reports per person per day. This is a cheap guard against a report brigade. **Open:** is 10 right.
- You cannot report yourself. You cannot report an admin without it also going to the other admins. **Open:** do you want that.
- After sending, the reporter sees "Thanks. The site team will take a look." No outcome is promised or sent.

### Data

**Proposed.** Change the unused `reports` table instead of adding a second one.

- Add `targetType` ("user" | "message" | "project" | "event" | "offering") and `targetId` (string).
- Keep `reportedUserId`: the owner of the target. This lets the queue group everything about one person.
- Add `snapshot` (string): for a message, the text and time at report time; for a project or event, the title and a short excerpt. Reason: a reported message can later be hidden or the sender suspended, and the evidence must survive.
- Keep `status`, `adminNotes`, `reviewedAt`, `reviewedBy`.
- The table has no writers, so it is almost certainly empty. Check production before making `targetType` required. If it has rows, backfill them as `targetType: "user"`.
- `offeringReports` stays as it is. Hosts keep reviewing class reports. The admin queue reads both tables.
- `convex/admin/mergeUsers.ts:37-43` already lists `reports`. Keep that list in step with any new user-id field.

## 3. Block

**As coded:** a block already stops messages both ways and hides the conversation. It is quiet. Keep it.

**Proposed fixes, small:**

1. One neutral refusal for both directions: "That isn't possible right now." (the wording `projectTeam.ts:633` already uses). Apply it in `sendMessage` and `getOrCreateConversation`.
2. `getMessages`, `getConversation` and `markConversationRead` return nothing for a blocked pair, so a saved link to an old thread does not work.
3. Put Block and Report in the thread header (`app/routes/messages.$conversationId.tsx`). Today you have to leave the thread and go to the profile.
4. When someone is blocked, offer "Also report" in the same dialog.

**Proposed, larger (phase 4): hide their content from the blocker.** Rick asked for this. It is not built. A block should hide the blocked person from the blocker in these places. Each one needs a filter and a test:

| Surface | Where it reads today |
|---|---|
| People search and directory | `convex/profiles.ts:389` (loads every profile, no filter) |
| Their profile page | `profiles.ts:105` (`getProfile`, no viewer check) |
| Projects list and project pages | `convex/garden/projects.ts`, `projectsPublic.ts:188,251` |
| Events list and event pages | `convex/events.ts`, `garden/eventVisibility.ts` |
| Classes | `convex/offerings.ts` |
| Follow lists, likes, team credits | `convex/follows.ts`, `profileLikes`, `projectMembers` |
| Notifications from them | `convex/notifications.ts` |

Rules for the hide:

- One direction only for content: the blocker stops seeing the blocked person. The blocked person keeps seeing the blocker's public content. If both directions hid content, the blocked person would notice the blocker vanish.
- Messages stay blocked both ways, as now.
- Direct links still open (a block is not a ban). They show a one-line "You blocked this person." with an Unblock button. **Open:** or should a direct link 404.
- Public pages (`/story/...`, signed-out) are not filtered. There is no viewer.

## 4. Suspend

### What suspend does

| Area | Effect | How |
|---|---|---|
| Sign-in | Existing sessions end. The person cannot use the app. | delete `authSessions` and refresh tokens (same code as `admin.ts:318-342`) **and** a shared gate, below |
| Messages | They cannot send or open threads. Others cannot message them. | gate in `sendMessage`, `getOrCreateConversation` |
| Their messages | Conversations with them disappear from everyone else's list, as a block does (`messaging.ts:373`). Nothing is deleted. Admins can read them. | same filter as block |
| Profile | Not in people search, `getProfile` returns nothing to non-admins, invite link stops working | `profiles.ts:105,389`, `convex/invites.ts` |
| Projects, events, classes, gig series | Hidden from everyone except admins. Admins see them with a banner "Archived: account suspended". | below |
| Money in motion | Not touched. See section 8. | |
| Admin | Cannot suspend an admin or yourself. Demote first. | |

### The gate (the hard part)

**As coded:**
- Sign-in identity is read in 139 places as `auth.getUserId(ctx)` (24 files) and 100 places as `getAuthUserId(ctx)` (24 files), plus 8 direct `getUserIdentity()` reads. Count from `convex/`, tests and generated code excluded.
- `getAuthUserId` reads the token only. It never checks that the session still exists (`@convex-dev/auth` 0.0.90, `dist/server/implementation/index.js:342`).
- The token lasts one hour by default (`.../tokens.js:4`). `convex/auth.ts:388` sets no `jwt` or `session` option.
- So deleting a session does not log the person out for up to an hour. The only way to stop them at once is to check `suspendedAt` on every call.
- The library has no "before sign-in" hook that I could find. Callbacks used are `createOrUpdateUser`, `afterUserCreatedOrUpdated` and `redirect` (`.../users.js:14,76`, `.../redirects.js:7`). A returning password user never passes through them.

**Proposed:**

1. One helper, `getActiveUserId(ctx)`. It reads the identity, loads the profile, and returns `null` when `suspendedAt` is set. A suspended person looks signed out to the server.
2. In `convex/auth.ts`, wrap the exported `auth` so `auth.getUserId` is the gated version. The 139 `auth.getUserId` calls then need no edit. Change the 100 `getAuthUserId` imports to the helper (mechanical).
3. A test that fails if any file under `convex/` imports `getAuthUserId` from `@convex-dev/auth/server`, other than the helper. This stops the next engineer from bypassing the gate.
4. Actions have no `ctx.db`. The action version of the helper calls an internal query, `internal.accountStatus.byUser`, the way `garden/stripe.ts` already calls internal queries for its data.
5. One query, `accountStatus.mine`, uses the raw token on purpose. It is the only thing a suspended person can still call. It returns `{ suspended: true, since }`.
6. Cost: one extra profile read per call. Profiles are indexed by `userId`. Acceptable.

**Open:** a cheaper cut is to gate only writes now and reads later. I do not recommend it. A suspended person could still read private threads for up to an hour.

### What the suspended person sees

**Proposed.** The client calls `accountStatus.mine` on load. When suspended it shows one page and signs them out:

> Your account is suspended. If you think this is a mistake, write to hello@thecreative.exchange.

- No reason is shown. No names. No report details. (`hello@thecreative.exchange` is `app/legal/entity.ts:48`.)
- **Open:** send one email at suspension with the same words. The Terms do not require notice for a suspension for cause (`legal.terms.tsx:189` promises 30 days only for ending without cause). I recommend the email, for fairness. Rick's call.
- Public pages the person owns (story pages, events) stop resolving for visitors. Section 4 table.
- They can still sign in again. Every call then returns signed-out and they land on the page above. This is acceptable and honest. It is not a ban on the email address. **Open:** do we need email-address banning for repeat abusers. Not in phase 1.

### Hiding their content

**As coded:** hide is a status on projects and events. `status: "hidden"` plus `hiddenAt` and `statusBeforeHidden`. Every browse list already filters on visible statuses, and direct links check `isHidden` (`moderationRules.ts:16-31`, `projects.ts:353,581`, `projectsPublic.ts:259`, `stories.ts:432`, `eventVisibility.ts:61`, `events.ts:425,813`). The owner and admins can still open a hidden page. Backing is refused on a hidden project (`garden/support.ts:131`). Tickets are refused on a hidden event (`stripe.ts:185`, `events.ts:1279`).

**Proposed.** Reuse that. Do not add a second visibility system.

- On suspend, for each of the person's projects and events that is not already hidden: set `status: "hidden"`, remember `statusBeforeHidden`, and add `hiddenReason: "suspension"`. A row an admin already hid keeps `hiddenReason: "admin"` and is left alone.
- Classes: set `pausedAt`, `pausedBy` = the admin, `pausedReason` = "Account suspended" (`schema.ts:1425`). Sign-ups and payments stop (`offerings.ts:669,749`).
- Gig series: set `status: "paused"` (`schema.ts:2058`). New responses stop.
- A new table, `suspensionHides` (`suspensionId`, `table`, `rowId`, `priorStatus`), records exactly what suspend changed. Unsuspend restores only those rows. A project someone separately hid by hand stays hidden.
- Direct reads return "not here anymore" to everyone except admins. The owner cannot sign in anyway. Today a hidden event is still open to its other hosts (`events.ts:421-431`) and a hidden project to its lead (`garden/projects.ts:581-591`). **Open:** a co-host of a suspended person's event loses it under this rule. Keep it that way, or let co-hosts keep it.
- The batch can be large. Run it as a scheduled mutation that works through the person's rows in chunks. The suspension record shows "archiving" until it finishes. The sign-in block takes effect at once; the hiding follows within seconds.
- Portfolio pieces are projects (`origin: "portfolio"`), so they ride along.
- Other surfaces to audit in phase 3, each needs a filter or a decision: wonderings, jobs the person posted, team credits on other people's projects, backer names on other people's projects, org positions (`/orgs/:slug` People tab), likes digest and reminder emails (`convex/crons.ts:21-55`).

### Unsuspend

**Proposed.** One button on the same screen.

- Clears `suspendedAt`. Restores every row in `suspensionHides`, then marks the suspension lifted with who and when.
- Does not restore sessions. The person signs in again.
- Messages come back by themselves. They were never deleted.
- A lifted suspension stays in the record. A person can be suspended again; each time is a new row.

### Data

**Proposed.**

- `accountSuspensions`: `userId`, `status` ("active" | "lifted"), `reason` (admin-only text, required), `suspendedBy`, `suspendedAt`, `liftedBy`, `liftedAt`, `fromReportIds`.
- `profiles.suspendedAt` (optional number): the fast flag the gate reads. Set and cleared only by the suspend and unsuspend mutations, in the same transaction as the `accountSuspensions` row.
- `suspensionHides`, as above.
- Name check: do not reuse the word "suspended" for coverage codes in the same UI. Call this "account suspended" everywhere.

## 5. Admin review queue

**Proposed.** `/admin/safety`, linked from `/admin`. Same admin gate as the other admin pages.

- Open reports, grouped by the reported person, newest first. Each group shows: the person, number of reports, reasons, the snapshots, whether they are already suspended, and any earlier suspensions.
- Actions on a group: **Dismiss** (closes the reports), **Hide this item** (calls the existing `setProjectHidden` / `setEventHidden`, or pause for a class), **Suspend person**, **Mark handled**.
- Suspend asks for a reason (required, 10+ characters). The dialog first shows the money panel from section 8, so the admin sees what is in flight before deciding.
- A reported message shows that message and up to 5 messages either side, no more. The Terms let us read messages to investigate a report (`legal.terms.tsx:140`). Reading anything outside the reported span is not needed and is not offered. **Open:** is 5 right.
- The `/admin` "Hidden" list gains a second tab for suspended people.
- The class reports from hosts show here read-only for visibility. Hosts still act on them.
- Existing beads this replaces: dug (Admin reports section). It mentions "Warn User". Warn is **Open**. A warning is a notification plus an email in the existing notification path (`convex/emailHelpers.ts`). Cheap to add later.

## 6. Audit log

**Proposed.** A table, `adminActions`: `actorId`, `action`, `targetType`, `targetId`, `subjectUserId`, `reason`, `details` (small JSON), `createdAt`. Indexes by target and by time. Append-only: no update or delete mutation exists for it.

- Phase 1 writes it for the new actions: dismiss, hide, suspend, unsuspend, view-reported-thread.
- Phase 5 adds the old ones: hide/unhide/delete project and event (`moderation.ts`), set admin (`admin.ts:351`), delete user (`admin.ts:232`), record creative payout (`garden/payouts.ts:194`), pause/restore class.
- A read-only page, `/admin/safety/log`, lists it.
- Messages read by an admin through the queue are logged, with the conversation id and which report opened them.
- The log never stores the message text.

## 7. Edge cases

| Situation | As coded | Proposed |
|---|---|---|
| Person has an unread report against them and is already suspended | n/a | the group shows "suspended"; new reports still queue |
| Suspended person has team members on a project | team can see the project (a hidden project is open to the owner and admins, not the team) | team loses sight of it; admin can unhide one project on its own, which removes it from the restore list. **Open:** transfer ownership tool is out of scope |
| Suspended person is a team member on someone else's project | credit shows | credit stays but links to nothing. **Open** |
| Someone replies to a suspended person | thread is gone from the list | send is refused with "That isn't possible right now." |
| An admin is reported | n/a | cannot be suspended. Demote first, then act. Logged. |
| Two admins act on the same report | n/a | the second sees "already handled" |
| The wrong person was suspended | n/a | unsuspend restores only what suspend changed |

## 8. Money in flight

Suspend does not move, hold, refund or cancel money. That is on purpose. This section says what the code does today, so the admin is not surprised. It is not a promise.

| Situation | As coded | Proposed |
|---|---|---|
| Someone wants to back a suspended person's project | refused once the project is hidden (`support.ts:131`) | same, via hide |
| A backer already has a monthly backing on it | the Stripe subscription keeps charging. Each renewal is recorded as owed to the project lead, hidden or not (`stripeHandlers.ts:1787-1815`, `937-964`) | the money panel lists active monthly backings. An admin can cancel in Stripe by hand. Nothing automatic |
| A suspended person is owed money | the nightly sweep still transfers it to their Stripe account once they pass $50 (`garden/connect.ts:129-181`, `crons.ts:82-85`, `connectState.ts:103-139`) | **Open, lawyer:** a "hold transfers" switch on the suspension, off by default. It would withhold money backers paid. Do not build it until a lawyer says when that is allowed |
| Class money for a suspended teacher | owed on `classPayments`, paid by hand (`class-payments-and-moderation.md`) | listed in the money panel. The class pause stops new payments. A payment already in flight is still recorded |
| Tickets already sold for a hidden event | stay recorded. Refunds are by hand (`schema.ts:1573`). Delete is refused when sales exist (`moderation.ts:193`) | panel lists the event, number sold, and amount. Admin refunds in Stripe. Attendees are told by an admin using the existing announcement tool, by hand |
| Booked gig dates | venue and artist pay each other directly; the platform moves no money (`gigs.ts:1334-1356`) | pausing the series stops new offers. Booked dates are not cancelled. The panel lists them so an admin can tell the other side |
| The suspended person is a backer or member | their Stripe subscriptions keep billing | panel lists active subscriptions. Cancelling is by hand in Stripe |
| Member-directed giving | a member can direct their monthly share to any active community member (`garden/giving.ts:85-100`) | a suspended person is not a valid recipient; an open gift already pointed at them is refused at decide time |
| Hard delete of a person with money on record | `admin.ts:232` does not check. It leaves `backingPayments` pointing at a missing user | refuse delete when the person has money rows, the way `deleteBlocker` does for projects. Suspend instead |

The money panel is read-only. It shows counts and amounts and links to Stripe and to `/admin/ledger`.

## 9. Build order

| Phase | What ships | Why this order |
|---|---|---|
| 1. Report and queue | General `reports`, report buttons on profile, message, project, event. `/admin/safety` with Dismiss and Hide item. `adminActions` table, written by these actions. Neutral block wording and block/report in the thread header. | A stranger can message people now. Humans must be able to see problems before we can act on them. No new risk. |
| 2. Suspend the person | `accountSuspensions`, `profiles.suspendedAt`, `getActiveUserId` over all call sites, the bypass test, session deletion, the suspended page, message and profile gating. Suspend/Unsuspend buttons in the queue. | The core request. Largest blast radius, so it ships alone and gets its own review. |
| 3. Archive their content | `suspensionHides`, hide/pause/restore of projects, events, classes, gig series, chunked. Money panel. Audit of the other surfaces. | Needs phase 2's flag. Reuses the hide that exists. |
| 4. Block hides content | The surface table in section 3. | Lower urgency. Many read paths, easy to miss one. |
| 5. Log everything, close gaps | Log the old admin actions. Refuse hard delete when money exists. Warn action (if wanted). Reporter closure note (if wanted). | Cleanup. |

Existing beads: 2x3 (report backend) and h0k (block/report UI) fold into phase 1. dug (admin reports) folds into phase 1. 7fg (block backend) is already built (`messaging.ts:641-757`); its description is out of date.

Beads: epic `wonderwall-33yf`. Phase 1 `.1`, phase 2 `.2` (needs `.1`), phase 3 `.3` (needs `.2`), phase 4 `.4`, phase 5 `.5` (needs `.1`). 2x3, h0k and dug are linked to `.1` and carry a note. 7fg carries a note that it looks done; Rick to close it.

## 10. Open decisions for Rick

1. Suspended person's messages: vanish from the other person's inbox (as asked), or collapse to "Message from a suspended account". [Likely] vanish is fine because the report snapshot keeps the evidence. If someone reports and then the thread disappears, the reporter may feel unheard.
2. Email the suspended person once. [Likely] yes.
3. Block hides content one way only. [Likely] correct.
4. Direct link to a blocked person's page: show a one-line notice, or 404. [Guessing] notice.
5. Reports per person per day: 10.
6. Context shown for a reported message: 5 either side.
7. Add a Warn action. [Guessing] not needed for launch.
8. Email-address banning for repeat abusers. [Guessing] not for launch.
9. Hold transfers on suspension. Do not decide without the lawyer.

## 11. For the lawyer

Questions only. No answers here.

1. If a suspended creative has money owed from backers, can we hold it, for how long, and what do we tell the backers or the creative?
2. Do the Terms need a notice or an appeal step before or after a suspension for cause? (`legal.terms.tsx:189` promises 30 days for ending without cause only.)
3. Is reading a reported message span, with a log, within what the Privacy page says? (`legal.terms.tsx:140`, `legal.privacy.tsx:112`.)
4. Do we have any duty to report certain content (the Terms already ban sexual content involving minors, `legal.terms.tsx:114`), and how do we preserve it?
5. How long do we keep reports, snapshots and the audit log? (`legal.terms.tsx:190` mentions content quoted in a report we are required to keep.)
