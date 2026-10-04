# /pricing — what each level can do, and where the docs disagree

Status, 2026-10-03: built on `claude/pricing-page` (cut from `tables`). Not linked anywhere, and `noindex`, until Rick approves the eight new claims it uses (claims.md, "Added 2026-10-03").

## What the page says

Three levels, from the plan (§2–3 and its Tables update):

| | Free account | Member (The Garden, $10 a month) | Sponsor seats ($10 a seat, a month) |
|---|---|---|---|
| Who | Everyone | Creatives who want paid work and backing | Churches, businesses, patrons |
| Adds | Profile, browse, back, post projects/paid work/events, set a free one-time Table, join an open paid Table, 5 new conversations a day | Apply to paid work and gigs, ask a grant fund, charge for or repeat a Table, members-only Tables, sell tickets, choose your monthly grant, 50 new conversations a day | A code per person; each code is a full membership |

Then "What we take" (membership, backing, paid Tables, paying directly), a Free/Member comparison, and six questions. Every money sentence is a claim. Each row was checked against the server on `tables`. The cards and the comparison come from one list, so they can't drift apart.

## New claims it needs (Rick to approve)

per community · tables, free · tables, paid · tables, join paid · table split · table processing fee · tickets · direct pay. Wording is in `docs/marketing/claims.md`.

## Where the plan, the code and the pages disagree

Tagged by how sure we are. "Plan" = `creatives-exchange-discussion-brief.md`; "code" = branch `tables`.

**Decide before linking /pricing**

1. **`/join` sells levels the plan doesn't have.** [Certain]
   - It shows four cards: Free, Member $10, "Five projects" $25, "Community Host" $50.
   - The $50 card says "Create tables", which contradicts the Tables rules.
   - The plan has one membership per community, and claims.md's "Never say" #10 bans a host price.
   - The server treats all three paid levels alike (`capabilities.ts:45-59`).
   - `/pricing` shows only Free / Member / Sponsor, so the two pages disagree until `/join` is fixed.
2. **"Hosting is free" (claim `host split`) vs. the Tables rule.** [Certain]
   - Charging for a Table, or running one that meets again, needs membership (`tables.ts:686-695`).
   - `/for/hosts` also still says hosting is waitlist-only, but any free account can now set a free Table. "Never say" #10 is out of date for the same reason.
   - Proposed fix: make **host split** "You keep 90% of what you sell", and use the new Tables claims for who can host.
3. **"Membership is $10 a month" (claim `membership`) reads as universal.** The plan says each community sets its own price.
   - The code can't sell a seat in any other community: `join.tsx` never passes a community, and `hostOrgs.seatPriceCents` is never read. [Likely]
   - So members-only content in a second community (SD) would need a seat nobody can buy.
4. **Card processing on dues.** [Certain]
   - The plan says the payer covers card fees on everything.
   - The code adds them on top only for backings, gifts, classes and Tables. Dues, tickets, pool contributions and community products absorb them.
   - The page says nothing about card fees on dues. Pick one rule.
5. **Posting projects.** [Likely]
   - `/join` sells "Post a project and get backed" as member-only.
   - The plan says "members can be backed by patrons".
   - The server lets any account post a project.
   - Decide whether being backed needs membership. `/pricing` lists posting as free and doesn't list "receive backing" at all.
6. **`/for/partners` says "Business sponsorships start at $100 a month."** That isn't a claim, isn't in the plan, and isn't in the code.

**Code fixes (no decision needed)**

7. **Table price cap disagrees.** The create form allows $10,000 (`tables.new.tsx:92`); the server caps at $5,000 (`tables.ts:678`).
8. **`SPLITS.dues` is stale.** It still says 50/50 (`capabilities.ts:209`); the code splits 10 / 40 / 50. Only demo routes read it.
9. **The capability list is mostly unenforced.** `table.create`, `project.create.*`, `seat.cover` and `fellowship.fund` have no server callers, and `resolveTableJoin` is dead code.
10. **Ticket gating can be skipped with an outside ticket link.** `isFreeEvent` ignores `externalTicketUrl`. [Likely]
11. **Covered seats never end.** A canceled or suspended sponsor code leaves member rows active (`stripeHandlers.ts:1607-1675`), and operators can mint unpaid "manual" codes.
12. **Redeeming a coverage code is blocked by a membership in any community,** though everything else checks per community.

**Money the code records but can't pay out yet** [Certain]

13. **The community's 40% of dues** is recorded (`groupCents`) with no way to pay it out.
14. **A Table or class host's 90%** sits on the owed ledger. Automatic payouts (Stripe Connect) cover only gifts and backings.
15. **Event tickets** have no platform fee and no organizer payout. Money goes to the platform or a beneficiary (`ticketRouting.ts`).
16. **The member-directed amount** is the pool share of dues after card fees ($4.71 on $10), while the dues ledger records $5.00. The claim "half of your membership" is close, not exact.

**Gaps in the docs**

17. **Messaging limits** (5 vs. 50 new conversations per rolling 24 hours, replies free) are in the code but in no plan doc. `/pricing` lists them.
18. **No doc says** what posting paid work costs a business, what the platform takes on event tickets, or whether billing is ever annual. The plan mentions annual billing; the code sells monthly only.
19. **Vocabulary.** The plan's Language section says the gathering word is **Class**, while the product now ships **Tables** ("Set a Table", "Pull up a chair"). Pick one for receipts and copy.
20. **The plan's §7 "Where the build stands" is stale.** It cites 237 tests (now about 2,800) and says Stripe awaits live keys.
21. **The product plan** still has the $50 host price. The docs index already flags this.

## The Tables implementation plan doc, specifically

- **Present and future mixed.** Line 3 says the MVP is built, but the body still reads as a proposal ("Proposed", slices 0–5, "Decisions still open"), and no slice is marked done.
- **One decision already made in code.** It calls Tables with no community "a creator-policy decision", but the code already allows free Tables with no community (`tables.ts:686`).
- **Stale and stray text.**
  - The "orientation baseline" (7 files, 346 tests) predates the build.
  - The closing "Follow-up validation for the title change" paragraph is about the Sophia Fund title, not Tables.
- **Missing money rules.** It doesn't say what the platform takes on Table payments. The code: 90% host, 10% platform, card fee on top.
