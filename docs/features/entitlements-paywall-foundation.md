# Entitlements and Paywall Foundation

## Executive Summary

TheCrossBoard needs one shared entitlement layer for members, sponsored creatives, organizations, paid events, and gated media. This should be built before deeper live-video work because every paywall decision depends on the same question: who is allowed to do this right now, and why?

Opinionated recommendation:

1. Build entitlements as a reusable backend authorization service, not scattered `plan === "paid"` checks.
2. Model organizations separately from individual profiles. Organization plans should grant organization capabilities, not accidentally make every employee a paid creative member.
3. Treat sponsored memberships as real creative memberships with a sponsor relationship and an expiration/renewal path.
4. Gate by capabilities, not by plan names. Code should ask `canPostJob`, `canViewPaidReplay`, `canMessageCreatives`, or `canSponsorMemberships`, not hard-code tier rules in every feature.
5. Start with Stripe-compatible billing fields, but allow admin-comped and sponsored access from day one so the early community can be operated manually.

The smallest useful version is not a full billing platform. It is a reliable entitlement read model that can power locked states, feature gates, admin grants, organization tier limits, sponsored creative seats, and future Stripe webhooks.

## Business Outcome

The entitlement foundation should make the current product monetizable without weakening the free creative community.

- Free creatives can keep profiles, portfolios, job browsing, event discovery, and basic community participation active.
- Paid or sponsored creatives can unlock deeper access: paid events, replays, private sessions, permanent/expanded profile benefits, and insider programming.
- Organizations can pay for hiring and patronage benefits: organization profile, job posting capacity, direct outreach, featured placement, and sponsored memberships.
- Admins can manually grant, revoke, comp, and troubleshoot access during the early revenue stage.
- The product can show upgrade prompts at moments of intent instead of blocking users arbitrarily.

## Current State

Observed in the app/docs:

- `profiles.plan` exists as an optional string with comments implying `"free" | "paid"`.
- Wonderings already check `profile.plan === "paid"` for free-plan limits.
- Organizations are currently represented on the public route as tier descriptions, but there is no first-class organization membership/plan schema in the core app model.
- Jobs, portfolios, events, messaging, and YouTube embeds already exist.
- The missing layer is a normalized way to determine access across member features, organization features, sponsored memberships, paid media, and events.

## Product Principles

### Value Before Ask

Do not put the paywall in front of initial creative value. A free creative should experience the core loop before being asked to pay: create profile, show work, browse jobs/events, and receive some connection value.

### Gate Expansion, Not Identity

Do not make free users feel like second-class members. Gate premium capacity, private access, and monetizable workflows:

- More permanence or capacity
- Paid replays/events
- Featured visibility
- Organization outreach and hiring tools
- Sponsored memberships
- Admin/partner benefits

### One Rules Layer

Every feature should use shared entitlement helpers. Feature-specific code should not duplicate tier logic.

### Manual Operations First

Early-stage membership and sponsorship will need human judgment. Admin comping, manual grants, sponsored seats, and overrides should be first-class instead of hacks.

## Roles And Accounts

| Actor | Description | Notes |
| --- | --- | --- |
| Anonymous visitor | Not logged in | Can view public pages and public media |
| Free creative | Logged-in individual | Can build profile, post work, browse/interest in jobs, RSVP where allowed |
| Paid creative | Individual paying member | Unlocks premium creative/member benefits |
| Sponsored creative | Individual whose access is paid/granted by an organization or admin | Should behave like paid creative with visible sponsor metadata where appropriate |
| Organization owner | User who manages an organization account | Can manage org profile, jobs, team, billing, sponsorships |
| Organization team member | User attached to an organization | Permissions vary by role |
| Admin | Platform operator | Can grant, override, comp, revoke, and inspect access |

## Plan Model

### Creative Plans

| Plan | Purpose | Initial Capabilities |
| --- | --- | --- |
| `free_creative` | Keep supply side healthy | Profile, portfolio, job browse/interest, basic events, basic messaging |
| `paid_creative` | Individual paid member | Paid/member events, replays, premium profile benefits, private sessions |
| `sponsored_creative` | Paid access sponsored by org/admin | Same as paid creative unless grant is scoped |
| `comped_creative` | Admin-granted access | Same as paid creative; operational override |

### Organization Plans

Use the public `/organizations` positioning as the first entitlement map.

| Plan | Public Positioning | Initial Capabilities |
| --- | --- | --- |
| `org_community` | Free directory/listing tier | Org listing, website/contact info, browse portfolios, 1 active job |
| `org_partner` | $100/month tier | Org profile, logo, up to 5 active jobs, direct messaging with creatives, 5 sponsored memberships |
| `org_patron` | $5,000/year tier | Up to 15 active jobs, featured badge/profile, homepage rotation, priority support/matching, 20 sponsored memberships |
| `org_founding_partner` | $25,000/year tier | Unlimited jobs, spotlight profile, naming rights, advisory participation, custom integrations, 50+ sponsored memberships |

The exact prices can remain managed by Stripe/product configuration, but the capabilities should be represented in code.

## Capability Catalog

Capabilities should be stable keys. Plans map to capabilities; feature code checks capabilities.

### Creative Capabilities

| Capability | Free | Paid/Sponsored | Notes |
| --- | --- | --- | --- |
| `profile.edit` | Yes | Yes | Core supply-side behavior |
| `work.create` | Yes | Yes | Consider storage/quantity limits later |
| `jobs.browse` | Yes | Yes | Public/member jobs strategy can evolve |
| `jobs.expressInterest` | Yes | Yes | Important for marketplace liquidity |
| `messages.basic` | Yes | Yes | Existing community value |
| `events.rsvpFree` | Yes | Yes | Free/member events |
| `events.rsvpPaidIncluded` | No | Yes | If membership includes event access |
| `media.viewPaidReplay` | No | Yes | Cloudflare Stream signed playback |
| `live.joinPaidSession` | No | Yes | Zoom/LiveKit gated sessions |
| `profile.permanentWonderings` | No | Yes | Existing paid-plan idea |
| `profile.featuredVisibility` | No or limited | Optional | Use carefully to avoid pay-to-win feel |

### Organization Capabilities

| Capability | Community | Partner | Patron | Founding |
| --- | --- | --- | --- | --- |
| `org.profile.basic` | Yes | Yes | Yes | Yes |
| `org.profile.logo` | No | Yes | Yes | Yes |
| `org.profile.featured` | No | No | Yes | Yes |
| `org.jobs.activeLimit` | 1 | 5 | 15 | Unlimited |
| `org.messages.creatives` | No or limited | Yes | Yes | Yes |
| `org.sponsorMemberships.limit` | 0 | 5 | 20 | 50+ |
| `org.homepageRotation` | No | No | Yes | Yes |
| `org.prioritySupport` | No | No | Yes | Yes |
| `org.customIntegrations` | No | No | No | Yes |
| `org.eventNamingRights` | No | No | No | Yes |

### Event And Media Capabilities

| Capability | Purpose |
| --- | --- |
| `events.createPublic` | Member-created public/community events |
| `events.createPaid` | Admin/partner ability to create paid events |
| `events.manageOwn` | Organizer management |
| `events.manageAll` | Admin management |
| `media.attachPublicYouTube` | Public embeds |
| `media.attachGatedStream` | Cloudflare Stream/VOD gating |
| `media.issuePlaybackToken` | Server-side signed playback |
| `live.issueRoomToken` | Server-side LiveKit/Zoom access |

## Data Model

Use Convex tables that can support manual grants now and billing integration later.

### `plans`

Canonical plan definitions.

```typescript
plans: {
  key: "free_creative" | "paid_creative" | "org_community" | "org_partner" | "org_patron" | "org_founding_partner",
  audience: "creative" | "organization",
  name: string,
  status: "active" | "archived",
  capabilities: string[],
  limits: {
    activeJobs?: number,
    sponsoredMemberships?: number,
    activePaidEvents?: number,
    mediaStorageMinutes?: number,
  },
  stripePriceId?: string,
  createdAt: number,
  updatedAt: number,
}
```

### `memberships`

Individual user access state.

```typescript
memberships: {
  userId: Id<"users">,
  planKey: string,
  status: "active" | "trialing" | "past_due" | "canceled" | "expired",
  source: "stripe" | "sponsored" | "admin" | "legacy",
  sponsorOrganizationId?: Id<"organizations">,
  grantedByUserId?: Id<"users">,
  startsAt: number,
  currentPeriodEnd?: number,
  canceledAt?: number,
  createdAt: number,
  updatedAt: number,
}
```

### `organizations`

First-class organization accounts. Do not use crawled organizations as the paid org account table; crawler records are leads/prospects.

```typescript
organizations: {
  name: string,
  slug: string,
  website?: string,
  logoStorageId?: Id<"_storage">,
  description?: string,
  organizationType?: "church" | "nonprofit" | "business" | "agency" | "ministry" | "other",
  status: "active" | "pending" | "disabled",
  createdByUserId: Id<"users">,
  createdAt: number,
  updatedAt: number,
}
```

### `organizationMemberships`

User roles inside organizations.

```typescript
organizationMemberships: {
  organizationId: Id<"organizations">,
  userId: Id<"users">,
  role: "owner" | "admin" | "recruiter" | "billing" | "member",
  status: "active" | "invited" | "removed",
  createdAt: number,
  updatedAt: number,
}
```

### `organizationSubscriptions`

Organization plan state.

```typescript
organizationSubscriptions: {
  organizationId: Id<"organizations">,
  planKey: "org_community" | "org_partner" | "org_patron" | "org_founding_partner",
  status: "active" | "trialing" | "past_due" | "canceled" | "expired" | "comped",
  source: "stripe" | "admin" | "legacy",
  stripeCustomerId?: string,
  stripeSubscriptionId?: string,
  currentPeriodEnd?: number,
  createdAt: number,
  updatedAt: number,
}
```

### `sponsoredMemberships`

Tracks sponsored creative seats.

```typescript
sponsoredMemberships: {
  organizationId: Id<"organizations">,
  userId?: Id<"users">,
  invitedEmail?: string,
  status: "available" | "invited" | "active" | "revoked" | "expired",
  membershipId?: Id<"memberships">,
  grantedByUserId: Id<"users">,
  startsAt?: number,
  endsAt?: number,
  createdAt: number,
  updatedAt: number,
}
```

### `entitlementOverrides`

Admin and special-case grants.

```typescript
entitlementOverrides: {
  subjectType: "user" | "organization",
  subjectId: string,
  capability: string,
  effect: "allow" | "deny",
  reason: string,
  expiresAt?: number,
  createdByUserId: Id<"users">,
  createdAt: number,
}
```

### `billingCustomers`

Shared customer mapping for Stripe or another billing provider.

```typescript
billingCustomers: {
  subjectType: "user" | "organization",
  subjectId: string,
  provider: "stripe",
  customerId: string,
  createdAt: number,
  updatedAt: number,
}
```

## Entitlement Evaluation

Implement shared helpers that return capability decisions and limits.

Example API shape:

```typescript
type EntitlementDecision = {
  allowed: boolean;
  reason:
    | "public"
    | "active_membership"
    | "organization_plan"
    | "sponsored"
    | "admin_override"
    | "limit_reached"
    | "missing_capability"
    | "expired"
    | "not_authenticated";
  planKey?: string;
  limit?: number;
  used?: number;
  upgradePlanKey?: string;
};
```

Suggested helpers:

```typescript
getUserEntitlements(ctx, userId)
canUser(ctx, userId, capability)
canOrganization(ctx, organizationId, capability)
canOrganizationUser(ctx, userId, organizationId, capability)
getOrganizationLimit(ctx, organizationId, limitKey)
assertCanUser(ctx, userId, capability)
assertCanOrganizationUser(ctx, userId, organizationId, capability)
```

Server-side rules:

- Every mutation that creates paid/limited resources must call an entitlement helper.
- Every query returning gated media or private event details must filter or lock based on entitlement.
- Client-side checks are for UX only; they are not security.
- Admin overrides should be explicit and auditable.

## Feature Gates

### Member Gates

| Moment | Free Experience | Paid/Sponsored Unlock |
| --- | --- | --- |
| Paid replay click | Preview + upgrade CTA | Signed playback URL |
| Paid live session RSVP | Preview + upgrade CTA | RSVP/join link or room token |
| Permanent/expanded wonderings | Explain current free limit | Permanent/multiple wonderings |
| Premium event archive | Show title/guest/clip | Full replay/resources |

### Organization Gates

| Moment | Community Tier Experience | Paid Org Unlock |
| --- | --- | --- |
| Second active job | Limit reached: 1 active job | Partner: 5 active jobs |
| Direct message creative | Explain direct outreach is partner feature | Partner+ messaging |
| Add logo/profile rich content | Basic listing only | Partner+ org profile |
| Sponsor memberships | Explain patronage | Partner: 5, Patron: 20, Founding: 50+ |
| Request matching/support | Register interest | Patron+ support/matching |

## Paywall UX Requirements

Use the same pattern everywhere:

1. Name the locked value: "Unlock paid replays" or "Post more active jobs."
2. Show why now: "You have reached 1 active job on the Community plan."
3. Show the upgrade path: "Partner includes 5 active jobs and direct messaging."
4. Keep an escape hatch: "Not now", "Back to jobs", or "Keep current plan."
5. Track impression, CTA click, checkout start, checkout completion, and dismissal.

Avoid:

- Blocking core onboarding before a user has built a profile or posted work.
- Hiding the free path.
- Using plan names in UI without explaining the user outcome.
- Letting the frontend be the only enforcement layer.

## Billing Integration

### MVP Billing

Support three sources first:

- `admin`: manual comp or founding member access.
- `sponsored`: organization-funded creative memberships.
- `stripe`: paid subscriptions once checkout/webhooks are wired.

### Stripe Events To Handle

If using Stripe, handle at least:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

Webhook behavior:

- Upsert billing customer.
- Upsert membership or organization subscription.
- Update status and current period end.
- Never delete access history; mark canceled/expired instead.

## Admin Requirements

Admin needs are part of the MVP because early access will be messy.

Admin should be able to:

- Search users and organizations.
- View current plan, source, status, period end, sponsor, and overrides.
- Grant or revoke paid/comped access.
- Assign organization plan.
- Allocate sponsored membership seats.
- Inspect why an entitlement decision allowed or denied access.
- See Stripe IDs when present.

## Migration Plan

1. Create `free_creative` membership rows for existing users.
2. Preserve `profiles.plan` temporarily for compatibility.
3. Add `getUserEntitlements` and update new gates to use it.
4. Migrate wondering paid checks from `profile.plan === "paid"` to capabilities.
5. Create organization records for real partner accounts separately from `crawledOrganizations`.
6. Seed plan definitions from the organization page tier model.
7. Add admin tools before public checkout.

## Implementation Order

### Phase 1: Read Model And Manual Access

- Add schema tables for plans, memberships, organizations, organization memberships, organization subscriptions, sponsored memberships, and overrides.
- Seed plan definitions and capabilities.
- Add entitlement helper functions.
- Add admin/manual grant mutations.
- Migrate existing paid checks to helper-based checks.

### Phase 2: Organization Enforcement

- Add organization accounts and roles.
- Enforce active job limits by org plan.
- Gate direct messaging from orgs to creatives.
- Add sponsored membership allocation and invite flow.

### Phase 3: Member And Media Gates

- Add event/media access levels.
- Add locked states.
- Add signed playback/token issuance hooks for Cloudflare/Zoom/LiveKit.
- Track paywall impressions and conversions.

### Phase 4: Billing

- Add Stripe checkout and customer portal.
- Add webhook processor.
- Connect Stripe prices to plan definitions.
- Add dunning/past-due behavior.

## Success Metrics

| Metric | Why It Matters |
| --- | --- |
| Free creative activation | Free supply side must stay healthy |
| Org register-interest to paid org conversion | Validates organization monetization |
| Active jobs per paid org | Validates hiring value |
| Sponsored seats allocated and activated | Validates patronage model |
| Paywall impression to checkout click | Measures upgrade intent |
| Checkout completion | Measures purchase friction |
| Paid replay/live session attendance | Validates media paywall |
| Paid member retention | Validates recurring value |

## Open Decisions

- Should individual paid membership start at the previously discussed $50/year or include monthly pricing?
- Should organization team members also receive paid creative benefits, or only organization capabilities?
- Are paid events included in paid creative membership, sold separately, or both?
- Can organizations sponsor specific named creatives, or only invite/allocate seats?
- Should free organizations be allowed one active job forever, or one trial job?
- How should sponsored membership benefits appear publicly on a creative profile, if at all?
- Should admins be able to grant capability-level overrides directly, or only plan-level overrides?

