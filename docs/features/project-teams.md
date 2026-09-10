# Project teams — stages, credits, apply, invite, message

v0.1 · 2026-09-10 · owner: Rick · status: **draft, awaiting adversarial review**. Implements the V1 PRD §8 "team tagging, the IMDb piece."

## 0 · What this is

A project has a lead and a team. People get onto the team three ways: the lead invites someone already here, the lead invites someone by name and email who isn't here yet, or a person asks and the lead says yes. Once accepted, the project appears on that person's profile with their role. The lead can message the whole team at once. Teammates can message each other one to one.

Projects also get stages that follow the creative process, so a visitor can tell a team that's forming from one that's shipping.

## 1 · Stages

`projects.status` becomes the stage. One field, one vocabulary, both kinds.

| Stage | Means | Migrated from |
|---|---|---|
| `planning` | Idea posted, nothing committed | `active` |
| `raising` | Asking for money or resources | |
| `forming` | Building the team | |
| `working` | In production | `in_progress` |
| `releasing` | Shipping, showing, launching | |
| `completed` | Done | `completed` |
| `archived` | Hidden from browse. Not a stage. | `archived` |

Rules:
- Any stage can move to any other. It is a label the lead sets, not a state machine. A paid job may never be `raising`.
- New projects start at `planning`.
- `VISIBLE_STATUSES` (two copies, `garden/projects.ts` and `garden/projectsPublic.ts`) become "everything but archived". `ALLOWED_STATUSES` collapses to one set for both kinds.
- One internal migration, idempotent: `active → planning`, `in_progress → working`, `pending → planning`. Run once after deploy.
- Cards on `/projects` and `/opportunities` show the stage as a small label. `STATUS_LABELS` gets the six words.

## 2 · Team data

New table `projectMembers`. One row per person per project, including people who aren't on the platform yet.

```
projectMembers
  projectId        Id<"projects">
  userId?          Id<"users">        absent until an off-platform invitee claims
  name             string             display name; the credit line if userId is absent
  email?           string             normalized; only for off-platform invites
  role             string             free text: "Composer", "DP", "Editor"
  status           "requested" | "invited" | "accepted" | "declined" | "left" | "removed"
  invitedByUserId? Id<"users">
  message?         string             the note on a request or invite, ≤ 500 chars
  claimToken?      string             random, for off-platform invite links
  createdAt        number
  respondedAt?     number
indexes: by_projectId, by_userId, by_projectId_userId, by_email, by_claimToken
```

The lead is `projects.userId`. Not a row in this table. One lead per project in this version.

**Affiliation** = `status: "accepted"`. That is the only status that shows anywhere public. `requested` and `invited` are visible to the lead and the person involved, nobody else.

## 3 · Getting on a team

| Path | Who starts | Row created as | Then |
|---|---|---|---|
| **Ask** | Any member, on the project page | `requested` with `role`, `message` | Lead accepts or declines. |
| **Invite (on platform)** | Lead, by searching people | `invited` with `userId` | Invitee accepts or declines. |
| **Invite (off platform)** | Lead, by name + email + role | `invited` with `email`, `claimToken`, no `userId` | Email with a link. Claiming the link sets `userId` and `accepted`. |

The button says **Apply** on a paid project and **Ask to join** on a passion project. Same mutation, `requestToJoin`.

Off-platform claim: the link is `/signup?claim=TOKEN`. A valid unclaimed token is sufficient to sign up; it does not consume the lead's invite allowance and does not need an invite slug. The token is carried through OAuth in `sessionStorage` the way `invite-accepted` is today, and redeemed right after the profile is created. If a user signs in and their account email matches an `invited` row without a token claim, the row gets their `userId` and stays `invited` so they can accept in the UI.

Blocked pairs (either direction) cannot request or invite each other.

## 4 · Mutations and queries — `convex/garden/projectTeam.ts`

| Function | Who | Does |
|---|---|---|
| `requestToJoin({ projectId, role, message? })` | any member, not lead, not already a row | insert `requested`; notify lead |
| `withdrawRequest({ memberId })` | the requester | delete the row |
| `inviteMember({ projectId, userId?, name?, email?, role })` | lead | insert `invited`; on-platform: notify invitee; off-platform: schedule email with claim link |
| `respondToInvite({ memberId, accept })` | the invitee | `accepted` or `declined`; notify lead |
| `decideRequest({ memberId, accept })` | lead | `accepted` or `declined`; notify requester |
| `removeMember({ memberId })` | lead | `removed`; notify member |
| `leaveProject({ memberId })` | the member | `left`; notify lead |
| `claimInvite({ token })` | signed-in user | sets `userId`, `accepted`, clears token; notify lead |
| `linkInvitesByEmail()` | called on sign-in | email match → set `userId`, keep `invited` |
| `getTeam({ projectId })` | anyone signed in | lead + `accepted` rows with profile ids; plus, for the lead only, `requested` and `invited` rows; plus the viewer's own row if any |
| `listAffiliations({ profileId })` | public | projects the person leads or is `accepted` on, with role, stage, title, id. Excludes `archived`. |

Every mutation checks blocks and ownership. `getTeam` returns profile ids, since that's what profile links and Follow buttons key on.

## 5 · Messaging

- **Lead blasts everyone.** `announcements.resolveAudience` project branch adds `accepted` members to the existing supporters audience. Composer heading on the project page becomes "Message team and supporters". Rate limit unchanged (2 per target per day).
- **Teammates message each other one to one.** The Team card shows a Message button on each person. `sendMessage`'s 5-per-day limit does not count messages between two people who are both `accepted` (or lead) on the same non-archived project.
- Nobody but the lead can broadcast.

## 6 · Notifications

All `ctx.db.insert("notifications", …)` in the existing shape. `linkUrl` is the project or the profile.

| To | When | Title |
|---|---|---|
| lead | request received | "Name wants to join Title as Role" |
| requester | decided | "You're on Title as Role" / "Title didn't have room this time" |
| invitee (on platform) | invited | "Name invited you to Title as Role" |
| lead | invite answered or claimed | "Name joined Title" / "Name declined Title" |
| accepted members | stage changed | "Title is now Working" |
| member | removed | "You were removed from Title" |

## 7 · UI

**Project page** (`projects.$id.tsx`), one new `DetailCard label="Team"`:
- Lead first, then accepted members: avatar, name → profile, role, Message button (not on self).
- Viewer states: not on team → **Apply** / **Ask to join** (opens a small modal: role, optional message). `requested` → "Requested · waiting on Lead" with Withdraw. `invited` → "Lead invited you as Role" with Accept / Decline. `accepted` → "You're on this project" with Leave.
- Lead only, below the list: **Requests** (name, role, message, Accept / Decline), **Invited** (name or email, role, Cancel), **Add someone** (search people; or name + email + role for someone not here). Off-platform rows show "Invited by email" until claimed.
- Stage select (existing `StatusSelect`) gets the new vocabulary. Composer heading changes.

**Profile page** (`profile.tsx`), new section **Projects**: rows from `listAffiliations`: title → project, role or "Lead", stage label. Hidden when empty. This is the IMDb credit list.

**Browse cards** (`projects.tsx` cards, `opportunities.tsx` tiles): stage label next to the money line.

**Signup / onboarding**: read `?claim=`, keep it in `sessionStorage`, call `claimInvite` once the profile exists, then send the person to the project.

**Messages**: nothing new; notifications already render there.

## 8 · Not in this version

- More than one lead, or roles with permissions (moderator). The lead is the owner.
- A public team list on the logged-out project view. `/projects/:id` is inside the app layout.
- Team on events or offerings. Projects only.
- Credits for supporters (money). That's the existing "Supported by" list.
- A stage-based filter or tab on browse.
- Tagging someone on a `completed` project retroactively is allowed by the same invite flow; there's no special "past credit" path.

## 9 · Build

Three agents, no shared files, then integration.

- **Backend** — `schema.ts` (table + indexes, status comment), `garden/projectTeam.ts`, `garden/projects.ts` (stage vocabulary, migration, stage-change notification), `garden/projectsPublic.ts` (VISIBLE), `announcements.ts` (audience), `messaging.ts` (limit exemption), `emailHelpers` call for the claim email, tests for the pure parts.
- **Frontend, project** — `projects.$id.tsx` Team card and modal, `projects.tsx` (`STATUS_LABELS`, `StatusSelect`, card badge), `AnnouncementComposer` heading.
- **Frontend, profile and signup** — `profile.tsx` Projects section, `opportunities.tsx` badge, `signup.tsx` / `onboarding.tsx` claim handling.
