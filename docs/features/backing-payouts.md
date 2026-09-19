# Backing payouts — how backer money reaches creatives

Status as of **2026-09-18**. Nothing has been collected on backings yet. Each point below is marked:

- **Decided** — Rick has made the call.
- **Recommended** — the advice on the table, not decided.
- **Open** — still being worked out.

Research was done 2026-09-18 with every source fetched that day; the links are at the bottom. It
builds on the pay-handle research in [live-booking.md](live-booking.md) §6.

## The short version

| | Status |
|---|---|
| Minimum payout to a creative: **$50** (same as Twitch). Smaller balances roll to the next month. | **Decided** |
| Use **Stripe Connect, "separate charges and transfers"**: backers pay through the checkout we already run; a creative gets a Stripe signup link when their first backing lands. | **Recommended** |
| Drop the idea of backers paying the platform's Venmo or Zelle with a reference code. | **Recommended** |
| Keep "direct pay" (backer pays the creative's own Venmo etc., like gigs) only as a fallback for creatives who won't use Stripe. | **Recommended** |
| The platform's cut, and whether it comes out of the backing or is added on top. | **Open** — `BACKING_PLATFORM_RATE` in draft PR #15 holds 10% as a placeholder |
| Call Stripe before Nov 6 to say what we are (see "The problem today"). | **Recommended**, urgent |

## The problem today

Backings are charged on the platform's own Stripe account and there is no way to pay creatives out.
Stripe's prohibited list includes *"Payment facilitation and aggregation (including receiving
settlement proceeds for goods or services that you did not provide, on behalf of one or multiple
third-party sellers)"*, and it lists *"Crowdfunding platforms"* as needing approval from Stripe sales.
Collecting for creatives this way, at any real volume, risks a frozen account. [S2]

## How Stripe Connect works here

- **We charge first, the creative signs up later.** "Separate charges and transfers" exists *"when a
  specific user isn't known at the time of the payment."* [S3, S4] Money we take is held for the
  creative until they finish Stripe's signup (identity + bank), then transferred to them.
- **Stripe holds the money transmitter licenses** and takes that obligation off us. [S7] This is the
  main legal reason to use Connect instead of doing it ourselves.
- **Creatives don't press "withdraw."** Stripe deposits their money to their bank on a schedule we set,
  and gives them a Stripe-hosted dashboard to see it.

### What it costs

Stripe Connect has two pricing modes. [S1]

- **Free to the platform ("Stripe handles pricing").** The charge is made in the creative's name, so
  Stripe takes its card fee from the creative's side. That's what "Stripe bills the creative" means —
  card processing on their own sales, not a withdrawal fee. It only works if the creative signs up
  **before** anyone can back them. [S3, S5]
- **Platform pays ("platform handles pricing") — required for charge-first.** Two fees:
  - **$2 per creative, per month that creative gets a deposit to their bank.** Stripe: *"An account is
    active in any month payouts are sent to its bank account or debit card."* It is not a per-transfer
    fee. Moving money into a creative's Stripe balance is free (likely — no transfer fee is listed);
    a creative with no deposit that month costs $0.
  - **0.25% + 25¢ per payout** to their bank.

**Why $50 minimum:** at a 10% cut, a creative owed $50 means backers gave about $55.56. The platform's
$5.56, minus Stripe's $2 + 12.5¢ + 25¢, leaves about **$3.18**. At a $25 minimum it's about **47¢**.
Stripe lets the platform set a payout schedule and a minimum balance per creative. [S45, S46]
Minimums are normal: YouTube pays out at $100 and rolls smaller balances over, Twitch at $50,
Patreon at $10. [S47]

Rules for the minimum: say it in the terms; pay out everything when a creative leaves or asks, even
under $50; don't hold small balances for years (state unclaimed-property laws — a question for the
lawyer).

## Options considered

Cost is the platform's own cost on a **$100 backing**, with the backer covering card processing.

| Option | Platform cost | We hold money? | Legal risk | Setup | Automated? |
|---|---|---|---|---|---|
| Stripe Connect, separate charges and transfers | ~48¢ payout fee + $2 per creative per month they're paid | Yes, inside Stripe | Low–medium | 5–8 days | Yes |
| Stripe Connect, direct charges (creative signs up first) | $0 | No | Low | 5–8 days | Yes |
| Backers pay our Venmo/Zelle with a reference code | Venmo ~$2; Zelle $0; plus staff hours | Yes, in our accounts | **High** | 2–3 days | **Manual** |
| Bank account numbers per project (Increase-type) | ~50¢ per outbound ACH; inbound not priced | Yes | Medium–high | 10–20 days incl. approval | Yes |
| Stripe bank transfer (account number per backer) | 0.5% capped at $5, plus Connect payout fees | Yes | Low–medium | +3–5 days on top of Connect | Yes |
| Direct pay, 10% charged separately by card | ~60¢ (or $0 if surcharged) | No | Low | 2–4 days | Manual confirm |
| PayPal Multiparty | $0 (partner-fee model) | No | Low | Weeks (approval) | Yes |

### Why not Venmo or Zelle with a reference code

- **Venmo:** personal accounts *"may not be used to conduct business, commercial or merchant
  transactions."* [S11] PayPal's acceptable-use policy needs pre-approval for a *"Payment Facilitator"*
  and for *"Collecting donations."* [S13]
- **Zelle:** business terms don't ban collect-and-forward outright, but it's a gray area the bank can
  shut off, and payments *"cannot be reversed."* [S18, S20]
- **No automation:** Venmo closed its API to new developers in 2016 and only offers CSV statements
  [S16, S44]; Zelle has no API [S21]; bank feeds (Plaid, Teller) carry the bank's description line,
  not the memo. [S37] At 50 payments a month that's hand-matching every row and chasing typos.
- **Money transmission:** collecting from one person and sending it to another makes you a money
  transmitter unless an exemption applies. [S24] The federal payment-processor exemption requires the
  purchase of *goods or services* [S25] — a pure backing likely isn't that. States' "agent of the
  payee" exemption needs a written contract with the creative [S27, S28], and Florida, New Jersey,
  Oregon and Utah (among others) don't recognize it. [S29, S30] **Connect avoids all of this.**

### Direct pay as a fallback

The backer pays the creative's own Venmo / Cash App / PayPal / Zelle (the gigs code already does
this). The platform's cut would be charged separately by card — about 59¢ to charge $10, and it can
be passed to the backer as a surcharge (credit cards only, max 3%, disclosed). [S8, S10] What breaks:
nothing proves the backing happened, monthly backings need a manual payment every month, and the
cut is easy to skip. Record it the way gigs do: backer marks it paid, creative confirms.

## Taxes

With Stripe Connect set up so the platform pays Stripe's fees, **the platform (not Stripe) sends the
tax forms** to creatives. [S6] A creative only needs a form from us if, in one year:

- they were paid **more than $20,000 across more than 200 payments** — that's a 1099-K [S31], or
- we paid them **$2,000 or more**, starting with 2026 taxes — that's a 1099-NEC. [S32]

Nobody at pilot size is close to either, so there are no forms to send yet.

With direct pay, the payment app handles it: Venmo sends 1099-Ks for business payments over those
amounts [S15]; Zelle doesn't send tax forms at all. [S22]

## For the lawyer or accountant, before launch

1. Is a backing a payment for goods or services? If not, neither the federal exemption nor state
   agent-of-payee rules clearly apply — does Connect fully cover us anyway?
2. Will Stripe classify us as a crowdfunding platform, and what approval or terms follow?
3. Under Connect, do we file 1099-NEC or 1099-K, and are backings income or gifts to the creative?

## What's built and what's next

- **Built, draft:** PR #15 (bead wonderwall-7avu step 1) — `backingPayments` records what each creative
  is owed per payment, including monthly renewals; `creativePayouts` records manual payouts;
  `/admin/ledger` shows owed vs paid. Under Connect this same ledger decides what to transfer.
  Blocked only on the platform's cut (`BACKING_PLATFORM_RATE`).
- **Next build (7avu step 2), if Connect is chosen:** Stripe Express signup link sent when a creative's
  first backing lands ("Somebody backed you $X — set up payouts to claim it"); transfers from the
  ledger; $50 minimum set on each connected account; a claim deadline (e.g. 90 days) after which an
  unclaimed backing is refunded.
- **Then:** card-processing line added at checkout, if the backer is to cover it.

## Sources (all fetched 2026-09-18)

- S1 https://stripe.com/connect/pricing
- S2 https://stripe.com/legal/restricted-businesses
- S3 https://docs.stripe.com/connect/charges
- S4 https://docs.stripe.com/connect/separate-charges-and-transfers
- S5 https://docs.stripe.com/connect/accounts-v2/connected-account-configuration
- S6 https://docs.stripe.com/connect/tax-reporting
- S7 https://stripe.com/connect
- S8 https://stripe.com/us/pricing/local-payment-methods
- S10 https://docs.stripe.com/payments/cards/surcharge
- S11 https://venmo.com/legal/us-user-agreement/
- S13 https://www.paypal.com/us/legalhub/acceptableuse-full
- S15 https://help.venmo.com/cs/articles/venmo-tax-faq-vhel137
- S16 https://techcrunch.com/2016/02/26/how-not-to-run-a-platform/
- S18 https://mybank.com/wp-content/uploads/Zelle-Business-Terms.pdf
- S20 https://www.chase.com/business/support/banking/online-banking/zelle
- S21 https://www.zelle.com/business
- S22 https://www.zelle.com/faq/does-zelle-report-how-much-money-i-receive-irs
- S24 https://www.law.cornell.edu/cfr/text/31/1010.100
- S25 https://www.fincen.gov/resources/statutes-regulations/administrative-rulings/application-money-services-business
- S27 https://dfpi.ca.gov/rules-enforcement/laws-and-regulations/opinion-letters-by-law-subject/agent-of-payee-exemption/
- S28 https://www.law.cornell.edu/regulations/california/10-CCR-80.126.10
- S29 https://www.csbs.org/agent-payee-exemption-map
- S30 https://faisalkhan.com/solutions/licensing/money-transmitter-license/agent-of-payee-exemption
- S31 https://www.irs.gov/businesses/understanding-your-form-1099-k
- S32 https://www.irs.gov/instructions/i1099mec
- S37 https://plaid.com/docs/api/products/transactions/
- S44 https://help.venmo.com/cs/articles/transaction-history-vhel281
- S45 https://docs.stripe.com/payouts/minimum-balances-for-automatic-payouts
- S46 https://docs.stripe.com/connect/manage-payout-schedule
- S47 https://digiday.com/marketing/how-every-major-platform-pays-creators/
