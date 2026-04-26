# Product Documentation

This directory holds product strategy, feature specs, and implementation research for thegrassboard/Wonderwall.

## How To Use These Docs

Start with business outcome and user journey before implementation. Each feature should answer:

- What user job does this help someone complete?
- What business outcome does it support?
- Where does it sit in the journey: discover, join, show work, find opportunity, participate, or go deeper?
- What is the smallest useful version?
- What should remain flexible until the community proves demand?

## Core Product

- [Root product README](../README.md): high-level vision for thegrassboard.
- [Core PRD](prd.md): existing Wonderwall product requirements for creative profiles, discovery, events, and invites.
- [Strategic plan](thecrossboard-strategic-plan.md): monetization and competitive positioning for The Crossboard direction.
- [Priority brief](priority-brief.md): current delivery priorities.

## Feature Specs

- [Jobs feature PRD](jobs-feature-prd.md)
- [Messaging feature PRD](messaging-feature-prd.md)
- [Event location PRD](prd-event-location.md)
- [Paid community and YouTube media integration](features/paid-community-youtube-media.md)

## Research

- [Organization sponsorship add-ons](research/org-sponsorship-add-ons.md)
- [Job board crawler strategy](research/job-board-crawler-strategy.md)
- [Crawler implementation](research/crawler-implementation.md)

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
