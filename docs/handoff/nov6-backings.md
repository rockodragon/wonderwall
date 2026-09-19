# Handoff: backings for Nov 6

Written 2026-09-18. Every statement is tagged:
**(checked)** = verified in code, git, Stripe's own pages, or Rick said it ·
**(likely)** = strong inference, not verified ·
**(guess)** = filling a gap.

## The goal

- (checked — Rick, 2026-09-18) Backings are huge for Nov 6. People in the room must be able to back a
  creative they just watched, on their phone, right then.
- (checked — Rick) Money in has to be accounted for: a clean story and clean ledgers. Sending creatives
  their money by hand is fine if needed.
- (checked — Rick) Nothing gets turned off.
- (checked — playbook) Nov 6 is a ticketed fundraiser for the Grant Fund at Lightchurch in Encinitas,
  with a free livestream.

## Already decided

- (checked — bead wonderwall-p7uf) The platform keeps **10% of each backing, 5% on any part above
  $1,000**. The backer pays card processing **on top**.
- (checked — Rick, 2026-09-18) **$50 minimum** payout to a creative's bank. Smaller amounts roll over.
- (checked — Rick) Transfers to creatives can be sent by hand.
- (checked — bead wonderwall-cizg) "You keep 100%" is dead. Never sell a public ledger or "every dollar
  is public" — it could cost donors. Project pages **may** show totals and named backers, with an
  anonymous option.
- (checked — docs/features/backing-payouts.md) Use Stripe Connect "separate charges and transfers" to
  pay creatives. Backers keep paying on our Stripe account; creatives get paid from it.

## What's already built

- (checked) Backing checkout on Stripe, once, monthly and yearly, with patron tiers —
  `createBackingCheckout` in `app/convex/garden/stripe.ts`.
- (checked) The webhook confirms each backing and adds to the project's raised total —
  `handleBackingCheckoutCompleted` in `stripeHandlers.ts`.
- (checked) **PR #15**, ready to merge, with the split in it (commit b1aae57):
  - A record of what each creative is owed for every payment, **including each month of a monthly
    backing**. Before this, only the first month was recorded anywhere.
  - A record of payouts made by hand.
  - "Creative earnings" on `/admin/ledger`: owed vs paid per creative.
  - A one-time backfill for older backings. (checked — Rick) Nothing has been collected yet, so it
    has nothing to do.
- (checked — merged in PR #12) Rich project pages and updates with photos and video. That's the story
  on stage.
- (checked) New projects get a public `/story/:slug` link when they're created.

## What's missing for Nov 6, in order

1. **Signed-out people can't back anyone.** Bead **wonderwall-uh90**, P0.
   - (checked) `createBackingCheckout` stops anyone not signed in: "Sign in to back a project."
   - (checked) `startBacking` in `support.ts` requires a user id.
   - (checked) Signup is invite-only, so a guest can't just make an account in the room.
   - (checked) The webhook can already record a backing that has no user.
   - (guess) Small build: a guest path through code that mostly exists.
2. **The public story page has no Back button.** Bead **wonderwall-ke37**.
   - (checked) The Support button is on `/projects/:id`, which needs a login.
   - (checked) `/story/:slug` is public but can't take a backing.
   - (checked) The build: add Back (amounts, once or monthly, anonymous option) and show the total and
     named backers.
3. **A QR code per performer.** Bead **wonderwall-2fti**.
   - (likely) Projects created before story links were added may be missing one. Check every performer's
     project.
4. **Card processing on top.** Existing bead **wonderwall-p7uf**.
   - (checked) Checkout adds nothing on top today.
   - (checked — the bead's own numbers) Without this, Stripe's fee comes out of our 10%. On a $55.56
     backing we'd keep about $1.27 instead of $3.18.
5. **Creatives set up payouts.** Bead **wonderwall-qpni**, part of bead wonderwall-7avu.
   - (checked) There is **no** Stripe Connect code on any branch, worktree or stash. A search for Stripe
     accounts, account links, transfers and payouts found nothing real.
   - (checked) The charge side is the part that's done. This bead is the other half: create the
     creative's Stripe account, send the setup link, and hear back when it's ready.
6. **Send the money.** Bead **wonderwall-7ync**.
   - (checked) A "Send payout" button on `/admin/ledger` that moves what a creative is owed to their
     Stripe account and records it as paid. It uses PR #15's tables.
7. **Shared links preview as the home page.** Existing bead **wonderwall-4u4y**, currently P2.
   - (checked — fetched as Slack's link bot) Shared `/story` and `/fund` links show the home page's
     title.
   - (likely) This matters on Nov 6, when people share the creatives they backed. Recommend raising it
     to P1.
8. **Dry run on real phones.** Bead **wonderwall-vg4s**.
   - Waits on 1, 2, 4 and 6.
   - (guess) Plan it for at least a week before Nov 6, so there's time to fix what breaks.
9. **Copy sweep.** Existing bead **wonderwall-cizg**.
   - (checked) The playbook, `/for/*` pages, `/grant-program`, `/fund` pages and the home page still
     carry the "you keep 100%" and public-ledger lines.

## Rick's calls, off the keyboard

- **Call Stripe.** Bead **wonderwall-sc15**, P0.
  - (checked — stripe.com/legal/restricted-businesses) Collecting money on our account for other
    people's work is on Stripe's prohibited list.
  - (checked — same page) "Crowdfunding platforms" need approval from Stripe sales.
  - (likely) Using Connect is the approved way to do what we're doing, but Stripe has to confirm.
- **Lawyer/accountant.** Bead **wonderwall-fpmn**. Three questions (all checked — from
  docs/features/backing-payouts.md):
  - Is a backing a payment for goods or services, and does Connect fully cover us?
  - Does Stripe calling us crowdfunding change anything?
  - Which tax form do we send, and is a backing income or a gift?

## If Connect isn't ready by Nov 6

- (checked — Rick) Transfers can be sent by hand.
- (checked) Backings still land on our Stripe account and PR #15 records who is owed what, so every
  dollar in is accounted for from the first backing.
- (likely) The safe manual path is still through Connect: a creative sets up payouts, and an operator
  sends their transfer from the Stripe dashboard or the "Send payout" button.
- (checked — Stripe's prohibited list) Paying creatives by hand from our own bank (Zelle, check) is the
  risky path. Ask Stripe on the call before doing it.

## What each money event looks like

(checked — PR #15's `splitBacking` and the $50 minimum)

- $100 backing: the backer pays $100 plus card processing, the platform keeps $10, the creative is owed
  $90.
- $2,000 backing: the platform keeps $100 on the first $1,000 and $50 on the rest, $150 total. The
  creative is owed $1,850.
- Payout: once a creative is owed $50 or more, their money goes to their bank.
- (checked — stripe.com/connect/pricing) Stripe charges us $2 for each creative in any month it pays
  their bank, plus 0.25% + 25¢ per payout.

## Open PRs

- (checked) **#15** — owed ledger + decided split. Merge before building 6; it needs these tables.
- (checked) **#16** — photo-less project cards on phones, owner tools open on demand.
- (checked) **#17** — this doc and docs/features/backing-payouts.md.

## Where things live

- Backing checkout: `app/convex/garden/stripe.ts` (`createBackingCheckout`)
- Backing rows and guest path: `app/convex/garden/support.ts` (`startBacking`)
- Webhook: `app/convex/garden/stripeHandlers.ts`, with its in-memory test fake in
  `stripeHandlers.test.ts`
- Owed ledger (PR #15): `app/convex/garden/payouts.ts`, `backingPayments` and `creativePayouts` in
  `schema.ts`
- Operator view: `app/app/routes/admin.ledger.tsx`
- Public story page: `app/app/routes/story.$slug.tsx`; project page (login): `app/app/routes/projects.$id.tsx`
- Payout research and sources: `docs/features/backing-payouts.md`
- Dev setup: all checkouts share the cloud dev Convex deployment `giant-wildebeest-814`, and whoever
  pushes last wins, functions included (checked, 2026-09-18). Use launch config `app-dev-seeded`
  (port 5175). `app-dev` (5173) points at **production** Convex.
