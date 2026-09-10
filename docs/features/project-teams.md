# Project teams — stages, credits, apply, invite, message

v0.2 · 2026-09-10 · owner: Rick · status: **reviewed, ready to build**. Implements V1 PRD §8 ("team tagging, the IMDb piece"). Supersedes the PRD's `projectCredits` sketch and `phase-1b/architect-gap-analysis.md`'s `projectApplications`: one table, `projectMembers`, does both. `jobInterests` stays read-only history; `/jobs` is legacy and is not extended.

v0.1 was reviewed adversarially against the code on 2026-09-10. Three findings changed the design and are marked **Why** below: renaming `projects.status` would have silently broken eleven read/write sites, so stage is a new field; a signup-bypassing claim token would have been an unlimited invite-minting hole, so claiming requires an account; and the DM rate-limit exemption was a rewrite of the limiter, so it is dropped.

## 0 · What this is

A project has a lead and a team. People get onto the team three ways: the lead invites someone already here, the lead credits someone by name who isn't here yet and sends them a link, or a person asks and the lead says yes. Accepted members appear on the project and on their own profile with their role. The lead can message the whole team and every supporter at once.

Projects get a stage that follows the creative process.

## 1 · Stage

New field `projects.stage`, optional. `projects.status` is untouched: it keeps meaning lifecycle and visibility (`active` / `archived`, with the legacy `in_progress` / `completed` still accepted).

**Why:** renaming `status` values breaks `operator.ts` VISIBLE_STATUSES, `entitlements.ts`'s `by_userId_kind_status` predicate, `jobsMigration`'s archive guard, seven insert sites, two test files, and two `!== "active"` badge conditions, all silently. An additive field breaks nothing.

| Stage | Passion label | Paid label |
|---|---|---|
| `planning` | Planning | Planning |
| `raising` | Raising | Raising |
| `forming` | Forming team | **Hiring** |
| `working` | Working | Working |
| `releasing` | Releasing | Releasing |
| `completed` | Completed | Completed |

- Any stage can move to any other. It is a label, not a state machine.
- **Default:** paid → `forming` (a paid post is a hiring post). Passion → `planning`.
- **Derived for old rows** (`stage` absent), in one pure function `resolveStage(project)`: `status in_progress → working`, `completed → completed`, paid → `forming`, else `planning`. No migration.
- Stage label on cards in `/projects` and `/opportunities`, and on the project page. Always shown.
- `StatusSelect` on the project page becomes a stage select writing `stage` via `setStage`. Archive becomes a separate "Archive" action calling the existing `updateProjectStatus`.
- `stageChangedAt` on the project, for the notification rule in §6.

## 2 · Team data

New table `projectMembers`. One row per person per project, reused across status changes. Structurally `eventApplications` plus `communityMembers`.

```
projectMembers
  projectId        Id<"projects">
  userId?          Id<"users">        absent until an off-platform credit is claimed
  name             string             display name; the credit line when userId is absent
  email?           string             normalized (normalizeEmail from garden/eventRsvps.ts); off-platform only
  role             string             free text, ≤ 60 chars: "Composer", "DP", "Editor"
  status           "pending" | "invited" | "accepted" | "declined" | "withdrawn" | "left" | "removed"
  invitedByUserId? Id<"users">
  message?         string             note on a request or invite, ≤ 500 chars
  claimToken?      string             crypto.randomUUID(); single use; cleared on claim
  claimExpiresAt?  number             30 days
  createdAt        number
  respondedAt?     number
indexes: by_projectId_status, by_userId_status, by_projectId_userId, by_claimToken
```

The lead is `projects.userId`, not a row. One lead per project.

**Uniqueness** is enforced in the mutation: look up `by_projectId_userId` (or `by_projectId_status` + email for off-platform) before insert, and patch the existing row instead. Two concurrent requests cannot make two rows.

**Row reuse rules**

| Existing status | `requestToJoin` again | Lead invites again |
|---|---|---|
| `declined` | allowed after 30 days | allowed |
| `withdrawn` / `left` | allowed | allowed |
| `removed` | not allowed | allowed |
| `pending` / `invited` / `accepted` | no-op | no-op |

**Where each status shows**

| Status | Project page | Person's profile |
|---|---|---|
| `accepted` | Team list, name → profile | Projects section |
| `invited`, no `userId` | Team list as a credit: name and role, no link, quiet "invited" marker | — |
| `invited`, with `userId` | Lead sees it under Invited; invitee sees Accept / Decline | — |
| `pending` | Lead sees it under Requests; requester sees "Requested" | — |
| others | nowhere | — |

**Why** the off-platform credit shows on the project before acceptance: the PRD's point is that a lead can credit a collaborator who has never logged in. The person's own profile stays under their control: only `accepted` appears there.

## 3 · Getting on a team

| Path | Who starts | Row | Then |
|---|---|---|---|
| **Ask** | any signed-in member, not the lead | `pending`, `role`, `message` | Lead accepts or declines. |
| **Invite, on platform** | lead, via a people picker | `invited`, `userId` | Invitee accepts or declines. |
| **Credit, off platform** | lead, by name + optional email + role | `invited`, `email?`, `claimToken` | Shows on the project now. If email given, one email with a claim link. |

The button says **Apply** on a paid project and **Ask to join** on a passion project. One mutation. Applying is free: `requestToJoin` does not call the capability gate. "Money is never the only door" (V1 PRD §2).

**Claiming a credit.** The claim link is `/claim/:token`, a public route outside the `_app` layout.
- Signed in → `claimInvite` sets `userId`, `accepted`, clears the token → go to the project.
- Signed out → the page shows "Lead credited you on Title as Role," a button to the lead's normal invite link (`/signup/:inviteSlug`), and stores the token in `localStorage`. After signup, `_app.tsx` checks `localStorage` once for a pending claim and redirects to `/claim/:token`.

**Why:** the token is a claim credential, not a signup credential. Signup goes through the existing invite link and consumes the lead's invite allowance like any other invite. No change to `signup.tsx`, `oauth-callback.tsx`, `home.tsx`, or `invites.ts`. No email-match auto-linking: password accounts have unverified emails, so an address match proves nothing.

**Blocks.** `requestToJoin` and on-platform `inviteMember` refuse when either direction is blocked. `claimInvite` re-checks against the lead and refuses if blocked.

**Limits.** `requestToJoin`: 10 per user per day. `inviteMember`: 20 per project per day; email invites 10 per lead per day. Counted with `by_userId_status` / `by_projectId_status` over `createdAt`.

## 4 · Backend — `convex/garden/projectTeam.ts`

| Function | Who | Does |
|---|---|---|
| `requestToJoin({ projectId, role, message? })` | signed in, not lead | upsert `pending`; notify lead |
| `withdrawRequest({ projectId })` | requester | `withdrawn` |
| `inviteMember({ projectId, userId?, name?, email?, role, message? })` | lead | upsert `invited`; on platform → notify; off platform → token, optional email |
| `respondToInvite({ projectId, accept })` | invitee | `accepted` / `declined`; notify lead |
| `decideRequest({ memberId, accept })` | lead | `accepted` / `declined`; notify requester |
| `removeMember({ memberId })` | lead | `removed`; notify member |
| `leaveProject({ projectId })` | member | `left`; notify lead |
| `claimInvite({ token })` | signed in | validate token and expiry; block check; set `userId`, `accepted`; notify lead |
| `getClaim({ token })` | public | `{ projectTitle, role, leadName, leadInviteSlug } \| null`; never the email |
| `getTeam({ projectId })` | signed in | `{ lead, accepted[], mine?, pending?[], invited?[] }` with profile ids. `pending`/`invited` only for the lead. **Never returns `email` or `claimToken`.** |
| `listAffiliations({ profileId })` | public | projects the person leads or is `accepted` on: `{ projectId, title, role, stage, kind }`, non-archived |
| `searchPeopleForInvite({ q })` | signed in | ≤ 10 of `{ profileId, userId, name, imageUrl }`. A narrow projection; `profiles.search` returns whole documents including `adminCode`. |
| `setStage({ projectId, stage })` in `garden/projects.ts` | lead or admin | patch `stage`, `stageChangedAt`; notify per §6 |

Email for off-platform invites: `ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, …)`, the way `announcements.ts` and `waitlist.ts` do it. `scheduleNotificationEmail` takes a `userId` and cannot reach a non-user. **Name, role and message are HTML-escaped** before they go into the body; `emails.ts` interpolates raw.

## 5 · Messaging

- **Lead broadcasts.** `announcements.resolveAudience` project branch adds `accepted` members to the supporters audience. Composer heading: "Message team and supporters". Rate limit unchanged, 2 per target per day. `MAX_AUDIENCE_SIZE` 500 now counts members. Update `docs/announcements-prd.md` §1 audience table.
- **Teammates message one to one** with the existing Message button, under the existing 5-a-day limit. No exemption. **Why:** `messages` has no recipient field and the lead isn't a row; the exemption was a rewrite of the limiter. Revisit if the limit bites.
- Nobody but the lead broadcasts.

## 6 · Notifications

`ctx.db.insert("notifications", …)` in the `likesDigest.ts` shape. `message` is required by the schema.

| To | When | Title | Message | Link |
|---|---|---|---|---|
| lead | request | "Name wants to join Title" | "as Role" + their note | project |
| requester | decided | "You're on Title" / "Title didn't have room" | "as Role" | project |
| invitee | invited | "Name invited you to Title" | "as Role" + note | project |
| lead | answered or claimed | "Name joined Title" / "Name declined Title" | role | project |
| member | removed | "You were removed from Title" | "" | project |
| accepted members | stage changed | "Title is now Working" | "" | project |

Stage-change rule: only when the stage actually changes, and at most once per project per 24 hours, checked against `stageChangedAt`. **Why:** `setStage` has no rate limit and the announcement cap exists for a reason.

## 7 · UI

**Project page** (`projects.$id.tsx`), one `DetailCard label="Team"`:
- Lead, then accepted members, then off-platform credits: avatar, name → profile (credits: no link), role, Message (not self, not credits).
- Viewer: not on team → **Apply** / **Ask to join**, a small modal with role and note. `pending` → "Requested" + Withdraw. `invited` → "Lead invited you as Role" + Accept / Decline. `accepted` → Leave.
- Lead only: **Requests** (name, role, note, Accept / Decline), **Invited** (name or "by email", role, Cancel), **Add someone**: a people search (`searchPeopleForInvite`) or name + email + role for someone not here.
- Stage select replaces the status select. Archive is a separate small action.
- Composer heading text changes. `AnnouncementComposer.tsx` itself does not change.

**Profile page** (`profile.tsx`), new **Projects** section above Work: rows from `listAffiliations`, title → project, role or "Lead", stage label. Hidden when empty. This page is inside the app layout, so it is not public today; the query is public so a future public profile can use it.

**Cards** (`projects.tsx`, `opportunities.tsx`): stage label beside the money line. `STATUS_LABELS` stays for the legacy status pill; add `STAGE_LABELS` in `app/lib/stage.ts` alongside `resolveStage`, shared by both pages and unit-tested.

**Claim route** (`routes/claim.$token.tsx`) per §3, plus the one-time `localStorage` check in `_app.tsx`.

## 8 · Not in this version

- More than one lead, or roles with permissions.
- A public team list for logged-out visitors. `/projects/:id` is inside the app layout. Same open decision as public profiles.
- Retiring `/jobs` or migrating `jobInterests`. Legacy, read-only.
- Team on events or offerings.
- A DM rate-limit exemption for teammates.
- Stage filters on browse.
- Email-match auto-linking of invites.

## 9 · Build

Three agents in parallel, one integration pass. Files are disjoint; the API contract in §4 is what the frontend codes against.

| Agent | Files |
|---|---|
| **Backend** | `schema.ts` (table, `stage`, `stageChangedAt`), `garden/projectTeam.ts` (new), `garden/projects.ts` (`setStage`, defaults on create), `announcements.ts` (audience), `garden/projectTeam.test.ts` (pure parts: row-reuse rules, limits, escape), `_generated/api.d.ts` (register module), `docs/announcements-prd.md` |
| **Frontend, project** | `projects.$id.tsx` (Team card, modal, stage select, composer heading), `projects.tsx` (card label, stage select component), `app/lib/stage.ts` + test |
| **Frontend, profile and claim** | `profile.tsx` (Projects section), `opportunities.tsx` (label), `routes/claim.$token.tsx` (new), `routes.ts` (register), `_app.tsx` (pending-claim check), `react-router.config.ts` if the claim page should prerender its shell |

Cross-agent dependency: `STAGE_LABELS` / `resolveStage` are written by the project agent and imported by the profile agent. The project agent writes `app/lib/stage.ts` first.
