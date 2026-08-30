# Entity structure — background research

*Prepared 2026-08-30 · for the attorney/CPA conversation, not a substitute for it*

> **This is not legal or tax advice.** It's general, publicly-available background to bring to a real attorney and CPA, written without visibility into jurisdiction, the actual equity terms being discussed with Haley and David, or the platform's finances. Nothing below should be treated as a decision. See wonderwall-sxi and `docs/the-exchange-v1-prd.md` §17 for how this became urgent.

## 1. Why this doesn't fit in one entity

The Exchange is trying to do three things at once:

- **(a)** Accept donations that feel charitable and come with a tax deduction, flowing into a grant pool for creatives.
- **(b)** Run a for-profit business — memberships, marketplace fees, sponsorships.
- **(c)** Give Haley and David (and possibly others) real equity with upside.

(a) and (c) pull in opposite directions. A 501(c)(3) exists *only* to serve a public charitable purpose — donors get a deduction precisely because no private individual owns a piece of it or profits from it (more in §2). A for-profit company exists to make money for its owners, which is what makes (c) possible but disqualifies it from ever issuing a tax receipt itself. One legal container can't hold both properties at once — a structural fact of the tax code, not a preference.

This is well-trodden: mission-driven platforms, creator-economy startups with a giving component, nonprofit newsrooms, and open-source projects hit it constantly, and a few patterns have emerged:

- **For-profit parent + independent nonprofit affiliate.** Two separate legal entities, each with its own board — real independence matters to the IRS, since heavy overlap in leadership can look like the nonprofit is just the company's marketing arm. GoFundMe is the clean public example: GoFundMe Inc. is the ordinary for-profit with investors and equity; GoFundMe.org is an independently governed 501(c)(3) that raises and grants charitable funds. Neither owns the other.
- **Fiscal sponsorship — use someone else's 501(c)(3) instead of forming your own.** An existing nonprofit houses your charitable activity, collects tax-deductible donations, and grants the money out under its own exempt status, for a fee (often 5–10% of funds processed). This is how open-source projects like NumPy and Jupyter operate under sponsors like NumFOCUS, and how Open Collective's "fiscal host" model works. The product already has an informal cousin of this: per `docs/phase-1b/spec.md` D3, the AP fund lane links out to Abiding Practice's own giving platform and lets AP issue the receipt and decide allocations — The Exchange isn't the charity there, AP is.
- **Stay a single for-profit (optionally a Public Benefit Corporation or B-Corp for mission signaling) and route giving through a donor-advised fund (DAF) partner** — a community foundation or DAF platform that accepts donations, issues receipts, and grants funds to creatives/projects the company recommends. No nonprofit of your own to govern.

None is "the" answer — they trade off differently on cost, speed, control, and how much it feels like The Exchange itself is the charity versus a company that points people to one.

## 2. What founder equity changes

A 501(c)(3) has no owners. It can't issue stock, can't distribute profit to individuals, and nobody — not founders, not staff — holds an equity stake in it. This is the price of the deduction: the IRS grants tax-exempt status *because* the organization's assets are permanently dedicated to a public purpose, not to any private person's gain (also why a nonprofit's assets can't simply be handed to a for-profit or its founders if it ever winds down).

So "the business Haley and David have a stake in" can only be the for-profit entity — never a 501(c)(3), and never an LLC structured to qualify for tax-exemption (which requires its members to also be non-equity, effectively other nonprofits). Any charitable/grant-pool piece has to sit in a genuinely separate structure nobody, including the founders, owns equity in. That's why wonderwall-sxi's original Foundation + LLC split makes structural sense as a starting shape, independent of which specific variant — owned subsidiary, independent affiliate, fiscal sponsorship, DAF partner — ends up right.

## 3. Timing: what actually fits the calendar

| Option | What it means | Rough timeline | Fits Week 2? |
|---|---|---|---|
| For-profit only now, nonprofit later | Launch the membership/marketplace business now; revisit a Foundation or DAF partner once the grant pool needs its own deductibility | Days | Yes |
| Stand up both now | File for 501(c)(3) status alongside the for-profit | Months — IRS Form 1023 clears in ~6 months for 80% of filers, longer if flagged for follow-up | No |
| Fiscal sponsorship as a bridge | Route donations through an existing 501(c)(3) (sponsor takes a cut) until a standalone Foundation is worth it | Weeks | Yes |

Per `docs/the-exchange-v1-prd.md` §17, payments (the $10/mo membership and financial support types) turn on in Week 2, after the soft launch around 2026-09-06 — days from now. A standalone 501(c)(3) application clearly can't clear in that window. If the general grant pool needs to feel genuinely tax-deductible by then, **fiscal sponsorship is the option whose timeline actually fits and is worth raising with the attorney first** — not because it's necessarily the right long-term call, but because it's the only charitable-donation path physically possible on this schedule. For-profit-only-for-now also fits, just by deferring the deductibility question rather than solving it. Standing up a full 501(c)(3) before Week 2 isn't on the table regardless of preference.

## 4. Questions worth bringing to the attorney and CPA

Extending wonderwall-sxi's existing list (timing, entity relationship, licensing-fee structure, tax implications) with what the equity question and this research add:

1. What entity type (LLC vs. C-corp) makes issuing Haley's and David's equity cleanest — and does that choice constrain the nonprofit options later?
2. If fiscal sponsorship bridges the gap: which model fits — "Model A" (sponsor owns the program) or "Model C" (a pre-approved grant relationship with more independence) — and what does each mean for control and messaging?
3. What does a fiscal sponsor typically charge, and does that undercut the "50% to the grant pool" math already committed to in `docs/the-exchange-v1-prd.md` §15?
4. Does the AP fund lane (D3, an outbound link to AP's own platform) sidestep entity questions entirely — and does that change if The Exchange later folds AP-style funds into its own charitable arm?
5. Could a nonprofit/fiscal-sponsor arm elsewhere blur the direct "back/fund" lane's no-deductibility promise (90/10, no receipt, per D3) in marketing, and what firewalls would prevent that?
6. What's the realistic annual cost of a standalone 501(c)(3)/Foundation once volume justifies it, versus staying on a fiscal sponsor or DAF partner indefinitely — and are state-level charitable-solicitation registrations triggered before then?
7. What governance separation (board composition, conflict-of-interest policy) keeps the IRS comfortable a nonprofit/affiliate isn't just serving the for-profit's interests?

## Caveat, again

This document is general educational background assembled from public sources, not a legal or tax opinion, and it does not know the jurisdiction, the actual terms being discussed with Haley and David, or the platform's real financial picture. Treat every option above as a question to ask, not a decision already made — the entity call itself belongs to Rick, the attorney, and the CPA.

---

### Sources consulted (2026-08-30)

- National Council of Nonprofits — [Fiscal Sponsorship for Nonprofits](https://www.councilofnonprofits.org/running-nonprofit/administration-and-financial-management/fiscal-sponsorship-nonprofits)
- National Network of Fiscal Sponsors — [About Fiscal Sponsorship](https://www.fiscalsponsors.org/about-fiscal-sponsorship)
- Stanford GSB — [Tandem Structures](https://stanford.edu/dept/gsb-ds/Inkling/CSI_Legal_Structures/ops/s9ml/chapter06/tandem_overview.xhtml)
- Dalton & Tomich — [Legal Considerations for Nonprofits with For-Profit Affiliations](https://daltontomich.com/legal-considerations-for-nonprofits-with-for-profit-affiliations/)
- LawShun — [Who Really Owns a 501(c)(3) Nonprofit?](https://lawshun.com/article/who-owns-a-501c3-nonprofit-created-under-us-law)
- Tax Shark — [Can an LLC Have a Nonprofit Subsidiary?](https://taxsharkinc.com/can-an-llc-have-a-nonprofit-subsidiary-w-examples-faqs/)
- Exempt Nexus / Form1023.org — [Form 1023 Processing Time](https://form1023.org/how-long-the-irs-takes-to-process-form-1023-for-501c3)
- NPTrust — [The Donor-Advised Fund](https://www.nptrust.org/donor-advised-funds/)
