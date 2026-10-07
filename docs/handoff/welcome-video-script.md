# Handoff: script the welcome video (and the page it opens)

*For the agent writing the script. Written 2026-10-01 from the team call that day. Branch: `claude/monthly-member-gifting-ad0f31`. Owner: Rick.*

## The job

Write the script for a short how-to video that welcomes people into The Garden. It replaces Creator Notes as the big hero on Today, and it sits at the top of one long scrolling welcome page. By the end, a new person should know how to:

- post a project, or hire someone
- find collaborators
- support other people's work
- apply to the grant fund
- choose who gets their monthly grant

The monthly grant is the member-directed giving built on this branch, and it belongs inside this video, not in a separate one.

Write the script and the page copy first. Don't build the page until Rick approves the script.

## Why (the Oct 1 team call, recorded in Upsight)

- David: "one long scroller that has an instructional video at the top." The page should feel like a furnished living room, with the next action obvious.
- Rick: "we need to make a video of you walking people through" — a leader on camera makes joining feel safe.
- David: record it casually on the Tuesday call (Oct 6).
- Rick: "now is the time for us to be about the content."
- Rick: "there's tons of creatives and there's no patrons." The giving and backing parts of the video carry the most weight.
- Patricia: send a welcome note that tells new sign-ups to post a project. The page copy can double as that note.
- Haley: "someone sending you $5… I'm going to engage the crap out of that." Small support is the strongest signal we have.

## Rules (don't reopen these)

- **Half the words.** One idea per line, 8th-grade English, short sentences. A voiceover line is two sentences at most; on-screen text is six words at most.
- **Use the words the app uses.** Check each against `origin/main` before you write it. All of these are live (checked 10/1):
  - "Create account", "Skip for now"
  - "+ Post", then "Start a project" / "Hire someone" / "Host an event"
  - "Cheer them on" (free), "Back this" (when a project is raising money)
  - "Become a member and create a project" (the grant fund page)
  - "Support a creative, a project, or the grant fund", "Skip", "plussed up" (/give)
  - "Get paid" (Settings › Money)
  - A recurring paid music night is a **Show** on screen, not a "gig".
- **Money sentences come only from the approved list.** That's `docs/marketing/claims.md`, and the same text lives in `app/app/constants/claims.ts` as `CLAIMS`. The useful keys:
  - `membership`, `dues`
  - `memberDirected`, `memberDirectedDefault`, `memberDirectedFull` (the monthly grant)
  - `backing`, `processingFee`
  - `grantFund`, `grantFundDeductible`
  - `theGarden`
  - If a line you need isn't there, flag it. Never invent a rate or a promise.
- **Never sell public money.** No "every dollar on a public ledger," no backer amounts, no leaderboards.
- **Words to avoid:**
  - "invest", "donate"
  - "gift", for money moving inside the app (check `claims.test.ts`)
  - seed, water, harvest and journey metaphors
  - "platform", "marketplace", "solution", "ecosystem"
- **The amount is exact.** The monthly grant is half of each $10 membership after card fees: $4.71, not "about $5."

## What exists today (checked on main, 10/1)

- **Sign-up:** open to everyone, no invite code (PR #36). Onboarding asks for one piece of work, and every step after picking a role can be skipped.
- **Projects:** a project can be raising money, forming a team, or working. Projects has two views: Projects and Work (paid jobs and Shows).
- **Support:** "Cheer them on" is free and always there. "Back this" appears when a project is raising. The person backing pays the card fee on top.
- **Grant fund:** the Sophia Fund page (`/fund/:slug`) has $10,000 to start. Members post a project and propose it. A small committee decides; member votes come later.
- **Membership:** $10 a month.
- **Monthly grant:**
  - Each paid month, a member picks who gets $4.71: a creative, a project, or the grant fund.
  - If they don't pick in time, it goes to the fund.
  - They can add more ("plussed up").
  - Pages: `/give`, plus the card on Today.
- **Getting paid:** Settings › Money › "Get paid" (Stripe Connect).
- **Other places to show:** People and messages, Events (RSVP, "Host an event"), and your profile (Billing, Support you've given).
- **Footage you can reuse:** `docs/features/mocks/member-directed-giving/walkthrough.mp4`, 60 seconds of the giving pages, recorded on a local test backend (on this branch).
- **What you're replacing:** the Creator Notes hero in `app/app/routes/today.tsx`, the section labeled "Creator Notes". It's a video podcast picked from events tagged "Creator Notes".

## Don't film around problems

- **Payments:** production runs on a Stripe test key until Rick switches it to live (Upsight task, due Oct 3). Don't show a card form on the live site. Film checkout on a test setup, or cut away before the card screen.
- **Connect isn't switched on yet.** Show the "Get paid" button, not a payout landing in a bank.
- **Test accounts:** "Test Account" and its "Sign-up Test" class are visible on production until they're deleted. Film after the cleanup, or on seeded test data.
- **Real people:** never show a real person's money or messages without their OK. Use seeded people, or creatives who said yes.

## What to deliver (in `docs/marketing/welcome-video/`)

1. **`script.md`.** For each beat: the screen and its URL, the voiceover (two sentences at most), the on-screen text (six words at most), and the length.
   - Target 2:00–2:30 for the full video.
   - Also mark a 30-second cut and a 15-second vertical cut for Instagram.
2. **`page-copy.md`.** The long scroll page: one section per beat, each with a headline, one line, and one button using the app's verb.
   - The opening section of this page doubles as Patricia's welcome note.
3. **`shot-list.md`.** Which screens to capture, what test data to seed, who's on camera, and what b-roll to use (events, real creatives who agreed).
4. **`patron-brief.md`.** Outline for the separate patron video, 60–90 seconds.
   - One real creative, what they're making, and how backing works, in one line.
   - It ends on "Back this."
   - Mention tax deductibility only through `grantFundDeductible`, and only once Park Hill's fiscal sponsorship is confirmed (Upsight task).

## Beat outline (a starting point, not the script)

1. **Open on real people.** A room, a creative at work. "You make things. Here's how to get them seen, staffed, and supported."
2. **Who this is for:** use `CLAIMS.theGarden`.
3. **Join:** create an account, add one piece of work, and skip anything you're not ready for.
4. **Post:** "+ Post", then Start a project, or Hire someone for paid work.
5. **Find your people:** add the roles you need, browse People, send a message.
6. **Support others:** Cheer them on is free. Back this when someone is raising money.
7. **The grant fund:** become a member, post your project, and propose it. A small committee decides.
8. **Your monthly grant:** each month you pick who gets $4.71 of your membership (`memberDirected`). Add more if you want.
9. **Show up:** RSVP to events, or host one.
10. **Close:** Create account, or Start a project.

## Where it goes in the app (separate work, after the script is approved)

- **Today:** for a new member with nothing posted, the welcome video takes the hero spot. Creator Notes becomes a smaller card. (Recommendation; Rick confirms.)
- **The long-scroll page:** recommend making it The Garden's landing page, so createthegarden.com lands there. David is sending the Squarespace DNS (Upsight task).
- **Hosting:** embed it from YouTube or Vimeo with the app's existing embed helper (`app/app/lib/videoEmbed.ts`). Don't upload the video file into the app.

## Open questions for Rick (ask once, in one message)

1. Who's on camera: Rick, David or Haley? Upsight logged it as Haley walking people into her community.
2. Does the welcome video replace Creator Notes on Today for everyone, or only for new members?
3. Which address does createthegarden.com open?

## Before you start

- Merge `origin/main` into this branch first. It's 9 commits behind (as of 10/1).
- Read these:
  - `docs/marketing/claims.md`
  - `docs/features/member-directed-giving.md`
  - `docs/features/project-ia.md`
  - the mocks in `docs/features/mocks/member-directed-giving/`
- Check every on-screen claim against the code. Tag anything you couldn't verify.
- Send Rick the script as one doc. He reviews for "half the words" first.
