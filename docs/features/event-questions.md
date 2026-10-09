# Event questions

Written 2026-10-08. Rick asked for custom questions on RSVP and tickets, "with sensible defaults", using the interests the platform already has. Follows `event-capacity-waitlist.md`: the waitlist and PayPal paths named below land in that batch first. **Nothing here is built.**

## The decision

A host can ask up to 5 questions per event. Nothing is asked unless the host adds one; Apply events start with one optional "What brings you?". The same questions are asked on our site before every way in. Answers live in one table only hosts can read, and are deleted 30 days after the event. Interests uses the platform list, comes filled in from the profile, and changes the profile only if the guest says yes.

## How others do it

- Luma: registration questions (text, options, checkbox, social, company, terms). One list per event, not per ticket, no branching. https://help.luma.com/p/collect-registration-questions
- Partiful: a "Questionnaire" with short answer, dropdown, socials. https://help.partiful.com/hc/en-us/articles/26505707786267-How-do-I-ask-questions-to-my-guests
- Posh: custom checkout fields per ticket type.
- Eventbrite: questions per order and per attendee.

We take Luma's shape: one list per event, no branching. Per-ticket and per-attendee questions are later.

## Question types (v1)

- **Text**: one line, 200 characters. A "Long answer" switch makes it a 3-line box, 1,000 characters.
- **One choice**: 2 to 8 options, 60 characters each. A dropdown.
- **Several choices**: same options, checkboxes.
- **Checkbox**: a statement the guest ticks ("I agree to the photo release"). Required means it must be ticked. Stored as Yes or No.
- **Interests**: the platform list (`INTERESTS` in `constants/interests.ts`, a flat list of 28 words with no groups). Pick any. The host can't edit the list.

Out of v1:

- **Phone.** A Text question can ask for one, unchecked. Only Table guest RSVPs hold a verified phone today (`eventRsvps.phone`).
- **Socials, company.** A Text question ("Instagram handle") does the job.
- **File upload, date, number, branching, per-ticket questions.**

## Defaults: what a host gets with no work

- **Free RSVP and Join: no questions.** A signed-out visitor already does name, email and a code. Every extra field costs RSVPs.
- **Apply (host approval): one question, "What brings you?"** Text, Long answer, optional. It is a real row in the host's list, so they can edit or delete it. It replaces the free note (`eventApplications.message`).
- **Paid tickets (on-site, Stripe link, PayPal): none.**
- **Nothing is required by default.** Required is the host's choice.
- **Interests is a template, not a default.** It's the first one offered. See Open questions.
- **Existing events don't change.** An event with no `questions` field keeps today's note box on Join and Apply [Certain: `JOIN_OR_APPLY` in `event.tsx`]. Only events saved after this ships get the Apply default.

Templates, one tap under "Add a question". All start optional:

- **Dietary needs**: Text. "Any food allergies or dietary needs?"
- **Accessibility needs**: Text. "Anything that would make this easier for you to attend?"
- **How did you hear about this**: One choice. A friend, Instagram, Email, A flyer, Other.
- **Plus-one names**: Text. "Who are you bringing? Names." It collects names only. It doesn't hold spots or count against the limit; real +1s are a later batch.
- **Emergency contact**: Text. "Emergency contact: name and phone."
- **What are you into?**: Interests.
- **Write your own.**

## Interests

- **Prefill.** A signed-in guest sees their `profiles.interests` already picked. Entries starting `other:` are skipped, the way `shortlistCards.ts` skips them. A signed-out visitor starts blank: they have no profile until the code.
- **Display.** Picked chips with a "Change" button, not a 28-chip wall. Same pill style as Settings.
- **The answer** is saved on the event, host-only.
- **Profile write-back is opt-in.** An unticked box, "Add the new ones to my profile", shown only when a pick isn't already there. It adds; it never removes.
  - Why: profile interests are public. The profile page shows them and People search matches on them. A host's question shouldn't change what everyone sees without a yes.
- **Never used for matching, search or email.** They are for the host.
- **The host sees counts** at the top of the Guests tab: "Music 8 · Photography 6 · Writing 4", top five, "All" opens the rest. Choice questions get the same strip. Counts cover people going.
- **The community does not see counts in v1.** In a 10-person event, "Poetry 1" points at someone. A community-wide view needs a floor (5 guests) and is later, if asked.

## Where questions are asked

On our site, before the guest leaves or pays. One `answers` argument on each path, checked on the server in the same transaction, so a required question can't be skipped by calling the mutation directly.

- **RSVP** (`rsvpToEvent`), **Join and Apply** (`events.apply`): on the card, above the button.
- **Signed-out RSVP** (`useGuestRsvp`): questions sit on step 1 with name and email, stay in the page through the code step, and go up with the RSVP. No extra step. Cost: no Interests prefill for a visitor.
- **Join the waitlist**: asked when they join. "Let in" then needs nothing more, and the answers stay.
- **PayPal Get tickets**: asked before `startPayPalTicket`, then they go to PayPal.
- **On-site tickets**: asked before `createTicketCheckout` opens Stripe. These need an account, as PayPal does. Today a guest can check out [Certain: "auth is optional" in `garden/stripe.ts`]; on an event with questions, a signed-out buyer makes the account first. See Open questions.
- **Stripe Payment Link: ask on our side, not in Stripe.** Reasons:
  - The link is on AP's Stripe account. A host can't set its fields.
  - Stripe allows 3 fields: text, dropdown, numeric.
  - The webhook already reads the first text field as other guests' names (`guestNamesFrom`).
  - Signed in: "Buy tickets" asks, saves, then opens the link. Signed out: the same sign-in card PayPal uses, first.
- **Links can't be gated.** The link is on the page. Someone who pays straight there skips the questions; the webhook still adds them and the host sees "Didn't answer". Same as the limit.
- **Table events: no questions in v1.** Tables have their own join rules, and guest Table RSVPs have no account [Certain: `rsvpGuestToTableEvent`].
- **Changing answers.** "Change my answers" on the event page, until it starts. It's a new mutation; `apply` refuses a second try.

## Required, limits, editing

- Optional unless the host flips "Required".
- At most 5 questions. Label 120 characters.
- The server checks: required answers present; choices are among the options; Interests are in `INTERESTS`; a required checkbox is ticked; unknown question ids are dropped.
- **Editing a live question.** Label and options can change any time. Type can't once it has answers: remove it and add a new one.
- **Removing a question.** No answers yet: deleted. Answers exist: hidden (`archived`). It stops being asked, leaves the Guests tab, and stays in the CSV as a last column, "Label (removed)". Ids are never reused.
- **Adding or requiring one later** doesn't re-ask people already in. Their cell reads "Not asked".

## Who sees answers, and for how long

- **Organizer and co-hosts only** (`isEventHost`). A guest sees their own.
- Never on Who's going, in Message attendees, in any email, or on any public query. No admin screen reads them [Likely; check when building].
- **Who's going shows today's note.** `getAttendees` returns `message` to anyone who can see the roster [Certain: `events.ts`, `event.tsx` renders it]. Answers never do. Old notes stay as they are. See Open questions.
- **Guests tab.** Rows expand; they don't today [Certain]. Expanded: each question and the answer. The counts strip sits above.
- **CSV.** One column per question after "Added", in the host's order. Several choices and Interests join with "; ". Checkbox is Yes or No. Dietary, accessibility and emergency contact are included: the host asked for them and needs them on the day. The Guests tab says "Answers are deleted 30 days after the event. Download first."
- **Sensitive answers.** Dietary and accessibility can reveal health. One rule covers every answer: host-only, deleted 30 days after, never used for anything else. One rule is easier to say to a guest than a flag per question.
- **Retention: 30 days after the event ends.** A daily sweep, like `notificationRetention.ts`. It reads the event's date at sweep time, so moving the date moves the deadline.
- **Deleted sooner when:**
  - the guest presses Can't make it or Leave the waitlist;
  - the host removes someone from the waitlist;
  - the event is deleted;
  - an account is closed [Guessing: hook in wherever account deletion lives; find it when building].
- **Paid tickets keep their answers.** The ticket is a record and Can't make it doesn't cancel it.
- **Abandoned payments.** Answers saved before the guest left for PayPal or Stripe, with no ticket after, are never shown (the host list is built from people, not answers). The sweep removes them.
- **Privacy page.** `legal.privacy.tsx` says events hold "the guest details attached to an RSVP". Add one sentence on answers and the 30 days. Rick approves the wording before it ships.

## Data model

```
events.questions?: {
  id: string                 // short, stable, never reused
  type: "text" | "choice" | "multi" | "checkbox" | "interests"
  label: string
  options?: string[]         // choice, multi
  required: boolean
  long?: boolean             // text only
  archived?: boolean         // removed after answers existed
}[]                          // absent = old behavior

eventAnswers: {              // one row per person per event
  eventId, userId,
  answers: { questionId: string, value: string | string[] }[],
  createdAt, updatedAt
}  // indexes: by_eventId, by_eventId_userId
```

**One table, not an `answers` array on each row.** The reasons:

- A person can be on `eventApplications`, `eventRsvps`, `eventWaitlist` or `ticketPurchases`, and moves between them (waitlist to RSVP, request to accepted). One row keyed by event and user follows them with no copying.
- Can't make it, Leave the waitlist and Remove each delete one row in one place.
- The Stripe webhooks write RSVPs (`apGifts.ts`). They shouldn't grow an answers argument.
- Same reason as `eventVideo`: private data in its own table fails closed. The public roster queries (`getAttendees`, `buildRsvpVisibility`) never touch it, so a `{ ...doc }` spread can't leak it. One query, `listForHost`, reads it after checking `isEventHost`.
- `userId` is required in v1: every path above needs an account. A later guest path adds `email`, and `mergeGuests` already merges on userId then email.

## Host form

- **Where.** A "Questions" row on the Options step, next to Tickets (`OptionRow` in `CreateEventModal.tsx`). Value reads "None" or "2 questions". Button: "Add questions", then "Edit". Co-hosts can edit it; Tickets stays organizer-only.
- **Inside the row.** Each question has:
  - its text;
  - a type select;
  - an options box, one per line, for the choice types;
  - a "Required" switch;
  - "Long answer", for Text;
  - up and down arrows;
  - Remove.
  Reordering is arrows, not drag, so it works on a phone and with a keyboard.
- **Add.** One button, "Add a question", opens the templates plus "Write your own". At 5 it reads "5 is the most" and is disabled.
- **Under the list**, fixed: "Only you and your co-hosts see answers. They're deleted 30 days after the event."
- **Removing a question with answers** asks first: "Hide this question? Answers stay in your guest list."
- **Approval events.** Turning on "Guests need your OK" on an event with no questions adds "What brings you?" as a normal row. Turning it off doesn't remove it.

## Guest form

- The label as written. Optional ones are tagged "Optional"; required ones "Required".
- Under the block: "Only the hosts see your answers."
- Interests: chips with "Change", then the profile box when it applies.
- Errors are plain and next to the question: "Add an answer to continue."

## Build order

Small slices, each shippable alone.

1. **Schema, pure helpers, tests.** `events.questions`, `eventAnswers`; normalize questions, validate answers, CSV columns, counts, the 30-day rule. No UI.
2. **Save, read and delete on the server.** `answers` on `rsvpToEvent` and `events.apply`; `listForHost`; the daily sweep; delete on Can't make it, Remove and event delete. No answers are stored before the sweep exists.
3. **Host form.** The Questions row, templates, the Apply default.
4. **Guest form** on RSVP, Join and Apply, signed in and signed out. "Change my answers".
5. **Guests tab.** Row expand, counts strip, CSV columns.
6. **Other paths.** Waitlist join, PayPal Get tickets, Stripe link, on-site checkout. Needs the capacity batch in.
7. **Interests.** Prefill, profile write-back, counts.
8. **Privacy sentence**, once Rick approves it.

## Not in v1

Per-ticket and per-attendee questions, branching, phone and socials as types, file upload, a community-wide interest view, "ask again" for people already in, questions on Table events, questions on a guest's non-account path, emailing answers to the host.

## Open questions for Rick

1. **Interests on by default for every event?** I say no: a signed-out visitor sees 28 chips and may leave. Template only, and look again after we see Apply completion.
2. **Account before on-site tickets when the event has questions?** Guests can check out today. The other route is to put answers in Stripe session metadata and write them in the webhook; more work, and abandoned checkouts lose them.
3. **Keep a public "why I'm excited" line?** Today's note shows by the name on Who's going. New answers never do. If you want it, add a "Show on Who's going" switch on one Text question, off by default.
4. **30 days for every answer.** Fine, or keep non-sensitive ones (how did you hear, Interests) longer?
5. **Co-hosts see all answers**, dietary and emergency contact included. They already see the guest list. OK?
6. **Plus-one names** collect names without holding spots. Keep the template, or wait for real +1s?
7. **Community interest counts** (every event in a community, 5-guest floor). Build when a community asks?
8. **The privacy sentence** (slice 8). Your wording.
