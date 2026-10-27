# Recruitment: application evidence, review, conversations and next actions

2026-10-27 · Implementation scope authorized by Rick following the [filmmaker assessment](filmmaker-recruitment-jtbd-gap-analysis.md). Tracking: `wonderwall-8j10.1`.

## Outcome

An applicant can show relevant existing work, describe availability and propose a rate. A project lead can review candidates by role, play work inline, privately mark consideration, and ask a question before deciding. Both people retain the project and role context in their existing conversation. Shortlist makes the next step and its owner clear.

This increment extends applications on `projectMembers`, the existing pair conversation and Shortlist. It preserves current application eligibility and one-person-per-project membership. Multiple independent role applications, formal offers/mutual term acceptance, payments, co-producer permissions and crew logistics remain the separately tracked later work in the assessment.

## Application

- Role and optional application note remain.
- Select up to three existing portfolio samples. The server checks ownership; media selection and rendering are shared with the existing gig/interest flows.
- Availability is optional plain text, up to 500 characters, so a person can state dates, time zone and commitment without pretending the project has a structured shoot schedule.
- Optional rate proposal contains a positive amount, explicit currency and `hour`, `day` or `fixed` unit. It is a proposal, not an agreement or payment.
- Existing applications without the new fields remain valid. Reapplication clears old application evidence and private review state. Existing row-reuse and retry policy continues to apply.
- Applicants can inspect their own submitted evidence. Other visitors and team members do not receive private application details. Only the lead and existing authorized operators receive review state and all applications.

## Candidate review

- Review in the project's Team tab, with a role filter and stable candidate anchors (`?tab=team&candidate=<memberId>`).
- Candidate cards show identity/profile, note, availability, rate proposal and selected samples inline.
- Private states: New, Considering, Discussing. These are review aids, not acceptance, skill verification or a promise to hire.
- Message opens the existing conversation with the application context. Asking a question does not accept the application.
- Existing Accept, Decline and optional decision note remain explicit decisions. The separate capacity/filled-role issue is not silently changed by this increment.

## Context in existing messages

- One conversation per pair of people remains the rule. A conversation can be associated with several project memberships/applications.
- Opening recruitment messaging supplies `projectMemberId`. The backend verifies that the actual pair is the project lead and the application's user, checks project visibility for both, and honors blocks.
- The conversation shows an About selector/banner for available project/role contexts. `?application=<memberId>` selects the intended context; a person can also send a general message.
- Each contextual message stores the membership/application id and the authoritative role label at send time. Reapplying for another role does not relabel earlier messages. Its project/role label makes messages about different films distinguishable even in the same pair's history.
- Context titles are resolved from current authorized data, not trusted client text. Missing or inaccessible contexts do not expose project titles, application notes or proposed rates. Older messages without a role snapshot fall back to the current role; historical commercial-term snapshots are outside this increment.
- An unavailable context selected through a link is explicitly shown as unavailable; sending waits until the person selects an accessible context or General. Draft text is retained.

## One next-action rule

The same pure rule projects the lead's request and the applicant's Waiting row. It reads only the newest message explicitly tagged with that application, through an index; unrelated DMs do not affect it. Messages predating a reused application's submission are ignored.

| Situation | Lead sees | Applicant sees |
|---|---|---|
| New application, no contextual messages | Review; Needs you | Waiting on the lead |
| Considering/Discussing, no contextual messages | Review next step; Needs you | Waiting on the lead; private stage is not returned |
| Lead sent the newest contextual message | Waiting on applicant | Reply; Needs you |
| Applicant sent the newest contextual message | Reply; Needs you | Waiting on lead |
| Accepted, declined, withdrawn or project finished | No pending-application next action | No pending-application next action |

Reading a message does not count as replying. A pending application remains a pending decision; the next-action rule indicates who owes the next conversational step. Lead request counts continue to count pending applications. Shortlist badges/counts/Today use the existing Needs you computation, and phone/desktop links point to the same review or conversation. No second task queue or reminder scheduler is added.

## Acceptance and regression coverage

1. An applicant selects their own samples, states availability and proposes `USD 500/day`. Arbitrary samples owned by another profile, excessive selections and invalid rates are rejected server-side.
2. A lead filters pending candidates by role, reviews playable samples and messages without accepting. Private review state survives reload and remains invisible to the applicant/public.
3. The pair discusses two films in one existing thread. Context selection survives a direct link/reload, and each contextual message is labeled with its film/role.
4. Another member cannot forge an application context; hidden/deleted projects and blocked pairs do not expose context through query or mutation paths.
5. A new application needs lead review. A contextual producer message moves Reply to the applicant's Needs you; the applicant's reply moves it back. Unrelated DMs do not alter this, and reapplication does not revive old messages.
6. Accept/decline/withdraw/finished project remove pending next actions. Older rows without new fields, event approvals, invitations, gig media selection and general messages continue to work.

Deployment requires both updated Convex schema/functions and the frontend. A repository build alone does not deploy the backend.

## Validation

- Full suite: 273 test files, 4,730 tests passed; TypeScript and production build passed.
- Local Chromium smoke checks at 1365×1000 and 390×844: role filtering, profile/back candidate restoration, private review stages, inline media, applicant evidence, contextual messaging links and sample-selection limit passed. No horizontal overflow or page JavaScript errors.
- Authorization/privacy regressions cover foreign work samples, unauthorized review, forged contexts, blocks, inaccessible projects, historical role labels and reused-application message boundaries. No production data was changed during validation.
