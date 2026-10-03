# Architecture Decision Record: Tables as the Primary Community Container

## Status

**Accepted**

## Context

The Garden already has an `Event` entity designed primarily around a scheduled, one-time occurrence.

As the Creative Exchange expands, it needs to support additional formats:

- one-time workshops
- recurring gatherings
- multi-session classes
- mentorship groups
- retreats
- discussion groups
- service projects
- paid programs
- free programs
- member-only experiences
- invite-only experiences

These formats share a common characteristic: they are not fundamentally different types of community objects. They are groups of people organized around a shared purpose, with one or more scheduled events.

The architecture should support these formats without creating separate first-class entities for concepts such as `Workshop`, `Cohort`, `Course`, `Group`, and `Gathering`.

The public language should also feel native to **The Garden**, rather than importing terminology from education software, event platforms, or startup communities.

---

# Decision

Introduce **Table** as the primary community container.

**Scope clarification, 2026-10-03:** Table is a platform-wide domain entity, available to every community. The Garden's public vocabulary and visual metaphor sit on top of this shared model.

Membership eligibility and Table pricing are independent. A Table may be:

| Membership required | Table enrollment price | Participation |
|---|---|---|
| No | Free | Join without buying a membership or paying a Table fee. |
| No | One-off fee | Pay for the Table without buying a membership. |
| Yes | Free to eligible members | Required membership includes participation in this Table. |
| Yes | Additional one-off fee | Hold the required membership and pay the Table fee. |

“No membership required” refers to community membership, not to the Table's own participation record. Joining still creates a Table Membership. A paid Table does not automatically become member-only; a member-only Table does not automatically have an additional price. **Membership-gated Tables require membership in their own community** (confirmed 2026-10-03); membership in another community does not qualify. Eligibility and any additional payment are checked independently on the server.

A Table is the persistent group or program that people join.

An Event is a scheduled occurrence associated with a Table.

The core conceptual model is:

> **People set Tables. Other people pull up chairs. Tables contain Events.**

A Table is therefore similar to a conventional **group**, but with additional structure around programming, participation, access, scheduling, and payment.

**Creation and launch direction, 2026-10-03:** Free account holders can set free, one-time Tables. Publishing paid or ongoing Tables requires membership in the Table's community; no separate approved-host tier is required. This follows the existing distinction between free Event posting and membership-backed paid/ongoing programming. Guests are permitted only when the Table allows external guests; guest Event participation does not silently create an account-level Table Membership. First-release pricing is free or a fixed one-time payment. Donation and pay-what-you-can pricing remain later options. **Roster privacy is confirmed:** visitors and guest Event RSVPs cannot see the roster; joining with any required acceptance, membership and payment satisfied unlocks participant visibility. Public profiles remain governed by their existing profile visibility; private Table membership is not revealed publicly. See the implementation plan for further privacy recommendations.

Conceptually:

> **Table = group + program + event container**

Examples:

- A painting workshop is a Table containing one Event.
- A six-week poetry class is a Table containing six Events.
- A monthly songwriter circle is a persistent Table containing recurring Events.
- A dinner gathering is a Table containing one Event.
- An eight-week mentorship program is a Table containing eight Events.
- A community service project may contain planning meetings, work days, and a final exhibition as separate Events.

The existing Event entity remains intact and becomes subordinate to Table.

---

# Core Domain Model

## Table

A persistent community container representing a shared purpose, activity, program, or group.

Examples:

- Poetry & the Sacred
- Songwriter Circle
- Creative Exchange Night
- Pottery & Formation
- Filmmaker Mentorship
- Art for Your Neighbor

A Table may exist for one afternoon, several weeks, indefinitely, or on a recurring basis.

## Event

A scheduled occurrence.

An Event belongs to a Table.

Examples:

**Poetry & the Sacred**
- Week 1 — Attention
- Week 2 — Lament
- Week 3 — Metaphor
- Week 4 — Reading Night

Each of those is an Event belonging to the same Table.

For a one-time workshop:

**Writing From Attention**
- Saturday, October 17, 10 AM–1 PM

The Table contains only one Event.

## Membership

Membership represents the relationship between a person and a Table.

A person **joins a Table**.

Membership can contain:

- joined date
- membership status
- access level
- payment/enrollment state
- invitation source
- host role
- membership metadata

This should be separate from event attendance.

## Attendance

Attendance represents a person's participation in an individual Event.

A person therefore:

> joins a Table\
> attends Events

This distinction allows The Garden to understand longitudinal participation.

Example:

```text
Person
 └── Membership
      └── Songwriter Table
           ├── Event: January Gathering
           ├── Event: February Gathering
           ├── Event: March Gathering
           └── Event: April Gathering
```

The individual Attendance records reveal how active the member actually is.

---

# Cohorts

`Cohort` should **not initially be a first-class entity**.

In most cases, a cohort is simply a pattern that can be derived from Table membership and Event attendance.

For example:

> A fixed group participating in a six-session Table Series.

This can be represented through Table configuration:

```text
access = fixed_group
schedule_type = series
```

Rather than:

```text
Table
 └── Cohort
      └── Event
```

This keeps the initial architecture simpler.

## Derived Cohorts and Participation Segments

The system should be able to derive meaningful groups from behavior.

For example:

```text
new_member
regular
active_member
core_member
inactive_member
past_participant
```

Possible rules:

```text
regular
= attended >= 3 events within 90 days

active_member
= attended an event or contributed recently

new_member
= joined within the last 30 days

core_member
= high attendance + sustained membership
```

These rules should eventually be configurable rather than permanently hard-coded.

This enables useful experiences such as:

> You've attended four Songwriter Table gatherings. You're becoming a regular.

Or:

> Seven regular members of this Table haven't attended in the past two months.

Or:

> These twelve people attended both the filmmaking workshop and the storytelling workshop.

These are **derived cohorts**, not manually created groups.

---

# Future Explicit Cohorts

A true Cohort entity may eventually become useful if the same program is delivered repeatedly.

Example:

```text
Program / Table Template
Poetry & the Sacred

    Fall 2026 Cohort
        Session 1
        Session 2
        Session 3
        Session 4

    Spring 2027 Cohort
        Session 1
        Session 2
        Session 3
        Session 4
```

At that point, separating reusable program content from individual runs may justify introducing:

```text
Program
Cohort
Table
Event
```

This should not be implemented until repeated programs create a concrete need for it.

---

# Public Vocabulary

The system should use Garden-specific language publicly while keeping the internal schema neutral.

## Table

Primary community object.

A Table may represent a class, workshop, group, dinner, retreat, discussion, service project, or gathering.

## Set a Table

Primary creation action.

> **Set a Table**

Create a workshop, conversation, gathering, class, project, retreat, or shared creative experience.

## Pull Up a Chair

Primary participation action.

> **Pull Up a Chair**

Join the Table.

This replaces generic actions such as:

- Join group
- Register
- Enroll
- Join cohort

Individual transaction flows can still use language such as "Complete registration" where necessary.

---

# Table Types and Modifiers

These should generally be **properties of a Table**, not separate entities.

## Open Table

Anyone may join.

Example:

> Artist & Vocation\
> Open Table · Free

## Member Table

Restricted to members of the Table's own community, at any required membership level. Participation can be included with that membership or require an additional Table fee.

Example:

> Filmmaker Mentorship\
> Member Table · 8 sessions

## Private Table

Requires invitation or approval.

Example:

> Emerging Directors Critique Table\
> Private Table

## Table Series

A Table containing a defined sequence of Events.

Example:

> Poetry & the Sacred\
> Table Series · 4 sessions · $95

## Recurring Table

A persistent Table whose Events repeat over time.

Example:

> Songwriter Circle\
> Recurring Table · Monthly

## Gathering

`Gathering` should be a format/category, rather than a separate top-level entity.

Example:

> Creative Exchange Night\
> Open Table · Gathering

This keeps the architecture consistent even though the public presentation may emphasize "Gathering."

---

# Host Roles

The underlying system should use a neutral internal role such as:

```text
organizer
```

or:

```text
table_host
```

The creator of a Table should choose how that role is displayed publicly.

Suggested presets:

- Host
- Instructor
- Teacher
- Facilitator
- Guide
- Mentor
- Leader
- Artist
- Coach
- Custom

Example:

```text
internal_role = table_host
display_role = Instructor
```

For another Table:

```text
internal_role = table_host
display_role = Guide
```

This allows the language to match the nature of each experience without fragmenting the permission model.

---

# Suggested Data Model

```text
Table
  id
  title
  description
  owner_id

  format
    workshop
    class
    discussion
    gathering
    retreat
    studio
    service_project
    mentorship
    performance
    other

  schedule_type
    one_time
    series
    recurring

  access
    open
    members
    approval
    invite
    fixed_group

  pricing_type
    free
    fixed_price
    donation
    pay_what_you_can

  price

  capacity

  host_role_label

  events[]
  memberships[]
```

Supporting entities:

```text
Membership
  person_id
  table_id
  joined_at
  status
  role
  payment_status

Attendance
  person_id
  event_id
  status
  attended_at

Event
  table_id
  starts_at
  ends_at
  location
  capacity
  event-specific metadata
```

---

# Iconography

The Garden should use a small visual language reinforcing the Table metaphor.

## Table Icon

A simple overhead representation:

> **circle with small dots or chairs around the perimeter**

Conceptually:

```text
    •
  • ○ •
    •
```

Meaning:

- community
- belonging
- gathering
- conversation
- shared participation

Use for:

- Table navigation
- table cards
- "Your Tables"
- Table creation
- community activity

The icon should remain simple enough to work at approximately 16–24 px.

## Pull Up a Chair Icon

A literal chair shown from the side.

The silhouette can resemble a simplified lowercase/uppercase **H-like form**:

```text
│
├──
│  │
   │
```

The exact icon should read immediately as a chair rather than as abstract furniture or an H.

Use for:

> **Pull Up a Chair**

It can also represent:

- available seats
- membership
- invitations
- capacity

Examples:

> 🪑 8 chairs remaining

or, using the custom icon:

> [chair] Pull Up a Chair

## Relationship Between the Icons

The Table represents the community.

The Chair represents the individual entering it.

This creates a useful visual grammar:

> **Table = us**\
> **Chair = me**

---

# Example Public Presentation

### Poetry & the Sacred

**Table Series · 4 sessions · $95**

Read poetry shaped by faith, longing, beauty, suffering and transcendence. Write and workshop original work together.

Hosted by Sarah Chen\
**10 chairs · 3 remaining**

**Pull Up a Chair**

---

### Songwriter Circle

**Open Table · Monthly · Free**

Bring a song you're working on. Play it, talk through it, and receive thoughtful feedback from other songwriters.

Facilitated by Marco Diaz

**Pull Up a Chair**

---

### Creative Exchange Night

**Open Table · Gathering · Free**

Meet other creatives. Share what you're making, what you need, and how you can help.

Hosted by The Garden

**Pull Up a Chair**

---

# Initial Program Catalog

| Table | Format | Price | Structure |
|---|---|---:|---|
| Poetry & the Sacred | 4 weeks | $95 | Table Series |
| Writing From Attention | 2–3 hour workshop | $35 | Table |
| Psalms for Poets | 3 weeks | $60 | Table Series |
| The Artist & Vocation | 90-minute conversation | Free | Open Table |
| Making Work That Matters | Half-day | $45 | Table |
| Creative Rule of Life | 4 weeks | $95 | Table Series |
| Figure Drawing + Theology of the Body | 3 hours | $45 | Table |
| Painting Light | Half-day | $55 | Table |
| Icons, Symbols & Sacred Art | 3 hours | $45 | Table |
| Plein Air + Prayer | Half-day | $15 | Open Table |
| Pottery & Formation | 4 weeks | $145 | Table Series |
| Kintsugi & Restoration | 2–3 hours | $55 | Table |
| Songwriting From the Psalms | 4 weeks | $95 | Table Series |
| Songwriter Circle | Monthly | Free | Recurring Table |
| Music, Faith & Culture | Panel/conversation | Free | Open Table |
| Sacred Listening | Evening | $15 | Gathering |
| Film & Meaning | Monthly screening | Free | Recurring Table |
| Make a Short Film in a Weekend | Weekend | $125 | Intensive Table |
| Storytelling for Good | Half-day | $45 | Table |
| Photography as Attention | Photo walk | $20 | Table |
| Theology of Creativity | 3-part series | Free | Open Table Series |
| True, Good & Beautiful | 3 evenings | $30 total | Table Series |
| Art & the Problem of Suffering | Evening salon | Free | Open Table |
| Creativity & Sabbath | Half-day retreat | $35 | Table |
| Business of Being an Artist | 2 hours | $25 | Table |
| Creative Entrepreneurship | 6 weeks | $150 | Table Series |
| Grant Writing for Creatives | 2 hours | Free | Open Table |
| Artist Portfolio Night | Quarterly | Free | Open Table |
| Creative Mentorship Circle | 8 weeks | $195 | Member / Small Table |
| Finish Something | 6 weeks | $125 | Table Series |
| Creative Exchange Night | Monthly | Free | Gathering |
| Open Studio / Open Mic | Monthly | Free | Gathering |
| The Long Table | Dinner + conversation | $20 | Gathering / Long Table |
| Story Behind the Work | Artist talk | Free | Open Table |
| Patron + Artist Conversations | Evening | Free | Open Table |
| Art for Your Neighbor | Project series | Free | Service Table |
| Creative Service Lab | 4–6 weeks | Free | Service Table |

---

# Implementation Plan

Implementation should be handled separately from this architecture decision, but the likely sequence is:

## Phase 1 — Introduce Table

Add the Table entity as the parent container.

Existing standalone Events can either:

- remain standalone temporarily, or
- automatically receive a one-event Table wrapper.

Avoid a disruptive migration if existing functionality works.

## Phase 2 — Table Membership

Introduce persistent Table membership.

Separate:

```text
Table Membership
```

from:

```text
Event Attendance
```

This is foundational for understanding community participation.

## Phase 3 — Event Relationship

Allow:

```text
Table 1 → N Events
```

Support:

- one-time
- series
- recurring

Recurring schedules should generate or reference individual Event instances so actual attendance can still be measured per occurrence.

## Phase 4 — Access and Pricing

Add configurable:

- open
- member-only
- approval
- invite
- fixed-group

and:

- free
- fixed price
- donation
- pay what you can

Pricing belongs primarily to the Table but may eventually allow Event-level overrides.

## Phase 5 — Host Vocabulary

Add configurable:

```text
host_role_label
```

with presets and custom text.

Keep internal authorization roles independent from presentation language.

## Phase 6 — Derived Participation Intelligence

Once Table Membership and Event Attendance exist, compute behavioral classifications such as:

- first-time attendee
- repeat attendee
- regular
- active member
- core participant
- lapsed participant

Do not create separate persistent entities for these classifications unless a future use case requires it.

## Phase 7 — Public UX

Primary actions:

> **Set a Table**

and:

> **Pull Up a Chair**

Table cards should communicate:

- Table type
- number of sessions
- dates
- price
- capacity / available chairs
- host role
- access requirements

Example:

> **Pottery & Formation**\
> Table Series · 4 sessions · $145\
> Guided by Ana Reyes\
> 8 chairs · 2 remaining\
> **Pull Up a Chair**

---

# Architectural Principle

The system should resist creating new domain entities simply because users use different words for experiences.

Workshop, course, group, gathering, mentorship, circle, retreat, cohort and class are primarily **different configurations of a Table**.

The fundamental model remains:

```text
Person
   │
   ├── Membership ── Table
   │                   │
   │                   ├── Event
   │                   ├── Event
   │                   └── Event
   │
   └── Attendance ─── Event
```

This provides enough structure for programming today while leaving room for richer social, behavioral and recommendation intelligence later.

## Summary

**Table** is The Garden's persistent community/group object.

**Event** is a scheduled occurrence within a Table.

**Membership** represents belonging to a Table.

**Attendance** represents participation in an Event.

**Cohorts** are initially derived from membership and attendance behavior rather than represented as independent entities.

The public interaction model is:

> **Set a Table. Pull up a chair. Make something worth sharing.**

This architecture also gives you a strong foundation later for recommendations like “people you keep creating with,” “tables your regular collaborators attend,” and cross-Table participation patterns without adding another social-group system.
