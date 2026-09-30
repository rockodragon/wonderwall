# Member-directed giving: each month a member picks who gets their half

Spec, 2026-09-30. Decided in this spec unless marked **open**; Rick vetoes by line. **Built** in the PR that carries this doc, and unit-tested. **Not live** until it is merged and the Convex backend is deployed to production (nothing deploys it automatically), and the money half has **not** been run through Stripe test mode.

Working name for decks and partner talks: the generosity engine. Members never see that phrase. They see "you have $5 to give."

Flow and screens: the UX spine is in `_bmad-output/planning-artifacts/ux-designs/ux-wonderwall-2026-09-30-giving/` (EXPERIENCE.md, DESIGN.md); the key-screen mocks are in [mocks/member-directed-giving/](mocks/member-directed-giving/index.html). The pages were built from them and walked signed-in on a local backend.

## What this is

Half of a member's dues already funds grants for other creatives (`CLAIMS.dues`). Today a committee decides where all of it goes. This feature hands that half back to the member, one month at a time: when their membership is billed, they get a notice that they have that half to give. They pick a creative, pick a project, or leave it in the grant fund. If they do nothing, it stays in the fund. Then we ask them to add more of their own money, once or monthly.

The model is Kiva's re-lend credit (a small fixed amount, a named person, a monthly nudge) on top of a member-directed fund (what nobody directs, the committee grants). It is not GoFundMe: nobody has to ask. The money exists first and the member assigns it. It is not TOMS: the member picks, not us.

The plus-up is the metric. A member who gives their $5 and then adds $20 of their own has changed behavior. Every plus-up is recorded against the gift that prompted it, so the audit can say how many members did that, how much, how often, and whether they kept doing it.

## Words

- Member-facing: **give**, **back**, **your half**, **the grant fund**. The notice says "You have $5 to give this month."
- Never "gift" or "donate" for money that moves through our checkout. Those words stay on the Sophia Fund's own giving links (Abiding Practice, tax-deductible), the same rule the backing modal and pool checkout already follow. This doc uses "gift" only as the name of the database row.
- The dollar amount in copy is always computed from the member's own invoice, never typed. A membership will not always be $10.

## How it works

**The trigger.** Every paid membership invoice (the first one and every renewal) already writes one `dues_share` row to the community's pool. In the same webhook call, the pool share of that invoice becomes one `memberGifts` row for that member, status `open`. The Garden's pool share is 50%, so a $10 membership opens $5. A community with no pool share opens nothing.

**The notice.** One in-app notification and one email per opened gift: "You have $5 to give this month," linking to `/give`. Email category `activity`, so it respects the member's email settings. The in-app notice always shows. `/join/success` and `/today` show the open amount while it is open.

**The choice, on `/give`.**
- *A creative.* Any active member of the same community except yourself. Search by name. The creative does not need a paid membership.
- *A project.* Any active passion project in the community except your own. The money shows on the project as a confirmed backing.
- *The grant fund.* Explicit. Nothing moves; the money is already there.
- With a creative or project: an optional note (200 characters) and named or anonymous, the same choice backers already make.

**What the recipient gets.** The full amount. The platform took its 10% on the dues; there is no second bite. The money reaches them through Stripe Connect (next section). A project-directed gift shows on the project as a confirmed backing with no platform share and adds to the project's raised total. The recipient gets a notification and an email: "Dana gave you $5" or "Someone gave you $5."

**The default.** A gift left `open` goes to the fund when the member's next gift opens for the same membership, or 35 days after it opened, whichever comes first. A daily sweep does it. The notice and the page both say so in plain words. The row records that the member did not choose (`decidedBy: "default"`), which the audit counts separately from a member who chose the fund.

**The plus-up.** Right after a decision, the page asks for more toward the same target:
- To a creative: `createGiftCheckout`, one-time or monthly. Money rules are the backing rules: 90% to them, 10% platform, card processing on top (`CLAIMS.backing`, `CLAIMS.processingFee`). Renewals land through `invoice.paid`.
- To a project: the existing backing checkout on that project, one-time or monthly, tagged with the gift it came from.
- To the fund: the Sophia Fund's own one-time and monthly giving links, tagged with the member and the gift in the link's client reference so the Abiding Practice webhook records who added what. 100% to the fund, tax-deductible (`CLAIMS.grantFundDeductible`). This is the only plus-up that never touches our account.

**The ledger.** Directing the amount to a creative or project writes a `member_gift_out` row on the community's pool (`grantContributions`, negative pool cents) so the pool balance stays honest. Leaving it in the fund writes nothing. Plus-ups write the rows their checkout already writes, plus a `memberGiftId` link.

## How the money moves: Stripe Connect

Payouts run through Stripe Connect, separate charges and transfers (`backing-payouts.md`, decided direction). Nothing is paid by hand.

- **A creative connects once.** Settings › Money has "Get paid": it opens Stripe's Express signup (identity and bank). We store the connected account id on their profile and whether Stripe says payouts are enabled. The first time someone is owed money and has not connected, the notice says so: "Dana gave you $5. Connect your bank to get it."
- **We charge first, transfer later.** Dues, backings and gift plus-ups are charged on the platform account, the way they are today. Each amount owed to a creative is one ledger row (`giftPayments` for gifts, `backingPayments` for project money). A transfer sweep moves owed rows to the creative's connected account, one Stripe transfer per row, keyed on the row id so a retry never pays twice. The sweep runs right after a row is written, when a creative finishes connecting, and nightly.
- **The $50 minimum holds.** A creative is transferred when their owed total reaches $50 (the decided minimum, set to cover Stripe's $2 active-account month). An operator can transfer under the minimum when someone leaves or asks. Stripe deposits to the bank on its schedule; the creative sees it in a Stripe-hosted dashboard we link to.
- **The ledger already knows how to count it.** A transfer writes a `creativePayouts` row (reference `stripe:tr_…`, no operator), so "owed" is still what it was: what they earned minus what was paid, whether by hand or by Stripe.
- **Not connected yet.** Money waits as owed. Nothing is refused and nothing is dropped. A reminder goes with the next gift received. **Open:** a claim deadline after which an unclaimed gift returns to the fund.
- **Taxes.** The platform files any 1099s (platform-pays pricing). Nobody is near a threshold at launch.
- **Card only on our checkouts,** so a completed session always means the money is in our balance to transfer from.

**Rules.**
- No directing to yourself or your own project.
- One gift per paid invoice. A replayed webhook opens nothing twice (keyed on the invoice id).
- A covered seat (a church paid for it) opens nothing today, because the coverage invoice writes no dues share. **Open** below.
- A past-due membership has no paid invoice, so nothing opens. A membership canceled with a gift still open keeps that gift until it is decided or defaults.
- A recipient who leaves the community or deletes their account keeps their owed row, unassigned, for an operator to resolve. Nothing is dropped.

## Setting up Stripe for this (ops, not code)

1. In the Connect settings of the platform's Stripe account, turn on Express accounts and set **platform handles pricing**. Express onboarding uses the account's default branding.
2. On the platform's existing webhook endpoint (`/stripe/webhook`), add the event `account.updated` and enable "connected accounts" events, so a creative finishing onboarding is recorded without waiting for the nightly refresh or their return to Settings.
3. Set the payout schedule for connected accounts to Stripe's default (daily, automatic). The $50 minimum is enforced by our transfer sweep, not by Stripe.
4. Test mode: a transfer needs an available platform balance. Make one test charge with the `pm_card_bypassPending` card first so the balance is there.
5. The Sophia Fund's one-time and monthly Payment Links (already on the org row) need no change; `/give` appends the member reference to them.

## What we measure

The audit lives in the data, not only in PostHog. `getGivingReport` (operator, on `/admin/ledger`) shows, per month:

| Column | What it counts |
|---|---|
| Opened | gifts opened (paid invoices with a pool share) |
| To a creative · to a project · left in fund · defaulted | where each went |
| Decided within 7 days | how fast people act |
| Distinct recipients | whether money spreads or piles on a few |
| Plus-ups · plus-up dollars · monthly plus-ups started | the behavior change |
| Plus-up rate | plus-ups ÷ gifts directed to a creative or project |
| Repeat givers | members who directed last month and this month |
| Repeat plus-ups | members who plussed up last month and this month |

Per member, the same table lists months directed in a row and total plussed up, largest first. PostHog gets the funnel events (`giving_notice_opened`, `giving_decided`, `giving_plus_up_started`) with the target type, never an amount or a name.

## What could go wrong, and what the spec does about it

- **Two members pay each other $5 forever.** Nothing is gained: the platform already took 10% of the dues and takes 0% on the gift. Self-directing is blocked; pairs are harmless.
- **The same three people get everything.** The report's distinct-recipient column shows it. **Open:** whether the picker should surface people who have not been backed this month.
- **$5 pieces at scale.** A hundred members is $500 a month in small rows. Transfers into a connected account are free and automatic; the $50 minimum keeps Stripe's $2 active-account fee from eating the margin.
- **The default feels like a trick.** The notice states the default in the first two lines. The page keeps a full history: month, what you did, what you added.
- **Email fatigue.** One email per billing. It respects the activity setting; the in-app notice remains.
- **Fraud.** The allowance moves no new money. Plus-ups go through Stripe Checkout with the same protections as backings.
- **Taxes.** A directed $5 is dues redirected, not a donation, and not deductible. To the recipient it is income, the same as a backing (`backing-payouts.md`). A fund plus-up through Abiding Practice is deductible because it is a gift to a 501(c)(3), and the copy says only that.
- **Legal exposure.** Same as backings: money lands in our account and is owed onward. No new exposure.
- **Refunded dues.** The gift stays. An operator adjusts by hand. Listed under gaps.

## Open questions

1. **Covered seats.** A church-covered member has a full seat. Do they get $5 to give from the church's money? Recommendation: yes, once the coverage invoice fans out per redeemed seat. Not built.
2. **Should the picker nudge toward people nobody has backed this month?** Fair-share against popularity. Build after the first report shows concentration.
3. **Matching.** A church or patron matches every member-directed $5. This is the growth play the model sets up. Not built.
4. **Other communities.** The Garden's fund plus-up goes to the Sophia Fund. A community without an Abiding Practice fund needs the in-platform pool checkout, which is one-time only today.

## Known gaps in what was built

- Class money (`classPayments`) is not in the transfer sweep yet; it still pays out by hand. Adding it is the same code path.
- A transfer reversal (refund after payout) is by hand in the Stripe dashboard.
- Connect account events (`account.updated`) are read when the creative returns from Stripe and nightly; the webhook endpoint for connected-account events is an ops step, not code.
- A refund of a membership invoice does not close or reverse its gift.
- The fund page for the Sophia Fund lists dues pool shares nowhere; that gap predates this feature. Member-directed rows land on The Garden's pool row.
- The Abiding Practice webhook attributes a fund plus-up to a member only when the member clicked through from `/give` (the link carries the reference). A member who types the fund URL by hand is a plain gift, unattributed.
- Card only on `createGiftCheckout`, same reason as classes: a delayed bank debit would complete unpaid and record nothing.
