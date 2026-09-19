# What we say about money

v1 · 2026-09-18 · owner: Rick

Every sentence we say about money is defined here, word for word. Do not write a new money sentence anywhere else.

**To change a number or a promise:** change it here and in `app/app/constants/claims.ts`, then fix the hand copies listed under "Where these sentences live." The test suite checks them.

## The claims

| Name | The sentence |
|---|---|
| **what it is** | creatives.exchange is where creatives find paid work, get backed by people who believe in them, and apply for grants. |
| **join** | Joining is free. |
| **backing** | When someone backs you for $100, you get $90. The other $10 runs the platform. |
| **backing, short** | You keep 90% of what a backer gives you. |
| **large gift** | On the part of any gift over $1,000, we take 5%, not 10%. |
| **payout** | For now we keep track of what you're owed and pay it out to you ourselves. |
| **host split** | Hosting is free. You keep 90% of what you sell. |
| **membership** | Membership is $10 a month. It lets you apply to paid work, respond to gigs, and ask a grant fund to back your project. |
| **dues** | Half of your membership funds grants for other creatives. |
| **dues, other half** | The other half keeps this running. |
| **pool** | Half of every membership funds grants for other creatives. Members propose projects, and a review team decides. |
| **grant fund** | The Garden's grant fund is run by Abiding Practice, a 501(c)(3), so gifts to it are tax-deductible. About 87% of each gift is granted. |
| **patron** | Back a specific person or project. 90% goes to them. You can be named on the work, or stay anonymous. |
| **coverage** | $10 a month covers one creative's membership. A covered membership is a full membership. |
| **partner** | Post paid work with the pay stated up front, or offer your space. Creatives respond, and you pick. |
| **the garden** | The platform is open to any creative. The Garden is the Christian creative community on it, and it is where this started. |

## Where these sentences live

**Imported, so they change with `claims.ts`:** the home page, the `/for/...` audience pages, `/ia`, and the demo pages (`demo.create`, `demo.join`, `demo.host.dashboard`).

**Hand copies, because the file can't import anything.** Change these by hand when a claim changes:

| Surface | What it carries |
|---|---|
| `app/public/about/` (static HTML: index, creatives, hosts, patrons, partners) | **dues**, **host split** |
| `docs/flyers/` (creative, operator, patron) | **dues**, **host split** |
| `app/convex/garden/capabilities.ts`, `SPLITS.duesSentence` | **dues** (the server can't import from the app) |
| Emails and texts in the [outreach playbook](constituent-playbook.md) | whichever claim the message uses |

**What the test checks** (`app/app/constants/claims.test.ts`): the server's dues sentence matches **dues** exactly; the static about pages that state the dues line use the canonical words; and no site source, static page, or flyer contains a phrase from "Never say," or a host price. The playbook's emails are not machine-checked.

**On "dues, other half."** It is loose on purpose. The plan splits the other half between the community and the platform. The code today sends all of it to the platform (`duesSplit` in `stripeHandlers.ts`). "Keeps this running" is true either way and promises neither. Do not write "$4 runs your community" until the code sets that money aside.

## Never say

1. **"You keep 100%" or "the backer covers our fee."** Dropped 2026-09-18. The platform's share comes out of the backing.
2. **Anything that sells money being public.** No "public ledger," "in the open," "see every dollar," "show the receipts," or "every grant is published." A fund page lists the grants it made. A project page shows its total and the backers who chose to be named. We do not pitch either one.
3. **Any payout speed.** No "immediately," no "instant," no dates. See **payout**.
4. **A promise to a person.** "Get your work funded" describes the platform and is fine. "Your project will get funded" is a promise we can't keep. No dollar figure someone will earn.
5. **Claims we can't prove.** No "no other platform does that." No "real rails." No reach numbers.
6. **"Donate,"** except for the grant fund. Everywhere else the words are **back** and **fund**. Backing a creative is not tax-deductible.
7. **"Raffle," "drawing,"** or anything chance-based. Grants are judged or voted.
8. **"Artist."** The word is **creative**.
9. **Internal splits** beyond **dues**. No fixed dollar amounts for the split, and no "runs the place." A membership will not always be $10.
10. **Host pricing.** Hosting is not open for sign-up yet; hosts join a waitlist. Say **host split** and nothing about a paid host plan.
11. **The membership as the way in.** The way in is free.
