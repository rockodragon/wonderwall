# Celebrations

Status: built on branch `claude/support-notification-canvas-775f21` (2026-10-04). Needs a backend deploy before the frontend ships.

## What it is

When someone does something for a member, the member is told, and it goes on their canvas as a card until they've seen it. On a phone it goes at the top of Today.

These count:

| What happened | Notification type | Who is told |
|---|---|---|
| Someone cheers on your project ("Send a message") | `encouragement` | The project's owner |
| Someone offers help or gear | `help_offered` | The project's owner |
| Someone backs your project | `backing_received` | The project's owner |
| Someone gives you part of their monthly grant, or plusses up | `gift_received` / `backing_received` | The person they gave to |
| A fund awards money to your project | `fund_award` | The project's owner |
| Your grant proposal is approved | `grant_proposal_approved` | The person who proposed it |

Each one is an in-app notification right away. The list lives in `app/convex/celebrationTypes.ts`.

## Email: at most one a day

Rick, 2026-10-04: one message a day is the most we want at this stage.

- Cheers, offers of help, backings and gifts don't email one by one. They go in **one daily email** at 10am Pacific (9am in winter), sent by `app/convex/supportDigest.ts` from the `support-digest` cron.
- Nobody gets an email on a day with nothing in it.
- It leaves out anything the person already saw: read in Messages, or closed on the canvas. Each item is sent once (`notifications.digestedAt`).
- One item: the subject is that item ("Dana Lee cheered on Small Acts"). More: the first one, "and 2 more". The body is one line per item, with their words in quotes, up to ten lines. The button goes to `/today`.
- **Awards still email right away** (`fund_award`, `grant_proposal_approved`). They're rare and they're money.
- It's an `activity` email, so the existing opt-out and unsubscribe apply.
- Backings and gifts used to email one by one. They now go in the daily email too.

Follows and likes are not celebrations. They stay in Messages only.

## Rules

- **Names.** A cheer or a backing shows the person's name only when they ticked "Show me as a supporter". Otherwise it says "Someone", and their account isn't attached to the notification at all, so no face or "Say thanks" either. An offer of help is always named to the owner: you can't answer an offer from nobody. The box still hides them on the public project page.
- **Your own project.** Cheering or offering help on your own project tells nobody.
- **Fund awards.** An award recorded with a project tells the project's owner ("The Sophia Fund awarded you $500"). An award recorded with only a name tells nobody, because there's no account to tell. The fund's name is the one its page shows.
- **On the canvas.** Celebrations come first, then Updates. Between them they take the first two resting slots, so the default canvas still holds six cards. The Today view shows all of them. Newest first, at most eight.
- **The card.** Each kind has its own mark in the top corner: hands clapping (cheer), a handshake (offer of help), coins (backing), a gift (gift), a trophy (award). The kicker names it: Cheer, Offer of help, Backing, Support, Award, Grant approved.
  - A cheer or an offer leads with their words, with the person's photo when they're named and have one.
  - A backing or a gift leads with the amount, set large.
  - An award is a paper note like the fund's: the amount large, signed with the fund's name in handwriting (Caveat).
  - Opened, the button is **Say thanks** (opens a conversation with them) when a person is named, else a link to where it happened (See the project, See the fund, Get paid).
- **Links.** In an opened card, on a phone card, and in the daily email, the person's name links to their profile, the project's title to the project, and an award's fund to the fund page. "Someone" never links. The resting card on the canvas has no links, because the whole card is the button that opens it.
- **When it leaves.** Closing the opened card, pressing its button, or "Got it" on a phone marks it done (`notifications.celebratedAt`). It also leaves after 30 days. Reading Messages does not take it off. Messages marks every notification read on sight, and that mustn't eat a cheer before the canvas has shown it.
- **Confetti.** An award (`fund_award`, `grant_proposal_approved`) throws confetti the first time it's on show, once per award per browser. Nothing when the person has asked for reduced motion.

## Backend contract (`app/convex/notifications.ts`)

- `listCelebrations()` returns up to eight `{ _id, type, title, message, linkUrl, createdAt, from, project, fund, amountCents }`, newest first. Signed out, it returns `[]`.
  - `from` is `{ userId, profileId, name, imageUrl }` or null. It's always null for an award, which comes from the fund, not from the operator who recorded it.
  - `project` is `{ title, href }` or null, from `notifications.projectId`. Older rows fall back to the project in `linkUrl`.
  - `fund` is `{ name, href }` for an award, else null.
  - `amountCents` comes from `notifications.amountCents`. It's null on older rows, and those cards lead with words instead.
- `finishCelebration({ notificationId })` sets `celebratedAt` and `readAt`. It is idempotent and owner-only.

## Deploy

`notifications.celebratedAt`, `digestedAt`, `projectId` and `amountCents` are new optional fields. `listCelebrations` / `finishCelebration` and the daily `support-digest` cron are new. Deploy the backend before merging: the canvas and phone Today call `listCelebrations` on load.
