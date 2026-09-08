# Following — decision and spec

v0.2 · 2026-09-08 · owner: Rick · status: **building**. Resolves beads issue `wonderwall-pjd`. v0.1 was checked against the code on 2026-09-08 and corrected; the corrections are the "Why" notes below.

## 0 · Decision

Three kinds of connection between people. Following is the one this spec builds.

| Connection | Records | Direction | Visible to | Status |
|---|---|---|---|---|
| Credits | People you worked with on a project | Mutual, earned | Public | Specified (V1 PRD §8), **not built** |
| Communities | Where you belong | Join / leave | Members | Built |
| **Following** | People whose work you respect | One-way | The two people | This spec |

Following is a shortlist plus notifications. No feed, no follower counts, no follower lists, no acceptance. `wonderwall-pjd` options Connect, Friend, Crew, and "enhanced Favorites" are closed. The word is **Follow**; the notification copy says "is following your work" rather than "follower," which is the connotation the ticket flagged.

## 1 · What ships

**Existing `favorites` rows with `targetType: "profile"` are follows.** No new table, no migration. `targetId` on those rows is a **profile id**, not a user id. Every fan-out below resolves `profiles.by_userId` first, then `favorites.by_target`. Get this wrong and notifications silently never fire.

| # | Piece | Where | Notes |
|---|---|---|---|
| 1 | **Follow button** | `FavoriteButton` when `targetType="profile"` | Text pill "Follow" / "Following", always visible. Today it is a heart hidden behind hover, unreachable on phones. Events keep the heart. Add the button to the project page (`getProject.creator._id` is already a profile id). |
| 2 | **Follows you** | `profile.tsx` | Shown when the viewed person follows the viewer. New query `follows.followsMe(profileId)`. Private to the pair. |
| 3 | **"Is following your work"** | `favorites.toggle`, on create of a profile favorite | One notification to the followed user, linking to the follower's profile. `getNotifications` must return `relatedUserProfile.profileId` (today it returns `inviteSlug` only). |
| 4 | **Following page** | `favorites.tsx` → title and nav label "Following" | People grouped by the **first interest** on their profile, from `INTERESTS`. Six or more follows → groups; fewer → flat. Most recently followed first within a group. One line each: photo, name, interests. No-interest people land in "Other" (same bucket as the real interest "Other"; accepted). Saved events stay in a section below, headed "Events you saved". `getMyFavorites` already returns `interests` and `favoritedAt`; grouping is frontend, with the grouping rule in `app/lib/groupFollows.ts` and a unit test. |
| 5 | **Followed person posts a project** | `createPaidProject`, `createPassionProject` | Fan out: "**Name** posted *Title*." → `/projects/:id` |
| 6 | **Followed person creates an event** | `events.createEvent` | Fan out: "**Name** is hosting *Title*, *date*." → `/events/:id`. There is no publish step; events are created `published`. Fires on create. |
| 7 | **Notifications on /messages** | `messages._index.tsx` | Section above conversations, newest first, from `getNotifications`. The existing mark-all-read on mount stays; the list still renders read items. |
| 8 | **Block / unblock** | `messaging.ts`, `profile.tsx`, `settings.tsx` | `blockUser`, `unblockUser`, `isBlocked`, `listBlocked`. `blocks` table and every read path exist; nothing writes it. Block link on a profile (not own), "Blocked people" list in Settings with unblock. `getOrCreateConversation` must check blocks; today only `sendMessage` does. Required because following makes people findable and any member can message any member. |

All notification writes are direct `ctx.db.insert("notifications", …)` in the `likesDigest.ts` shape. The public `createNotification` mutation is not callable from server code and is not used.

**One helper, used by 5 and 6:** `notifyFollowers(ctx, ownerUserId, { type, title, message, linkUrl })` in `convex/follows.ts`. Resolves owner → profile → followers → inserts. `relatedUserId` is the owner.

## 2 · Not in this build

| Dropped | Why |
|---|---|
| "Project was funded" notification | No money reaches a project today. `projectSupport` is pledge-only ("no money actually moves"), `raisedCents` is never incremented, `grantContributions` has no `projectId`. Add when backing checkout lands. |
| Event participants | `events` has one person field, `organizerId`. No lineup exists. |
| Email digests | `scheduleNotificationEmail` has no opt-out and Settings has no preference UI. Adding three email triggers before an off switch exists is wrong. In-app only. |
| Followed-first ordering in search and /opportunities | `profiles.search` has a deliberate wonderings-first sort; `listProjects` slices to 50 before any reorder and is unauthenticated. Separate ticket. |
| "Invite someone you follow" on a paid post | No apply or invite flow exists on projects. |
| Following projects | Widening `targetType` to `"project"` needs a third branch in `getMyFavorites` and a consumer; `/events` also reads that query. Separate ticket. |
| Community roster as a follow surface | `listMembers` is members-only and returns user ids, not profile ids. |
| Per-project-per-day dedupe | Not needed: 5 and 6 fire once per created row. |

## 3 · Build

Three agents in parallel, no shared files. Then one integration pass: typecheck, tests, build.

- **Backend** — `convex/follows.ts` (`notifyFollowers`, `followsMe`), `favorites.ts` (#3), `notifications.ts` (`profileId` in `relatedUserProfile`), `garden/projects.ts` (#5), `events.ts` (#6), `messaging.ts` (#8 mutations + conversation block check). Update `projects.test.ts` and `events.test.ts` if fan-out changes their mocks.
- **Frontend, follow** — `FavoriteButton.tsx`, `profile.tsx` (#1 #2 #8 link), `favorites.tsx` (#4), `_app.tsx` nav label, `search.tsx` button visibility, `projects.$id.tsx` button, `lib/groupFollows.ts` + test.
- **Frontend, inbox** — `messages._index.tsx` (#7), `settings.tsx` (#8 list).

## 4 · Known pre-existing issues touched here, not fixed

- `createNotification` is a public mutation any client can call to forge a notification to any user (`notifications.ts:110`). Unused. Should become internal or be deleted.
- `projectSupport.status` is documented `"pending" | "confirmed"` but written `"pledged"`.
