# Following — decision and spec

v0.1 · 2026-09-08 · owner: Rick · status: **decided, not built**. Resolves beads issue `wonderwall-pjd` ("Design: Social connection metaphor").

## 0 · The decision

The platform has three kinds of connection between people. Each does one job.

| Connection | What it records | Direction | Who sees it |
|---|---|---|---|
| **Credits** | People you have worked with on a project | Mutual, earned | Public, on the project and both profiles |
| **Communities** | Where you belong | Join / leave | Public roster |
| **Following** | Individual people whose work you respect | One-way | The two people involved. Never counted in public. |

Credits alone fail at the start: almost nobody has worked with anybody yet. Communities are a room, not a choice about a person. Following is how someone says "this one" about an individual before any work has happened. That is a basic human interest and the platform should hold it.

Following is not a feed. There is no timeline of followed people's activity, no follower counts, no follower lists, no acceptance step. It is a shortlist plus a few notifications.

Resolution on `wonderwall-pjd`: **Follow**, one-way, quiet. Options "Connect", "Friend", "Crew" and "Keep enhanced Favorites" are closed. Favorites is the existing implementation and becomes Following for people; the heart on events stays a bookmark.

## 1 · What a person can do

- **Follow** another person from their profile, from a search card, from a project page, from a community roster.
- **See who they follow** on one page, grouped by what those people make (§2).
- **Get told** when a person they follow posts a project, gets a project funded, or is on an event (§3).
- **Be told once** when someone starts following them, by name. No running count.
- **See "follows you back"** on a profile when both people follow each other. That is the only mutual signal, and it is private to the pair.
- **Unfollow.** No notification.

## 2 · The people-you-follow page, grouped by interest

The page is organized by what the followed people make, not by a flat list or by recency. This is the differentiator. A flat list of names is a contacts app; a page that reads "Photographers · Musicians · Writers · Designers" is a map of your taste, and it is what you look at when you are hiring or building a team.

Rules:

- A person appears once, under the **first interest on their profile**. Interests come from the canonical `INTERESTS` list (`app/app/constants/interests.ts`). A person with no interests appears under "Other".
- Group headings are the interest names. Within a group, most recently followed first.
- **Under six follows, the page is a flat list.** Grouping three people into three groups is noise. Above six, groups.
- Each entry: photo, name, interests, community, and their most recent project if they have one. One line each, no card chrome.
- Events you have saved stay on this page in their own section below, unchanged.

Nothing on this page is visible to anyone but the owner.

## 3 · Notifications

Three triggers, all about a person you follow. One in-app notification each, with a link. Email follows the existing digest pattern (`likesDigest.ts`, three times a day), batched, not per event.

| Trigger | Notification |
|---|---|
| They post a project (passion or paid) | "**Name** posted *Project title*." → the project |
| Their project receives funding (a backing, a grant allocation, a pool contribution) | "**Name**'s *Project title* was funded." → the project. One per project per day at most. |
| They are on a published event, as organizer or credited participant | "**Name** is at *Event title*, *date*." → the event |

And one about you:

| Trigger | Notification |
|---|---|
| Someone follows you | "**Name** started following your work." → their profile |

Notifications land in the existing `notifications` table. There is no page that lists notifications today (`messages._index.tsx` header comment). This spec requires one: a Notifications section at the top of `/messages`, newest first, cleared on view. That is the smallest place that already carries the unread badge.

## 4 · Signals the platform may use

Following is a private signal of interest. The platform may use it quietly:

- In **search** and on **/opportunities**, people you follow and their projects sort first. A light preference, never a label.
- On a **paid post**, "Invite someone you follow" is the shortlist for who to ask.
- For **operators**, aggregate follow counts are one input into who to feature. Never shown to members.

It is never used to rank people against each other in public.

## 5 · Data

Reuse `favorites` (`schema.ts:290`). It is already one-way, polymorphic (`targetType`, `targetId`), indexed by user and by target.

- `targetType: "profile"` rows are follows. No migration. Existing favorites become follows on day one.
- `targetType: "event"` rows stay bookmarks.
- Add `"project"` to the accepted union in `favorites.ts` (`toggle`, `isFavorited`, `getFavoriteCount`), as `dev-gap-inventory.md:21` already describes. Following a project is optional scope; the union change is three lines and unblocks it.
- No new table. No `follows` table.

Notification writes:

- `createPaidProject` and `createPassionProject` (`garden/projects.ts`) → for each follower of `userId`, insert a notification. Followers are `favorites.by_target` with `targetType: "profile"`.
- Funding events already write to `projectSupport`, `allocations`, and `grantContributions`; each of those inserts adds a follower notification for the project owner, deduplicated per project per day.
- Event publish (`events.ts`, where `status` becomes `"published"`) → followers of the organizer and of each credited participant.
- `favorites.toggle` when a profile follow is created → one notification to the followed user.

## 6 · Build

In order. Each is shippable alone.

1. **Rename and widen.** "Favorite" becomes "Follow" on profiles, search cards and the nav. Heart stays on events. Widen the `targetType` union. Half a day.
2. **"Started following your work" notification** and the **follows-you-back** indicator on profiles. Half a day.
3. **Notifications section on `/messages`.** The three follow triggers and the digest email. One to two days.
4. **Grouped follow page.** Replace the People section of `favorites.tsx` with the grouped view and the six-follow threshold. One day.
5. **Search and browse ordering.** Followed people first. Half a day.

Estimate: four to five days total.

## 7 · Also required before this ships

Following makes people more findable, and any member can already message any member. There is a `blocks` table and messaging reads it, but **nothing writes to it**: no block button, no mutation. Ship block and unblock (profile menu, conversation menu, Settings list) before or with step 1. `messaging-feature-prd.md` §Block already specifies it. One day.

## 8 · Not doing

- Follower counts, anywhere, for anyone but operators.
- A public list of who follows whom.
- A feed or timeline.
- Acceptance, requests, or "pending".
- Weighting follows heavily in any ranking.
