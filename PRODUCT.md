# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

As thecreative.exchange describes them (app/routes/home.tsx, "Who it's for"):

- **Creatives** show their work, find their people, and get paid: paid or passion projects, collaborators, backing with real deadlines, communities, coaches.
- **Patrons** back a person or project they believe in, cover memberships, or offer a venue, gear or an introduction.
- **Community partners** (venues, businesses, nonprofits, churches) post paid work, cover memberships, or share space.
- **Hosts** run a community, a class or a Table, and earn from what they teach.

## Product Purpose

TheCreative.exchange is where creatives find paid work, get backed by people who believe in them, and apply for grants (`CLAIMS.whatItIs`). Its line: "Create better together." Creatives, patrons, hosts and partners in one place, building flourishing communities.

## Positioning

One account across communities. Each community has its own address, brand, membership price, agreements and grant fund, and they all share one platform.

- **The Garden** is the Christian creative community, where this started. Its addresses are garden.thecreative.exchange and createthegarden.com. Its fund is The Sophia Grant Fund, run by Abiding Practice, a 501(c)(3).
- **The Creative Exchange** is the secular community, set up per city (San Diego at /sd).

## Operating Context

- Signed in, people work on their **Canvas** (never "desk" in anything a person reads; the code still says desk until a rename). It's a dotted dark surface with event posters, project cards and paper notes, plus one palette button for navigation (docs/handoff/garden-desk-palette/README.md).
- Public pages are for visitors deciding to join, back, partner or host.

## Capabilities and Constraints

- People, projects (including paid work and backing), events and tickets, classes, Tables, grant funds, member-directed giving, messages, organizations.
- Money words come only from `CLAIMS` (app/constants/claims.ts), checked by claims.test.ts. Never promise that all money is disclosed.
- A community's own words (tagline, description, agreements) come only from host tools, never from code.

## Brand Commitments

- **Voice:** plain, not folksy. Nouns are vocabulary, not metaphor. Half the words: a headline, one line, the choices. Explanations go behind an info icon.
- **The Garden's manifesto** is its host-tools tagline and description. Today that's "To love our neighbor through our craft", followed by paragraphs on growing crafts, finding people and deepening faith; supporting work that builds bridges toward the True, Good, and Beautiful; and creativity that renews people and culture. It reads as a manifesto, not a product summary. The product is what thecreative.exchange describes.
- **The Garden's mark** is a crimson G disc (`#D93A4B` on dark), used for the mark only and never for text. The wordmark is Jost Medium, never set in all caps.
- **Avoid on The Garden's pages:** church clichés (doves, stained glass, script type, sunbeams), a sales pitch (stats, testimonials, urgency, feature grids), and too many words.

## Evidence on Hand

- Live data: The Garden's events (with covers), projects, members' profiles, and The Sophia Grant Fund's balance and open call.
- Campaign photos of craft in app/public/campaign/, described in app/lib/campaign.ts.
- **Absent, never invent:** testimonials, member counts, partner logos, press, outcome numbers.

## Product Principles

1. Projects and giving come first; events follow (Rick, 2026-10-09). The calls are "Share your project" and "Give some of our grant money away. We trust your vote."
2. Show the work and the people, not claims about them.
3. One account, many communities. A community's page is its own, but the platform underneath is shared.
4. Say it once, plainly, and put the action right there.

## Accessibility & Inclusion

- Contrast: body text at least 9:1 on ink, dim text at least 6:1.
- Type: nothing under 12px. Nav 15px, buttons 13.5px.
- Motion respects reduced-motion; the Garden grow animation never plays when reduced motion is on.
