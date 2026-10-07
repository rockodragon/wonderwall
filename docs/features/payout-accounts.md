# Payout accounts: where a project's money goes

Spec, 2026-10-01. Nothing here is built. Internal. Code paths are relative to `app/`.

Rick's ask, word for word: "there should be stricter interface contracts that allow us to route money for a project to different accounts, specifically non-profits. we (admins) should be able to setup accounts that appear in the searchable drop-down list."

How to read this. **As coded** means I read it in the repo today, with file and line. **Proposed** is new. **Open** needs Rick. **Lawyer/accountant** is a question I am flagging, not answering.

This is an internal spec. It makes no claim about money to the public. Any new sentence a visitor reads about payout accounts goes through `docs/marketing/claims.md` and `app/app/constants/claims.ts` first, with a test in `claims.test.ts`. That is the standing rule. No "tax-deductible", no "100% goes to", no "verified nonprofit" until those words are cleared.

## Short version

- **As coded**, the destination of money is decided in at least six different places, in six different ways. Only event tickets can send money to an organization's Stripe account. Nothing in the app can set that destination; it needs a hand edit to the database.
- **As coded**, "This supports a registered nonprofit" on a project is a text box. It moves no money. The public project page prints "Funded via {typed name}, a 501(c)(3)" from it. Backer money for that project is owed to the person who owns the project.
- **Proposed**, in order: an admin-managed list of payout accounts; a searchable picker on the project and event forms; one function, `resolvePayee`, that every money path asks "where does this go"; and the rule that a named account that is not ready refuses the sale. It never falls back.
- The first phase changes no money behavior. Each later phase adopts the function one path at a time and keeps today's destination unless an account is named.

## 1. How money is routed today

| Path | Where the money lands | Who decides the destination | How it leaves |
|---|---|---|---|
| **Event tickets, platform checkout** (`ticketTiers`) | Platform Stripe account, unless the event names a `beneficiaryHostOrgId` whose org has a `stripeConnectAccountId`. Then it is a destination charge: `on_behalf_of` and `transfer_data.destination`, so the org is merchant of record. No application fee is set. | `routeTicketMoney` (`convex/garden/ticketRouting.ts:54-71`), called at `convex/garden/stripe.ts:207`, destination at `:238-245`. Field: `events.beneficiaryHostOrgId` (`convex/schema.ts:285`) | Straight to the org's Stripe account at charge time. Refunds are by hand (`schema.ts:1573`). The purchase row records where it went (`schema.ts:1577-1583`). |
| **Event tickets, external link** (`externalTicketUrl`) | Abiding Practice's own Stripe account, through a Payment Link. The field takes any https link (Eventbrite, Partiful, a venue's page; `normalizeExternalTicket` in `convex/events.ts`), but only a `buy.stripe.com` link is AP's: it alone gets the Stripe params (`isStripePaymentLink`, `convex/garden/ticketLink.ts`) and a webhook watching for the sale. A link to any other site records nothing here. | Hard-coded: a second webhook knows only Abiding Practice (`convex/garden/apGifts.ts:37,300`) | Never touches the platform. Recorded as a grant-fund contribution and an RSVP. |
| **Project backing** (once or monthly) | Platform Stripe account (`stripe.ts:574-733`). No destination is set on the session. | The webhook sets `payeeUserId` to the project's lead at payment time (`stripeHandlers.ts:937-964`, `garden/memberships.ts:417-421`). `benefitsNonprofit` and `nonprofitName` are not read anywhere in money code. | Owed in `backingPayments` (`schema.ts:1830`). The nightly sweep transfers to the lead's personal Express account once payouts are enabled and the balance passes $50 (`garden/connect.ts:129-181`, `connectState.ts:103-139`, `giving.ts:51`, `crons.ts:82-85`). Otherwise an operator records a payout by hand (`garden/payouts.ts:194`). |
| **Class payments** | Platform account (`stripe.ts:872-963`) | Webhook sets `payeeUserId` to the teacher (`stripeHandlers.ts:1317`) | Owed in `classPayments` (`schema.ts:1874`). The transfer sweep does not read this table (it lists gift and backing rows only, `connectState.ts:119-129`), so class money is paid by hand. |
| **Community products** | Platform account (`stripe.ts:754ff`) | Product's `hostOrgId` | 90% owed to the org in `productPurchases.hostCents`, paid by hand through `hostPayouts` (`schema.ts:1786-1830`). |
| **Dues** (membership) | Platform account (`stripe.ts:57-160`) | `communityDuesSplit`: 10% platform, the community's pool share, the rest to the group (`stripeHandlers.ts:544-552`, `1848-1860`) | Recorded as a `dues_share` row (`schema.ts:1629`). The group share is stored as `groupCents` and **no code moves it anywhere**. |
| **Pool contributions** | Platform account (`stripe.ts:460-538`). Only the platform or a community may hold a pool (`:489`). | The named `hostOrgId` | Recorded in the pool ledger. |
| **Grants out of a pool** | Not an app flow | An operator decides and pays outside the app. The app records it (`garden/grantProposals.ts:1-8`, `allocations` comment at `schema.ts:1591`). | By hand |
| **Member-directed giving** | A member's pool share, or a plus-up on top | The member picks a creative or a project (`garden/giving.ts:1-12,902`). Plus-up: `createGiftCheckout` (`stripe.ts:1065`) | Owed in `giftPayments` (`schema.ts:1703`) or `backingPayments`. The sweep transfers to the creative (`connectState.ts:103-129`). |
| **Fund page links** | Org's own Stripe account | `hostOrgs.paymentLinkUrl`, `monthlyPaymentLinkUrl`, `givingUrl` (`schema.ts:954-960`). Set by command line only (`garden/givingLinks.ts:5`). | Never touches the platform |
| **Gigs** | Venue pays the artist directly | Artist's `profiles.payoutHandles` (`schema.ts:76`, `gigs.ts:1334-1356`, `gigRules.ts:494`) | Platform moves nothing |

### What this shows

1. **At least six places decide a destination.** Tickets use `routeTicketMoney`. Backings and class payments use the project lead or teacher found in the webhook. Products use the host org. Dues use the community split. External tickets and fund pages are hard-coded to one org. Gigs use a profile field. There is no shared type.
2. **No UI or mutation sets `events.beneficiaryHostOrgId`.** `events.create` and `update` do not accept it (`events.ts:548-575`). The only reader is `getEventForTicketCheckout` (`events.ts:1298`). It exists in the schema and the checkout and nowhere else.
3. **No code sets `hostOrgs.stripeConnectAccountId` or `taxStatus`.** Only personal accounts are created, by the creative themselves (`connect.ts:41-78`, with `business_type: "individual"`). The org's id is a hand edit.
4. **"Ready" means "an id is present".** `routeTicketMoney` checks only that the string exists (`ticketRouting.ts:59`). It does not ask Stripe whether the account can take charges. The `account.updated` webhook updates personal profiles only (`connectState.ts:29-51`), so an org's status is never refreshed.
5. **The nonprofit box is display only, and the display is stronger than the data.** The edit form says "Self-declared, not verified" (`app/routes/projects.$id.tsx:688-702`). The public page does not. It prints "Funded via {name}, a 501(c)(3)." for any typed name (`projects.$id.tsx:363-369`). The seed project "Neighbors" is set the same way, to Abiding Practice (`garden/seedNeighborsProject.ts:114-115`).
6. **Two dead fields.** `projects.supportPaymentLinkUrl` (`schema.ts:1138`) has no reader. `events.paymentLinkUrl` (`schema.ts:357`) has no writer.
7. **The same link check is written twice** (`events.ts:122-146` and `givingLinks.ts:10-16`).
8. **Records point at the payee at write time, and that is good.** `ticketPurchases` stores the destination it used, so a changed event does not rewrite history (`schema.ts:1575-1583`). Backing and class rows store a person (`payeeUserId`). Any new payee type must do the same.

## 2. Payout accounts

**Proposed.** A new table, `payoutAccounts`. One row is one place money can be sent: a nonprofit, a fiscal sponsor, or any other payee an admin sets up.

Why a new table and not `hostOrgs` or `organizations`:
- `hostOrgs` are communities and fund owners. They show in community lists and carry dues rules (`schema.ts:950-1000`). A food bank that is only a payee should not appear there.
- `organizations` are public pages for people's employers (`schema.ts:125-165`). They have a name search already. A payout account can point at one (`organizationId`) so the picker can show a logo and a link, but money fields do not belong on a public page row.
- A payee can be both, or neither. Optional links to both keep it flexible.

### Fields

| Field | Notes |
|---|---|
| `displayName` | What the picker shows. "Second Harvest Food Bank". |
| `legalName` | As on IRS records. |
| `kind` | `nonprofit`, `fiscal_sponsor`, `business`, `other`. |
| `taxStatus` | `501c3`, `for_profit`, `unknown`. Same strings as `ticketRouting.ts:30-32`. |
| `ein` | Optional. Nonprofits and fiscal sponsors only. Admin-only to read. Never collect it for a business. |
| `city`, `state`, `websiteUrl` | To tell two similar names apart in the picker. |
| `destination` | One of `{ type: "stripe_account", accountId }` or `{ type: "payment_link", url, usedFor: "tickets" \| "giving" }`. |
| `stripeStatus` | Mirror of `charges_enabled`, `payouts_enabled`, `details_submitted`, and `checkedAt`. Written by the webhook and by a check at save time. |
| `verification` | `unverified` or `verified`, plus `verifiedBy`, `verifiedAt`, and a note on what was checked ("IRS exempt-org search match, 2026-10-02"). A person checks this. No automatic lookup in phase 1. |
| `agreement` | Fiscal sponsors only: `onFile` (yes/no), date, note. Pointer to wherever the document lives. |
| `access` | Who may attach it: `admin_only`, `approval`, `open`. See below. |
| `state` | `draft`, `active`, `paused`, `retired`. |
| `organizationId`, `hostOrgId` | Optional links. |
| `searchText` | `displayName + legalName + city`, lowercase, for the search index. |
| `note`, `createdBy`, `createdAt`, `updatedAt` | Internal. |

Readiness is computed, never typed in. A pure function, `payoutAccountReadiness(account)`, returns `ready` or a reason:
- `state` is `active`.
- `verification` is `verified`.
- For a Stripe account: an id is present and the mirror says it can take what the path needs (see open question on capabilities).
- For a payment link: the host is on the allow list (`buy.stripe.com`, one shared check replacing the two copies).

### Who can attach an account

- `admin_only`: only an admin can attach it to a project or event. Use for fiscal sponsors with a contract.
- `approval`: a member can ask for it. It stays unattached until an admin approves. The member sees "waiting for approval". **This is the default.**
- `open`: any signed-in member can attach it. Use only when the nonprofit has agreed to it.

Why not open by default. A member who picks a nonprofit sends backer money to that nonprofit, not to themselves. The harm is not diversion. It is a project that speaks in a nonprofit's name without the nonprofit's say. **Lawyer/accountant:** see section 8.

### The admin screen

**Proposed.** `/admin/payout-accounts`, linked from `/admin`. Same admin gate.

- List with search, state filter, readiness badge.
- Add / edit form for the fields above.
- "Check Stripe now" button: calls Stripe for the account id and writes the mirror.
- Verify, Pause, Retire. Each writes an audit row (`adminActions`, see `safety.md` section 6).
- Phase 5 adds "Send Stripe setup link", which creates an Express account for the organization with `business_type: "non_profit"` and returns an onboarding link, the way `connect.ts:41-78` does for a creative. **Open, ask Stripe:** account type and capabilities for an organization that is merchant of record.
- Seeded on first run from `hostOrgs` rows that already have a Connect id or a payment link (Abiding Practice).

## 3. The picker

**Proposed.** One component, `PayoutAccountPicker`, used on the project edit form and the event form.

- Type to search `payoutAccounts` through its search index. Shows `displayName`, city, and a small badge for kind. No Stripe ids, no EIN.
- Shows only active accounts the viewer may attach: `open` ones, plus any they have been approved for. An admin sees all.
- The choice is optional. Empty means "no account named", and that is a normal, explicit state (section 4).
- If the account is `approval`, the picker says "Ask to use this" and the field shows "Waiting for approval" until an admin acts.
- It replaces the checkbox and free-text box at `projects.$id.tsx:683-702`. It adds a field to the event form (`app/components/CreateEventModal.tsx`), which has none today.
- After a payment has been collected, the field can still change, but only future payments follow it. Past payments keep the payee they were recorded with.

Words on the public page ("Funded via ...") are a claims question, not a build question. Until the words are cleared, the page prints the account's `displayName` and nothing about tax status.

## 4. One interface: `resolvePayee`

**Proposed.** A pure function in `convex/garden/payee.ts`, with a thin loader beside it. House style: pure core, thin `ctx.db` wrapper, unit tests (`ticketRouting.ts` and `ticketRouting.test.ts` are the model). It replaces `routeTicketMoney` and keeps that file's tests passing as a wrapper.

```ts
type PayPath =
  | "event_ticket" | "project_backing" | "class" | "community_product"
  | "dues" | "pool_contribution" | "member_gift" | "gig";

type PayTarget = { path: PayPath; id: string };   // eventId, projectId, offeringId ...

type Payee =
  | { kind: "platform"; reason: "no_account_named" | "platform_owned_path" }
  | {
      kind: "connected_account";
      accountId: string;                           // acct_...
      owner: { type: "payout_account"; id: string }
           | { type: "person"; userId: string }
           | { type: "organization"; hostOrgId: string };
      settlement: "destination_charge" | "transfer_later";
      taxStatus?: "501c3" | "for_profit";
    }
  | { kind: "external_link"; url: string; owner: Owner; platformMovesMoney: false };

type PayeeResolution =
  | { ok: true; payee: Payee }
  | { ok: false; code: "account_not_ready" | "account_paused" | "account_unverified"
                     | "wrong_use" | "payee_missing";
      reason: string;      // plain words for the person who hit it
      fix: string };       // plain words for the admin
```

### The rules (the "stricter contract")

1. **Every money path asks.** Each checkout action calls `resolvePayee` before it creates a Stripe session. No other file writes `transfer_data`, `on_behalf_of`, or a transfer `destination`. A test reads `stripe.ts` and `connect.ts` and fails if those words appear outside the one function that applies a resolved payee.
2. **Refuse, never fall back.** If an account is named and not ready, the result is `ok: false`. The sale does not go to the platform or to the person "for now". This is the rule in `ticketRouting.ts:17-22`, kept as is. Only the explicit state "no account named" resolves to today's default.
3. **Checkout decides, the webhook records.** The resolved payee is copied into session metadata (`payoutAccountId`, `destinationAccountId`, `taxStatus`), as tickets do now (`stripe.ts:212-228`). The webhook writes what checkout decided and does not resolve again. A changed project cannot move money that was already charged.
4. **Rows store the payee.** `backingPayments` and `giftPayments` gain an optional `payoutAccountId` next to `payeeUserId`. Class and product rows follow when those paths adopt it. Exactly one of the two is set.
5. **No path invents a destination.** If a path has no way to resolve (a deleted project, a teacher gone), the result is `payee_missing`. Today the webhook records such money as `UNASSIGNED` for an operator to resolve (`payouts.ts:78`). That stays.
6. **Links are payees too.** A Stripe Payment Link or a pay-handle is an `external_link`. The platform moves nothing and says so in the type.

### What each path resolves to

| Path | No account named (today's behavior, unchanged) | Account named |
|---|---|---|
| `event_ticket` | `platform` | `connected_account`, `destination_charge`. A `payment_link` account is allowed for the external ticket lane only (`external_link`). |
| `project_backing` | `connected_account`, owner = the project lead, `transfer_later`, if the lead's payouts are on; else owed on the ledger as now | `connected_account` with the account. See the open question on settlement. |
| `class` | the teacher, `transfer_later` | not in scope for phases 1-4 |
| `community_product` | the host org, by hand | not in scope |
| `dues`, `pool_contribution` | `platform` (the ledger splits it) | not in scope |
| `member_gift` | the creative, or the project's resolved payee | follows the project |
| `gig` | `external_link` from the artist's pay handles | not in scope |

The point of the "no account named" column: phase 4 changes no destination. It only moves the decision into one place.

### Refusals

Follow `ticketRouting.ts`: say what happened, say nothing was charged, tell the person what to do.

| Code | Who sees it | Plain words |
|---|---|---|
| `account_not_ready` | The buyer or backer | "{Name} isn't set up to receive payments yet, so this can't be paid right now. Nothing was charged." |
| `account_paused` | The buyer or backer | same sentence |
| `account_unverified` | The buyer or backer | same sentence |
| any `ok: false` | The project or event owner, on the page | "Payments are paused because {Name} isn't ready. Choose another account or ask the site team." |
| any `ok: false` | An admin, on `/admin/payout-accounts` | the `fix` line: "Connect the Stripe account", "Verify the organization", "Resume the account" |

The buyer never sees the account's internal state, only that it can't be paid.

Edge: an account is paused or retired after money is in flight.
- **As coded** for tickets: money already charged stays with the account recorded at purchase.
- **Proposed**, all paths: same. New sales and new renewals refuse. A monthly backing already running re-resolves at each renewal. If it refuses, the renewal is still charged by Stripe (the subscription is Stripe's), so the code records it as owed with `payee_missing` for an operator. Say this plainly to the admin on the pause button: "Monthly backings already running will keep charging."
- **Open, lawyer:** whether to stop charging those backers and how to tell them.

## 5. Migration

| Data | Plan |
|---|---|
| `events.beneficiaryHostOrgId` | Nothing writes it, so it is probably empty. Check production. For any row that has a value, create a `payoutAccount` from that org (its Connect id and `taxStatus`) and set `events.payoutAccountId`. Keep `beneficiaryHostOrgId` readable for one release so `ticketPurchases` history makes sense. |
| `hostOrgs.stripeConnectAccountId`, `taxStatus` | Copy into a `payoutAccounts` row for each org that has them. Stop reading the hostOrgs fields once `resolvePayee` is the only reader. Leave the fields in the schema until a cleanup. |
| `projects.benefitsNonprofit`, `nonprofitName` | No automatic mapping. A typed name is not an account. Add an admin list: each distinct `nonprofitName` with how many projects use it. The admin maps each to a payout account, or marks it "not a payee". Until a project is mapped it keeps paying its lead, exactly as now. |
| Public "Funded via ..." line | Stops reading `nonprofitName`. Reads the attached account only. Until mapping is done, that line is hidden for unmapped projects. Words go through claims first. |
| Seed project "Neighbors" | Map to Abiding Practice's account. |
| `backingPayments` history | Not rewritten. Old rows keep `payeeUserId`. |
| `projects.supportPaymentLinkUrl`, `events.paymentLinkUrl` | Remove from the schema in the phase 4 cleanup. Both are unused. |

Interim fix, before anything else ships. **Done 2026-10-02 (#49): hidden from visitors; the owner still sees it, with "Only you see this until the nonprofit is verified."** Was proposed: The public line at `projects.$id.tsx:363-369` states a legal status ("a 501(c)(3)") from unverified text. Either hide it or add "self-declared" next to it today. This is one small change. It does not depend on this spec. Bead `wonderwall-u0gt.1`.

## 6. Build order

| Phase | What ships | Money behavior |
|---|---|---|
| 0. Interim | Hide or qualify the "Funded via ... 501(c)(3)" line. | None |
| 1. The list | `payoutAccounts` table, readiness function, admin screen, Stripe status check and `account.updated` sync for org accounts, picker component (not wired to any form). Seed Abiding Practice. | None |
| 2. Resolve | `resolvePayee` and tests. `event_ticket` adopts it. `events.payoutAccountId`, picker on the event form, backfill. `routeTicketMoney` becomes a wrapper. The static guard test. | Tickets behave as today. A named account is now live-checked against Stripe. |
| 3. Project backing | `projects.payoutAccountId`, picker replaces the nonprofit box, `backingPayments.payoutAccountId`, checkout and webhook adopt `resolvePayee`, the sweep can transfer to an organization account, migration of `nonprofitName`. | **First time backer money can go to a nonprofit.** Gated on the lawyer and accountant answers in section 8. |
| 4. The rest | Class, product, member gift, gig, fund-page links and external tickets adopt it. Delete the duplicate link check and the dead fields. | No destination changes |
| 5. Access and onboarding | `access` approvals, "Send Stripe setup link" for organizations, the nonprofit's own consent step. | None |

Existing beads this touches: 7avu (payout rail), qpni (Connect setup for creatives), 7ync (send transfers from the ledger), fpmn (lawyer questions on backings). Phase 3 depends on them being settled, because it reuses the ledger and the sweep.

Beads: epic `wonderwall-u0gt`. Phase 0 `.1`, phase 1 `.2`, phase 2 `.3` (needs `.2`), phase 3 `.4` (needs `.3`), phase 4 `.5` (needs `.4`), phase 5 `.6` (needs `.2`). Phase 3 is linked to 7avu and fpmn. The lawyer and accountant questions in section 8 are not filed as beads: they are business action items and belong in Upsight.

## 6a. Decided (Rick, 2026-10-02)

- **Individuals first.** Getting individual people paid comes before any organization payout work. Organization payout accounts wait until creators' own payouts are solid.
- **Nonprofit status is checked by hand.** There's no automated IRS lookup. An admin checks it.
- **Who approves nonprofit status.** Either one is enough: a site admin, or an admin of the community (for The Garden, a Garden admin).
- **Who acts for an organization.** The first person to set up an organization's payout account becomes its organization admin by default. A platform admin can override that, adding or removing people.

## 7. Open decisions for Rick

1. **Settlement for a backing to a nonprofit.** Two ways, both exist in the code. (a) Destination charge, as tickets do: the nonprofit is merchant of record, gets the receipt and the Stripe record. (b) Separate charge, then transfer later, as backings do for people: the platform is merchant of record, uses the existing ledger and sweep, supports monthly backings. [Likely] start with (b): it is the smallest change and the only one that already supports monthly. [Guessing] (a) is cleaner for a nonprofit's books. This is the accountant's call.
2. **Does the platform take its 10% on a backing routed to a nonprofit?** Tickets to a connected account take nothing today (no application fee, `stripe.ts:230-263`). The brief says 10% applies when money moves through our checkout. Decide before phase 3.
3. **Default `access`.** [Likely] `approval`.
4. **Who pays the card fee on a backing to a nonprofit.** Today the backer pays on top (`stripe.ts:705-718`). [Likely] no change.
5. **Are for-profit payees in scope.** The code already allows a `for_profit` beneficiary (`ticketRouting.ts:30-32`). The ask says non-profits. [Likely] allow `business` in the table, but only admin-attached.
6. **Which Stripe capabilities** an organization account needs for each mode: card payments for a destination charge, transfers for a later transfer. The creative accounts request transfers only (`connect.ts:60`). Check with Stripe before phase 3.
7. **Name.** `payoutAccounts` sits next to `creativePayouts` and `hostPayouts`, which are records of payments made. [Guessing] fine, but "payee" or "destination" would be clearer. Rick's word ("accounts") argues for `payoutAccounts`.
8. **Project with a named account and a lead who also has Connect set up.** The named account wins, always. Say so on the form.
9. **Claims.** What the public page may say about a project that routes to a nonprofit. Not decided here.

## 8. For the lawyer and the accountant

Questions only. No answers here. Nothing in this spec should be shipped to users until these are answered or Rick decides to go ahead without.

1. When a backer pays for a project and the money goes to a nonprofit, whose money is it? A gift to the nonprofit, a payment to the project, something else? Does the answer change if the project's lead is a person who then receives a grant from the nonprofit?
2. Fiscal sponsorship. What agreement must exist before a project's money may go to a sponsor's account, and what must the nonprofit say yes to? Which model fits: the sponsor owns the project, or a grant relationship (`docs/entity-structure-research.md` section 4, question 2)?
3. May a member name a nonprofit on a project without the nonprofit's consent? If not, what proof of consent do we keep, and is a click enough?
4. Charitable solicitation. Does routing money to a nonprofit in the name of a project put us, the project lead, or the nonprofit under state solicitation registration rules?
5. Merchant of record. Which party must be merchant of record for a charge that ends in a nonprofit's account, and does it change receipts, 1099 duties or the platform's own Stripe obligations? (`docs/features/backing-payouts.md` questions 1-3 are the same family.)
6. Our 10%. Can the platform take a fee from money headed to a nonprofit, and does it change how the nonprofit may treat it?
7. Deductibility words. Nothing public says "tax-deductible" about a backing (`docs/entity-structure-research.md` question 5). Confirm that stays true when the money lands at a nonprofit.
8. Unclaimed or refused money. If a nonprofit closes its account or refuses a transfer, where does money already collected go, and for how long may we hold it?
9. Monthly backings already running when an account is paused: may we stop charging, and what do we owe the backers?
10. EIN handling. Is storing a nonprofit's EIN, admin-only, fine, and do we need to re-check its status on a schedule?
11. Stripe. Does routing backings to organization accounts change how Stripe sees us (crowdfunding platform review, `docs/features/backing-payouts.md` "The problem today")?
