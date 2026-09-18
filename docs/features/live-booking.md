# Live booking — paid gigs on a schedule

v0.1 · 2026-09-17 · owner: Rick · status: **built on the `live-booking` branch, not merged**. The spec and the code were written together; every section below says what the code does today. Open questions are at the end.

## 0 · What this is

A restaurant, a bar, or any community partner with a room posts a paid gig that repeats: "live music every Friday, 8 to 10pm, $300." The platform opens the dates. Artists mark the dates they can play and attach clips from their portfolio. The venue listens, picks one artist per date, and pays them directly in Venmo, Cash App, PayPal, or Zelle. The platform records the payment and takes nothing.

It shows up under **Projects** as **Paid gigs**. A gig is a paid project with a schedule attached. It sits next to every other paid post on `/projects` and `/opportunities`, with its own filter chip.

## 1 · Who does what

| Person | What they do |
|---|---|
| **Venue** (the account that posts) | Posts the gig. Sees who is available for each date. Books one artist per date. Pays them. Marks the date paid. Can pause, end, add a date, cancel a date, or change the time. |
| **Artist** (any signed-in member with a profile) | Marks the dates they can play. Attaches up to 3 clips and a note. Withdraws if plans change. Confirms when a payment lands. |
| **Platform** | Opens the dates, keeps them stocked eight weeks ahead, sends the notifications, records what got paid. Never moves the money. |

The venue is a regular account. It can be a person with the partner role, or a community host. `orgName` on the profile prefills the venue name.

## 2 · How it works, start to finish

1. **The venue posts.** Projects → "+ Post a project" → **Paid gigs**. The form asks for: venue name, title, what you need, the days of the week, how often it repeats, start and end time, the first date, how it ends, what each date pays, the location, and the community (optional). Time zone is taken from the venue's browser.
2. **Dates open.** The first eight weeks of dates open right away. Every night the platform opens more, so the schedule always shows about eight weeks ahead. A series with no end date never runs out.
3. **Artists respond.** On the gig's page, an artist checks the dates they can play, writes a note, picks up to three clips, and sends. The venue gets one notification: "Jane can play 3 dates."
4. **The venue picks.** For each open date, the venue sees everyone available, with their clips playing right there. One click books an artist. The artist gets "You're booked: Fri, Sep 25 · 8–10pm."
5. **The venue pays directly.** On a booked date, the venue opens **Pay**. It sees the artist's Venmo, Cash App, PayPal, or Zelle, with a link that opens the app with the amount and a note already filled in. The venue pays in its own app.
6. **It's recorded.** The venue marks the date paid ($300 via Venmo). The artist confirms it landed. Both see it on the date.

Money never passes through the platform. This is the plan's rule for project money at this stage: "we record it and take nothing on money we don't move" (the plan, §3).

## 3 · The schedule rule

The venue says it the way they think about it, and the platform stores it that way.

| Field | Choices | Default |
|---|---|---|
| Days of the week | Any set, Sunday through Saturday | Friday |
| Repeats | Every week · every other week · every four weeks · just once | Every week |
| First date | Any date from today on | The next chosen weekday |
| Ends | No end date · on a date · after a number of dates (1 to 104) | No end date |
| Start and end time | Any time of day; an end time earlier than the start runs past midnight (9pm to 1am) | 8pm to 10pm |
| Time zone | Taken from the browser, stored on the series | — |

**Dates open eight weeks ahead.** A "no end date" series never shows more than about eight weeks at once. A nightly job opens the next dates. The job is safe to run any number of times: a date that already exists is skipped.

**Counting starts at the first date, not today.** An every-other-week series that started in January lands on the right alternate Fridays in June. A "10 dates" series that has had 7 offers 3.

**Time zones are handled once, on the way in.** Each date's start and end are turned into exact instants using the venue's zone. Daylight-saving changes come out right on both sides of the switch.

**What the venue can change after posting:**

| Change | What happens |
|---|---|
| Start or end time | Every future date moves, booked ones included. Booked artists get a notification with the new time. |
| How it ends | Future open dates that no longer fit are dropped. A dropped date nobody answered disappears. One with responses is marked cancelled so the people who offered can see it. Booked dates are never dropped. |
| Venue name | Just the label. |
| Days of the week | **Not offered.** Every response is tied to a specific date. End the series and post a new one. |
| Add a date | One extra date outside the rule, at the series' usual time. A New Year's Eve show on a Thursday. |
| Cancel a date | A date nobody answered disappears. One with responses is marked cancelled. A booked artist is told. |
| Pause | Dates stay visible; no new responses are taken. |
| End | Future open dates are dropped. Booked dates stay. An ended series stays ended. |

## 4 · Responding and booking

- An artist responds **per date**. One submission can cover many dates; the note and clips are copied onto each one, so every date's list stands on its own.
- **Clips** are pieces from the artist's own portfolio: audio, video, or a link to SoundCloud, Spotify, Bandcamp, Apple Music, YouTube, Vimeo, TikTok, or Instagram. Up to three per response. The venue plays them inline. An artist with no clips is pointed to Works to add one.
- Responding again to a date you already offered updates your note and clips. A withdrawn date can be offered again.
- An artist can **withdraw** any date. If they were booked on it, the date reopens and the venue is told: "Jane can't make Fri, Sep 25. That date is open again."
- The venue **books one artist per date**. Everyone else who offered stays listed as available, in case plans change. Nobody gets a "you weren't picked" message.
- The venue can **reopen** a booked date (the artist is told) or **cancel** it (the artist is told).
- Blocks are honored both ways, same as messaging and project teams.

## 5 · Where it shows up

| Place | What you see |
|---|---|
| `/projects` | A **Paid gigs** filter chip beside All, Passion, Paid. Each gig card carries a schedule line: "The Grove · Every Friday · 8–10pm · next Fri, Sep 25 · 6 dates open" and a "$300/date" badge. |
| `/projects/:id` | The **Dates** card replaces the team card: the schedule, every upcoming date with its status, and the controls each viewer is allowed. The patron support widget is off for gigs. |
| `/opportunities` (public, no account) | The gig appears as paid work with its money line, like every other paid post, plus the same schedule line. Responding still takes an account. |
| Settings → **Getting paid** | Venmo, Cash App, PayPal.Me, Zelle. Private. |
| Settings → **Your gigs** | Every date you're booked on or offered, with paid status. |
| Notifications | See §9. |

## 6 · Getting paid without Stripe fees — the research and the decision

**Rick's question:** when someone joins and wants to transact, can they link Venmo or similar, so we stop paying Stripe fees?

**The answer: members add their pay handles, the venue pays them directly, and we record it.** That is what's built. It costs the platform nothing per payment, it needs no payment integration, and it is exactly the plan's rule for project money right now.

**Why not "link Venmo" as a real integration:** Venmo has no public API for a platform to send or receive person-to-person payments. The only way to pay into a Venmo account by API is PayPal's Payouts product, and that requires the platform to collect the money first — which means card or bank fees on the way in anyway. Zelle has no public API at all; only banks can send it. So there is no rail that is both free and automated. Every automated rail charges something. The free rail is the one where the two people pay each other and we keep the record.

**What each option costs (verified 2026-09-17):**

| Route | What it costs | Automated? | Verdict |
|---|---|---|---|
| **Pay handles + deep links** (Venmo, Cash App, PayPal.Me, Zelle) | $0 to the platform. Venmo: $0 on a personal profile, 1.9% + 10¢ to the artist on a business profile. Cash App and PayPal: similar or less for personal transfers. | No API. The link opens the payer's app with the amount and a note filled in. The venue taps Pay. | **Built. Use now.** |
| Stripe ACH bank debit | 0.8% per charge, capped at $5. The payer covers it at checkout (plan §3). | Yes | Later — when money moves through our checkout and we take the 10%. |
| Stripe Connect Express payouts | $2 per month per account that gets paid, plus 0.25% + 25¢ per payout, on top of the charge fee. | Yes | Later, with the above. Bead wonderwall-7avu. |
| PayPal Payouts to Venmo | 2% per payout capped at $1 (a 25¢ flat rate is listed for the API). US only. We must hold the money first. | Yes | Only if we ever need to *send* to Venmo by API. Not now. |
| Dwolla (bank to bank) | 0.5% per transfer, min 5¢, max $5, pay as you go. Plans from $250 a month. Everyone does identity checks. | Yes | No. Cheaper than cards, but it is a full payments integration for a stage where we don't move the money. |
| Zelle | No public API. Banks only (JPMorgan, U.S. Bank). | No | No. We store the Zelle email or phone as a handle, nothing more. |

**The rules people should know:**

- Venmo's terms say payments for goods or services belong on a business profile. A musician taking gig money on a personal profile is common and is at their own risk. The settings page says this in one line.
- Tax reporting: the 1099-K threshold is back to $20,000 and 200 transactions a year (One Big Beautiful Bill Act, retroactive). The payment apps handle that. We report nothing because we don't move the money.
- We never see, store, or show account numbers, cards, or bank logins. A handle is a username, a $cashtag, a PayPal.Me name, or the email or phone on a bank account. It's shown only to the venue that booked the artist, never on the public profile.

**What's built for this:**

- `profiles.payoutHandles` — four optional strings. Set by `profiles.setPayoutHandles`, which strips "@", "$", and pasted profile URLs and rejects anything that isn't a handle. Stripped from the public profile query.
- `gigs.getSlotPayment` — for the venue or the booked artist only: the handles, the amount from the gig's pay, and the links (`venmo.com/<user>?txn=pay&amount=300&note=…`, `cash.app/$tag/300`, `paypal.me/name/300USD`).
- `gigs.markSlotPaid` (venue) and `gigs.confirmSlotPaid` (artist) — the record on the date.

**What comes later:** when we want the 10% on gig money, or a public ledger row per gig, the money has to move through us. That is Stripe ACH for the venue plus Connect for the artist. It is the same payout rail every other paid thing on the platform needs, tracked in bead wonderwall-7avu. Nothing here has to change for that; the pay panel gets a "Pay through the platform" option next to the handles.

## 7 · Data

Three new tables and one new profile field (`convex/schema.ts`). The posting itself is a normal `projects` row, `kind: "paid"`, with the pay in the same four money states every paid post uses.

```
gigSeries         one per gig, 1:1 with the project
  projectId, hostUserId, venueName?
  timeZone, startTime, endTime         "HH:MM" venue-local
  weekdays[], intervalWeeks            0=Sun…6=Sat; 1 | 2 | 4
  startDate, endMode, endDate?, count? "YYYY-MM-DD"; never | until | count
  status                               open | paused | ended
  materializedThrough?                 last date the nightly job opened through

gigSlots          one per date
  seriesId, projectId, date, startsAt, endsAt
  status                               open | booked | cancelled
  bookedUserId?, bookedResponseId?, bookedAt?, cancelledAt?
  paidAmountCents?, paidMethod?, paidAt?, paidConfirmedAt?

gigResponses      one per artist per date
  slotId, seriesId, projectId, userId, profileId
  status                               available | withdrawn | booked
  note?, clipIds[]                     ≤ 500 chars; ≤ 3 of the artist's own artifacts

profiles.payoutHandles?  { venmo?, cashapp?, paypal?, zelle? }
```

The pure core — recurrence, clock math, validation, labels, payment links — is `convex/garden/gigRules.ts`, with no Convex imports so the client uses the same functions. It has 38 unit tests. The Convex layer is `convex/garden/gigs.ts`; the card summary is `convex/garden/gigSummary.ts`; the nightly job is `extend-gig-series` in `convex/crons.ts`.

## 8 · Permissions

**As coded:** any signed-in account can post a gig (same as posting paid work today). Any signed-in member with a profile can respond. The venue, or an operator, manages the series.

**The plan says** "job postings are public; applying takes membership" (the plan, §2). The seat gates for paid work are not enforced anywhere in the code today — that is a known gap from the September 15 audit, not something this feature introduced. When the reconcile pass decides the gate, it goes in one place here: `respondAvailable` in `gigs.ts`, the same spot the project-team `requestToJoin` would get it.

## 9 · Notifications

In-app only, same table and shape as project teams. No email yet (see §10).

| To | When | Type |
|---|---|---|
| Venue | An artist offers dates | `gig_response` |
| Venue | A booked artist withdraws | `gig_artist_withdrew` |
| Venue | The artist confirms a payment | `gig_paid_confirmed` |
| Artist | Booked | `gig_booked` (adds "Add how you get paid under Settings" if they haven't) |
| Artist | Venue reopens their date | `gig_unbooked` |
| Artist | Venue cancels their date | `gig_cancelled` |
| Artist | Venue changes the time | `gig_time_changed` |
| Artist | Venue marks a date paid | `gig_paid` |
| Followers of the venue | A gig is posted | `followed_posted_project` (existing) |

## 10 · Build status

**Done on this branch:** schema, rules and tests, every Convex function above, the nightly job, the Paid gigs filter and card line, the post form, the Dates card with venue and artist views, clips inline, the pay panel with deep links, mark paid / confirm, Settings sections for pay handles and your gigs, the public profile strips handles.

**Runtime checked, not click-tested.** The schema and functions push cleanly to the local Convex backend (`app/.env.local` points at `local:` — run Convex commands with `fnm exec --using=24 --`, the CLI misbehaves under Node 26). The time-zone math (`Intl.DateTimeFormat` inside a Convex function) was run there and matched every expected instant, including both sides of a daylight-saving change. What has not happened is a signed-in click-through of the post form, the Dates card, and the pay panel; that needs a real session. Follow-ups are bead wonderwall-96j0.

**Not done, in order of value:**

1. **Email** for "you're booked" and "an artist offered dates." In-app notifications only today. The jobs board's email helper (`scheduleNotificationEmail`) is the pattern.
2. **A cancellation window.** Nothing stops an artist from withdrawing the morning of. The plan says nothing about deposits or notice; see open questions.
3. **Reminders** the day before a booked date, to both sides. The announcements reminder job is the pattern.
4. **Cross-community discovery** applies here as everywhere else — pages default to your community, "All communities" widens.

## 11 · Open questions

1. **The plan says jobs are their own thing, not projects.** This feature puts paid gigs under Projects, the way Rick asked ("it would appear in projects as paid gigs"). The legacy `/jobs` board still exists beside it. Either the plan's line changes to "jobs and gigs are paid projects," or `/jobs` gets retired for good. One decision, then the brief and this doc match.
2. **Does responding to a gig take membership?** The plan says applying takes membership. The code gates nothing on paid work today. Decide once, for gigs and project roles together.
3. **Deposits and notice.** Should the venue be able to ask for a cancellation notice window (48 hours), and should there be a way to hold a deposit? Both need money to move through us, so both wait for the payout rail.
4. **More than one act per date?** Today a date books one artist. A venue running two sets a night would post two gigs. Fine for now; revisit if a real venue asks.
5. **Should the artist's pay handles be shown to a venue before booking?** Today: only after. Showing them earlier would let a venue pay a deposit, but it also exposes the handle to anyone who posts a gig.
