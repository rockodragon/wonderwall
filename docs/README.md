# Product Documentation

This directory holds product strategy, feature specs, and implementation research for TheCrossBoard, also referred to as The Cross Board. The public destination is [thecrossboard.org](https://www.thecrossboard.org). Wonderwall appears in parts of the codebase as the underlying project name.

## How To Use These Docs

Start with business outcome and user journey before implementation. Each feature should answer:

- What user job does this help someone complete?
- What business outcome does it support?
- Where does it sit in the journey: discover, join, show work, find opportunity, participate, or go deeper?
- What is the smallest useful version?
- What should remain flexible until the community proves demand?

## Core Product

- [Root product README](../README.md): high-level vision for TheCrossBoard.
- [Core PRD](prd.md): existing Wonderwall product requirements for creative profiles, discovery, events, and invites.
- [Strategic plan](thecrossboard-strategic-plan.md): monetization and competitive positioning for The Crossboard direction.
- [Priority brief](priority-brief.md): current delivery priorities.

## Feature Specs

- [Jobs feature PRD](jobs-feature-prd.md)
- [Messaging feature PRD](messaging-feature-prd.md)
- [Event location PRD](prd-event-location.md)
- [Entitlements and paywall foundation](features/entitlements-paywall-foundation.md)
- [Member paywall and live media integration](features/paid-community-youtube-media.md)

## Research

- [Organization sponsorship add-ons](research/org-sponsorship-add-ons.md)
- [Job board crawler strategy](research/job-board-crawler-strategy.md)
- [Crawler implementation](research/crawler-implementation.md)

## Board Materials

- [Board review deck: paid membership and live events](decks/thecrossboard-board-review.html)

### Publishing Board Decks

The UpSight deck publisher lives in the separate Insights repo, so run uploads from that directory:

```bash
cd /Users/richardmoy/Code/ai/Insights
npx tsx scripts/upload-deck.ts /Users/richardmoy/Code/ai/wonderwall/docs/decks/thecrossboard-board-review.html /Users/richardmoy/Code/ai/wonderwall/docs/decks/assets --title "CrossBoard for Abiding Practice"
```

## Proposed Structure

Use this structure for new docs:

```text
docs/
  README.md
  prd.md
  features/
    <feature-name>.md
  research/
    <research-topic>.md
```

Feature specs belong in `docs/features/` when they describe a new product capability. Research belongs in `docs/research/` when it compares vendors, markets, APIs, or implementation options.
