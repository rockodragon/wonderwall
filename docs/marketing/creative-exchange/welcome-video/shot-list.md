# Welcome video — shot list

v1 · 2026-10-01 · UI + captions Remotion cut first; live host later

## What we're capturing

Silent UI walkthrough with captions. Voice file and talking head record later and drop in.

## Who's on camera (later)

Still open: Haley (Upsight default), Rick, or David. Remotion cut does not block on this. When you film: casual, Tuesday-call energy, not a studio read.

## Test data to seed

Use a local or staging backend. Never show a real person's money or messages without OK.

| Need | Seed |
|---|---|
| Creative profile with work | One member with a completed piece + open project |
| Raising project | Project with goal + "Back this" visible |
| Cheer target | Same or second project, not raising |
| Open role | Project with Find people / role open |
| People list | 4–6 seeded Garden members (no "Test Account" class if still on prod) |
| Events | One upcoming event with RSVP |
| Fund | Sophia Fund page with "Become a member and create a project" |
| Monthly grant | Member with open gift: **You have $4.71 to give** on `/give` |
| Plus-up | After a creative/project pick, amount chips + Skip |

## Screens to capture (order)

| # | Beat | Capture | Stop before |
|---|---|---|---|
| 1 | Open | Agreed B-roll or seeded profile "at work" still | — |
| 2 | Who | Garden home / Today with community name | — |
| 3 | Join | Create account → onboarding one piece → Skip for now | Live password managers / real email if avoidable |
| 4 | Post | + Post menu → Start a project (title) → project page; flash Hire someone | — |
| 5 | People | Open role UI → People → message compose (draft only) | Sending a real message |
| 6 | Support | Cheer them on flow → Back this on raising project | **Card form / live Stripe** — cut away or use test mode |
| 7 | Fund | `/fund/:slug` CTA | — |
| 8 | Monthly grant | `/give` choose → plus-up chips → Skip | Live card on plus-up |
| 9 | Events | Events list → RSVP → Host an event | — |
| 10 | Close | End card (designed in Remotion) | — |

## Existing footage to reuse

- `docs/features/mocks/member-directed-giving/walkthrough.mp4` — ~60s of giving pages on a local test backend (on the member-directed branch). Use for beat 8 if live `/give` isn't ready to film cleanly.

## B-roll (optional, live cut)

- Events with creatives who agreed to appear
- Hands at work (same spirit as creatives.exchange intro: tools, not faces, unless cleared)
- Room / gathering stills that feel like a furnished living room

## Do not film

- Production card forms while Stripe is on a test key
- Connect payout landing in a bank (show **Get paid** in Settings › Money only if needed; not in this how-to's main path)
- "Test Account" / Sign-up Test class on production
- Real backer amounts, DMs, or money without consent
- Public-ledger / leaderboard framing

## Remotion notes

- Captions = on-screen column from `script.md` (six words max)
- UI recordings as screen movies or high-res stills in `public/`
- Leave audio track empty; drop voice file later aligned to beat timestamps
- Chapters: Open · Join · Post · Support · Monthly grant · Close
