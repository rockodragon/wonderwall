# Filmmaker recruitment: JTBD and gap analysis

2026-10-27 · **Current-code assessment; proposed requirements for review.**
Source baseline: `cf9fbff`. This is a repository audit, not a production walkthrough or user study. “Built” below means present in this checkout; deployment and usability remain to be verified. No application behavior was changed for this analysis.

## Verdict

A filmmaker can publish a film project, advertise several paid or volunteer roles, invite collaborators, receive requests, inspect people's profiles and completed work, talk through terms in direct messages, and accept people onto the team. The platform provides a credible community recruitment foundation.

It does not yet carry the filmmaker confidently through **compare candidates → agree scope, dates and price → mutually confirm the engagement → know what needs attention**. The filmmaker must remember decisions, compare profiles across pages, and keep the actual agreement in conversation text or elsewhere. It works best for a small, familiar crew; it becomes harder with several openings and unfamiliar applicants.

The product opportunity is to make each next step obvious and preserve its context. Building a complete production-management suite is outside this proposed first increment.

## Existing requirements: what we already had

| Document | Relevant requirements | Limitation |
|---|---|---|
| [Project teams](project-teams.md) | Requests, invitations, acceptance, credits, stages, announcements | Closest spec. No complete candidate evaluation or terms-agreement journey; status and some rules lag code. |
| [Projects IA](project-ia.md) | One project, multiple open roles with individual pay, discovery, portfolio as completed projects | Explains the product model and some discrepancies; not an end-to-end filmmaker JTBD assessment. |
| [Shortlist](../handoff/favorites-redesign/README.md) | Leading, waiting, invitations, saved roles, “Needs you,” accept/decline | Already supplies personal follow-through. Does not specify a filmmaker's private candidate comparison workflow. |
| [Jobs PRD](../jobs-feature-prd.md) | Poster/seeker stories, relevant work attached to interest, filters, closing jobs | Legacy jobs model. Work selection here must not be assumed to exist on current project applications. |
| [Messaging PRD](../messaging-feature-prd.md) | Member conversations, blocking, reports, unread state | Generic messaging, not project-linked negotiation or agreement. Its blanket five-message limit is outdated. |
| [Live booking](live-booking.md) | Date-specific availability, selected portfolio clips, booking and direct-payment records | Useful adjacent implementation. These features belong to scheduled gigs and are not automatically available to film crews. |
| [Paid community + media JTBD](paid-community-youtube-media.md#jtbd) | Employer sees portfolios and starts conversations to hire confidently | Broad hiring intent, without detailed acceptance criteria for this journey. |
| [Product plan](../the-garden-product-plan.md), [Phase 1B analysis](../phase-1b/architect-gap-analysis.md) | Personas, paid-project applications and broader implementation gaps | Different scope; neither is a current filmmaker recruitment gap analysis. |

**Finding:** relevant requirements existed in fragments. No dedicated, consolidated filmmaker recruitment JTBD and current-code gap analysis was found in the repository before this document. This finding does not cover documents outside the repository.

## Whose job are we solving?

**Filmmaker / producer:** “When I have a film to make and gaps in my crew, help me attract suitable people, judge their contribution, agree clear terms, and keep everyone informed, so I can move into production without losing decisions or damaging relationships.”

**Creative / applicant:** “When I find a film I could help make, help me understand the role and commitment, show the relevant work, discuss fit and pay, and know where I stand, so I can make a confident commitment without doing unpaid administrative work.”

**Collaborating producer:** “When another person helps recruit, let us share review work and decisions with appropriate permissions, so candidates receive one coherent answer.” This is currently constrained by one project lead.

## Journey and coverage

“Partial” means the job is possible with manual work or incomplete support. “Missing” means the reviewed film-project flow has no dedicated capability for it.

| JTBD | Current capability and evidence | Coverage / gap |
|---|---|---|
| J1. Explain the film and attract interest | Project story, media, location, interests, stages; public project page and sharing; signup returns to the project. | **Built foundation.** No film recruitment brief with structured shoot dates, commitment, deliverables or ownership terms. Exact role/application intent through signup needs verification. [E1, E2] |
| J2. Advertise different jobs | Open roles have title, short description, tags, fill-by date and independent amount/range/proposals/confidential/volunteer pay. Roles appear in discovery. | **Partial.** No role headcount, work-date availability, currency or rate unit. Fill-by date is not a shoot date. Project-page UI adds/closes roles; backend editing exists without an editor in this UI. [E1, E3] |
| J3. Find and personally solicit people | People directory filters/searches interests and location/proximity. Lead searches names to invite an existing member, or credits/invites an off-platform person by name/email. | **Partial.** No structured date availability, proficiency, equipment or day-rate filter. Interests are self-described discovery tags, not demonstrated skills. [E4, E5] |
| J4. Apply for suitable openings | Apply to a posted role or propose a free-text role, with an optional 500-character note; withdraw request. | **Partial.** One active relationship per person per project prevents independent applications to multiple roles on the same film. No selected work samples, availability or rate proposal fields. [E3, E5] |
| J5. Evaluate skills and portfolios | Requests link to profiles; profiles show interests, bio, completed projects, role credits and work. Shortlist request cards also carry interests and notes. | **Partial.** No application-specific work selection or inline candidate comparison, private review notes, review stage or project-specific candidate shortlist. Accepted credits are useful context, not independent skill verification. [E2, E6, E7] |
| J6. Discuss fit, scope and pay | Existing one-to-one DMs, unread state, notifications and email. Profiles and accepted team rows offer Message. | **Partial.** Request row offers Accept/Decline and a profile link, with no direct Message action. Conversation is shared by the pair, with no project/application association or term card. A proposal can be typed, but it is unstructured. [E1, E8] |
| J7. Agree terms and confirm participation | Lead can accept a request; invitee can accept an invitation; linked role is marked filled. | **Missing agreement layer.** No persistent versioned offer/counteroffer, scope, dates, rate basis, currency or mutual terms confirmation. Lead acceptance of an application immediately adds the person to the team. [E5, E9] |
| J8. Track the recruitment process | Project Team tab shows requests and invitations. Shortlist/Needs you aggregates pending requests, invites, waiting applications and leading projects with actions. | **Partial, with a useful existing base.** No role-by-role recruitment funnel, candidate review stages, agreed-budget summary or recruitment follow-up dates. [E6, E7] |
| J9. Coordinate the confirmed crew | Team roster, role labels, profile affiliations/credits, stages, leave/remove, one-to-one messages and “Message team and supporters.” | **Partial.** No producer permissions, team-only broadcast selection in the project composer, group discussion, shared crew schedule or call-sheet workflow. [E1, E5, E10] |
| J10. Close openings and preserve relationships | Roles can close/fill; requests can be declined with an optional note; leaving/removal can reopen a linked role; completion contributes to portfolio. | **Partial.** No explicit disposition workflow for remaining applicants when an opening fills, reusable crew selection for a new film, or application decision history beyond current state/notifications. [E3, E5, E9] |

## Material gaps and observed inconsistencies

### G1 · Application, membership and engagement are conflated — first increment

`projectMembers` is deliberately one person per project and serves applications, invitations and credits. `requestToJoin` no-ops for an existing pending/invited/accepted relationship; the UI hides additional role Apply buttons. This is sensible for membership uniqueness but blocks “consider me for editing and color” as two independent applications. Withdrawal and invite response are also project-scoped.

**Proposed requirement:** keep one project membership identity while supporting distinct applications to openings and, if wanted, multiple agreed credits. Withdrawing one application must not withdraw another or remove someone already on the crew. Define whether the first increment permits multiple simultaneous applications or an explicit alternative-role preference; do not silently discard the second intent.

### G2 · Evidence is one or more clicks away — first increment

The current request contains role plus note. The legacy jobs PRD promised selected work, and scheduled gigs actually implement selected portfolio clips and inline review. Neither means project requests support them.

**Proposed requirement:** applicants choose up to three existing work samples, identify their contribution, and confirm role-specific availability. Review shows these beside the note, profile and a direct Message action. Preserve the producer's place and filters when returning from a profile. Reuse the media/ownership rules already established for gigs; extract shared behavior rather than copying validators.

### G3 · Posted budget is not an agreed rate — first increment

Role pay declarations support discovery but omit a unit and currency. `$500` could mean per day or for the entire edit. “Open to proposals” has no structured proposal submission. Editing a posting cannot serve as a private agreement with a particular person.

**Proposed requirement:** a compact offer in the existing conversation, tied to project, application and role: scope/deliverables, dates or commitment, currency, amount, hourly/day/fixed basis, included expenses/equipment, and payment timing. Either party can propose a revision; both see the current version and explicitly confirm it. Later changes require fresh confirmation and retain history. Sensitive terms stay private to the parties and authorized producers.

Agreeing an engagement and recording its terms is distinct from executing payment. This proposal does not add escrow, payroll, contracts or a new payment rail. Scheduled-gig payment records and backing payouts are different existing flows, not film-role settlement.

### G4 · Review lacks a project-specific decision workspace — first increment

The existing Shortlist must be extended, not replaced. It already answers “who is waiting on me?” and offers decisions. Its People area follows people globally; it is not a private shortlist of candidates for a particular film role.

**Proposed requirement:** a recruitment view per project, grouped/filterable by role, with New, Considering, Discussing, Offer sent and Confirmed states, private notes, selected work and conversation links. Keep review state separate from membership and commercial agreement state. Show the next action and who owes it. Feed actionable items into the existing Needs you rules rather than introducing competing counters.

### G5 · Acceptance can exceed a filled role — correctness follow-up

`decideRequest` marks a pending member accepted before calling `fillRoleIfLinked`. That helper intentionally does nothing when a role is already filled/closed; it does not reject acceptance. Thus accepting two applicants sequentially for the same opening can leave both accepted while only the first appears as its fill. On-platform invite acceptance uses the same helper. This is observed code behavior, not a reproduced production incident.

**Proposed requirement:** explicitly model capacity or an additional crew place. When an opening is no longer available, make the choice visible: another opening, an unlinked team invitation, or no acceptance. Do not silently present role acceptance and role occupancy as the same outcome. Mutually confirmed engagement should be a separate step for paid work.

### G6 · Recruitment has no structured operational handoff — second increment

One lead handles recruitment. Broadcasts combine accepted crew and supporters, which is suitable for general updates but not private logistics. Film work dates, responsibilities and readiness are not tracked as a crew plan.

**Proposed requirement:** authorized co-producer review, team-only messages, a small roster with confirmed role/terms/availability, and calendar/export links. Begin with links to existing production tools and shared documents. Measure demand before building call sheets, task boards or asset delivery.

### G7 · Application entitlement depends on project kind — resolve before changing

The project-team spec says applying is free. The later live-booking decision requires membership to apply to paid work. Current `requestToJoin` and `getTeam` gate `project.kind === "paid"`; a paid role attached to a passion project follows the free passion-project path. Discovery and Shortlist can nonetheless classify that role as paid.

**Decision needed:** should eligibility follow the opening's pay or its parent project's kind? Choose once, document it, and use the same shared capability decision in UI and mutation. This audit does not change the current business rule. Make any membership requirement visible before application effort, and preserve intent through signup/upgrade.

### G8 · Useful current behavior is hidden by stale docs — documentation follow-up

- `project-teams.md` still says “ready to build,” describes authenticated-only pages and says applying is free. The checkout has implemented teams and public project/profile paths, plus the paid-project gate.
- Older messaging/team specs describe five messages a day. Current messaging limits **cold messages** to 5 for free accounts or 50 for members; once the other person replies, replies are not capped by that limiter. Project applicants/teammates have no dedicated exemption, so first contact can still consume that allowance.
- The Projects IA disagreement inventory is dated 2026-09-27 and must be reverified before treating its individual entries as current bugs.

Reconcile these source specs after scope decisions; this assessment records the discrepancy rather than silently rewriting prior decisions.

## What would make it delightful?

For a short film seeking a DP, sound mixer and editor:

1. **A compelling project becomes a useful crew call quickly.** Add the roles on one screen, showing “2 shoot days · San Diego · $500/day” or “Volunteer · expenses covered.” Make the fill-by date visibly distinct from work dates. A shared role link lands on the exact opening and returns there after signup.
2. **Applying feels like recognition of existing work.** Identity and portfolio are already there. Pick two relevant clips, say what you did, confirm dates, and optionally propose a rate. Keep draft input if the applicant opens the project story or needs membership.
3. **Review feels like meeting the person.** Play a sample while seeing its credit, note and availability. Move to the next candidate without losing context. “Considering” is private; an applicant receives a clear status without seeing internal notes or other candidates.
4. **Conversation remembers why it started.** “About: Sound mixer on [film]” stays visible in the existing DM. The producer asks a question before accepting; neither side retypes the project context.
5. **Agreement is unmistakable.** “USD 500/day × 2 days; kit included; dates …; payment timing …” appears as a private proposal both parties can revise and confirm. Joining the creative team and agreeing a paid engagement are clearly named actions.
6. **The next action comes to you.** “Two new applications; one revised offer needs your reply; one confirmed crew member still needs to confirm dates.” Reuse Shortlist/Needs you, with reminders that stop after resolution.
7. **Closure is considerate.** Filling a role prompts the producer to respond to remaining applicants, with editable messages. Reopening is explicit. When the film ships, confirmed contributions become useful portfolio credits; inviting the same crew to another project is easy.

Delight here means fewer repeated explanations, no lost context, clear commitments and considerate follow-through. Automatic candidate rankings or messages sent without the producer's choice are not required.

## Proposed delivery sequence

| Order | Outcome | Scope |
|---|---|---|
| 1 | Trustworthy openings and participation | Resolve capacity/acceptance behavior (G5), application eligibility (G7), and how alternate roles work (G1); update the relevant specs (G8). |
| 2 | Confident candidate review | Selected work and availability, direct Message, private consideration state and role filters, extending existing Shortlist (G2, G4). |
| 3 | A shared record of the deal | Rate basis/currency on openings; contextual conversations, versioned private proposals and mutual confirmation (G3). |
| 4 | A smooth crew handoff | Co-producer permissions, team-only logistics, crew/terms summary, export and considerate close-out (G6, J10). |

These are sequencing recommendations, not approved scope or delivery estimates. Do not defer staffing consistency behind a visual redesign.

## Acceptance scenarios for the proposed experience

1. A producer posts a film with three roles, mixed paid/volunteer terms, explicit rate units, work dates and separate fill-by dates. Each is discoverable under the appropriate existing browse lens.
2. A signed-out creative opens a shared role link, creates an account, satisfies any stated eligibility requirement, and returns to that exact application without losing intent or entered work.
3. A creative can express suitability for both editor and colorist on the same film under the chosen multi-role policy; withdrawing one does not corrupt the other or accepted membership.
4. An applicant chooses existing work, explains their contribution and states availability. Only authorized reviewers see the application; another applicant cannot see their note, proposed terms or private review notes.
5. A producer reviews several applicants for one role, opens work/profile detail, returns to the same list position, privately marks someone Considering, and messages them without accepting them first.
6. The same two people discuss two films. Each proposal clearly identifies its film and role; decisions in one do not change the other.
7. A producer sends an offer, the creative counters, and both confirm the same version. Changing scope or rate later invalidates the previous confirmation for the revised terms and preserves history.
8. Two acceptance attempts target the final available crew place. The outcome follows explicit capacity rules and gives both people an accurate state; closing a role does not silently confirm another person for it.
9. Needs you shows unresolved hiring actions once, with a clear owner. Replying, deciding or withdrawing removes resolved actions. Sensitive terms do not appear in public team lists, supporter messages or general analytics.
10. A producer sends crew logistics to the crew alone, closes remaining applications considerately, and exports a roster containing only information that the recipient is permitted to see.

## How to validate the assessment

Run a two-person walkthrough with a signed-out recruit, a free account and a member: post three film roles, recruit an outside person, submit several applications, compare work, discuss a price, accept one candidate, close the role and return to Shortlist. Include mobile and desktop. Record where either person must remember context or use another tool. The scenarios above describe the intended future outcome; several are expected to fail in today's implementation.

Measure time to publish a clear crew call; role-link → application conversion, including signup/membership drop-off; application → first meaningful response; time from review to mutually confirmed terms; unresolved/stale applications; and producer/applicant confidence (“Do you know what is expected, what it pays, and who owes the next step?”). Segment by paid/volunteer roles and familiar/new collaborators. Existing general messaging/engagement instrumentation is a base, not proof that this hiring funnel is measured. Set targets after observing a baseline.

## Follow-up tracking

- `wonderwall-hvf9` — this assessment, completed.
- `wonderwall-8j10` — proposed recruitment improvements, G1–G4 and G6; product review and walkthrough precede implementation.
- `wonderwall-xnbp` — explicit filled/closed-role acceptance and capacity behavior, G5.
- `wonderwall-yg10` — application eligibility decision and source-spec reconciliation, G7–G8.

## Source evidence

Line references identify the reviewed baseline and will move as code changes. Negative findings are bounded to these schema and UI paths.

| ID | Implementation |
|---|---|
| E1 | [`projects.$id.tsx`](../../app/app/routes/projects.$id.tsx): `ProjectDetail` (216), `TeamCard` (1815), `RolesSection` (1946), `JoinRequestModal` (2501), `LeadTeamTools` (2645), `AddSomeone` (2814). |
| E2 | [`profile.tsx`](../../app/app/routes/profile.tsx): public profile (55), `listAffiliations` (77), Completed (571); [`projectTeam.ts`](../../app/convex/garden/projectTeam.ts): `listAffiliations` (1620). |
| E3 | [`schema.ts`](../../app/convex/schema.ts): `projectMembers` (1351), `projectRoles` (1396); [`projectTeam.ts`](../../app/convex/garden/projectTeam.ts): `validateRoleBudget` (383), role mutations (1246–1348). |
| E4 | [`profiles.ts`](../../app/convex/profiles.ts): directory filtering (448–513); [`peopleFilter.ts`](../../app/app/lib/browse/peopleFilter.ts): interests and proximity filtering. |
| E5 | [`projectTeam.ts`](../../app/convex/garden/projectTeam.ts): `requestToJoin` (702), `inviteMember` (847), `respondToInvite` (1011), `decideRequest` (1039), `getTeam` (1396). |
| E6 | [`shortlist.ts`](../../app/convex/shortlist.ts): leading projects and pending requests (470–505); [`shortlistCards.ts`](../../app/app/desk/shortlistCards.ts): request cards (220–256). |
| E7 | [`ShortlistActions.tsx`](../../app/app/desk/ShortlistActions.tsx); [`needsYou.ts`](../../app/app/lib/shortlist/needsYou.ts); [Shortlist requirements](../handoff/favorites-redesign/README.md). |
| E8 | [`messaging.ts`](../../app/convex/messaging.ts): cold limits (71), `sendMessage` (126); [`schema.ts`](../../app/convex/schema.ts): conversations (734), messages (767); [`useStartConversation.ts`](../../app/app/lib/useStartConversation.ts). |
| E9 | [`projectTeam.ts`](../../app/convex/garden/projectTeam.ts): `fillRoleIfLinked` (608), `reopenRoleIfVacated` (620), acceptance mutations (1011–1094). |
| E10 | [`announcements.ts`](../../app/convex/announcements.ts): supporters plus accepted-member audience (182–216); project composer in [`projects.$id.tsx`](../../app/app/routes/projects.$id.tsx) (571). |
| E11 | [`gigs.ts`](../../app/convex/garden/gigs.ts): portfolio ownership validation (302), `respondAvailable` (1022), `listResponders` (1273); adjacent reuse candidates, not film-role capabilities. |

GitNexus was consulted for execution-flow discovery. Its resource reported a stale index; the local refresh reported up to date and a context request failed. All material conclusions above were therefore checked against current source rather than inferred from the graph alone.
