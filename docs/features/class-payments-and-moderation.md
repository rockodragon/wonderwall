# Classes and coaching: who can offer, how the money moves, how a community steps in

Spec, 2026-09-19. Decided by Rick on 2026-09-19 unless marked **open**. **Built** in the PR that carries this doc, and unit-tested. **Not live** until it is merged and the Convex backend is deployed to production (nothing deploys it automatically), and the money half has **not** been run through Stripe test mode.

## What this covers

"Classes & Coaching" in the app (`/offerings`, nav label "Learn") is the `offerings` table. Its formats are class, coaching, workshop, mentorship and other. One mechanism covers all of them, so every rule below applies to coaching too.

Tables (`gardenTables`, `/tables`) are the older build of the same idea. This spec does not touch them (bead wonderwall-jxho).

## Who can offer

- Any signed-in member can offer a class or coaching. No paid membership and no host status are needed.
- To post into a community, the member must have joined it. The code already enforces this (`assertCommunityMember`). A post with no community is allowed.
- A free class is free to offer. A paid class is the same. We take 10% only when the money goes through our checkout.
- **Dropped:** "every community keeps at least one open, free class." It came from the old Table-host mock, nothing enforced it, it put a rule on communities we don't run, and public events are already the front door.

## Money

- One payment per sign-up. The price is the offering's `priceCents`.
- The student pays the price plus card processing, added on top as its own line item (`CLAIMS.processingFee` wording, `backingProcessingFeeCents` math). The teacher is owed 90% of the price and the platform 10% of the price (`splitHostSale`).
- Each Stripe payment becomes one `classPayments` row, keyed on the checkout session id so a replayed webhook does nothing. It is owed to the teacher until an operator records a payout. Payouts are by hand for now, the same as backings and community products. Owed amounts show wherever the operator ledger and the creative "owed" view already show backings.
- The webhook reads the class price from checkout metadata, never from Stripe's total (the same rule as backings, because the total includes the processing line).
- A sign-up moves from `pledged` to `confirmed` when the payment lands.
- **Unchanged:** a class with an outside payment link ("Jenna's case") sends people there, we record the sign-up, and we take nothing. **Open:** this lets a teacher skip the 10%.
- **Not built:** monthly classes, guests paying (sign-up needs an account), refunds in code (an operator refunds in Stripe by hand), a Connect payout.
- Same exposure as backings: the money lands in our Stripe account and is owed onward (see `backing-payouts.md`). Connect replaces the hand payout later without changing the checkout.

## How a community steps in

- Members post freely. There is no pre-approval. Hosts are volunteers, a queue stalls, and joining the community is already the trust step.
- A community host (or a legacy moderator) can pause a class in their community. So can a platform admin. A paused class:
  - is hidden from the class list and the community page for everyone except its teacher, that community's hosts, and admins;
  - takes no new sign-ups and no payments;
  - shows the teacher who paused it and why;
  - can be restored by the hosts. Existing sign-ups stay.
- Any signed-in member can report a class: a reason and up to 500 characters. The community's hosts see open reports on the class page. A report on a class with no community goes to platform admins.
- Refunds for a paused paid class are by hand.
- **Open:** a per-community switch "new classes need a host's OK first". Build it if a community asks.

## Open questions

- What the person running a class is called. The brief says "host" (a person who runs a class). The code's community role "host" means the community's leader.
- Community products (`createProductCheckout`) still take "10% including processing" and don't add card processing on top. Classes will, so the two will disagree until products are brought in line.
- Should a teacher who is a paid member keep 100%, the way the gig board works? Not decided.

## Known gaps in what was built

- Refunds don't reduce what a teacher is owed, and a payout can't be negative. A refunded class payment stays owed until an operator adjusts it by hand.
- Two checkouts opened and both paid by one student give two payment rows, both owed to the teacher. The "already signed up" check only stops one after the other.
- Card only. A delayed method (bank debit) would complete unpaid and the webhook would record nothing, so class checkout asks Stripe for cards. Backings and community products don't restrict this.
- The 10% on classes doesn't appear in the platform fee report on `/admin/ledger`. It counts toward what the teacher is owed and appears on the per-person rows, the same as backings today.
- A payment that was already in flight when a class was paused is still recorded (the money was taken). An operator refunds it by hand.
- "Message participants" still reaches people who started checkout and never paid (see `announcements-prd.md`).
- `signupCount` on a class now counts confirmed sign-ups only, so old pledges and abandoned checkouts don't show as "signed up".
- Hosts only see a report when they open the class page. There is no email and no report queue.
- A teacher can post a new class after theirs was paused.
