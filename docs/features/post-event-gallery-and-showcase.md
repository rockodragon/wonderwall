# After the event: photos, showcased art, and a follow-up

**Status:** proposal for review; no application changes, deployment, or messages sent.

**Prepared:** November 7, 2026. **Owner:** Rick.

**Spec task:** `wonderwall-fzz9`. **Proposed implementation:** `wonderwall-q0ry`.

## The experience

After a gathering, its event page becomes a place to remember the evening and encourage the artists. A separate thank-you message invites people back with two equally clear actions:

1. **Share your photos** — upload a few phone photos, optionally add captions and tag people, and browse everyone’s pictures.
2. **Leave a note for an artist** — browse the work shown that evening, open a piece, and leave a comment alongside the original work.

The event keeps two sections: **Photos from the evening** and **Art shown at this event**. A snapshot of a painting belongs in the photos; the artist’s actual painting belongs in the showcase. A photo may link to that work. Uploading an event photo does not create a portfolio project or transfer ownership to the platform.

Recommended first release: a manually opened photo gallery for public events, an ordered event showcase linking existing projects, comments on the original project, and one host-triggered follow-up. No new general-purpose collections product or automatic campaign is necessary.

## What exists today

Checked against the current local source. These are code findings, not confirmation that every change is deployed in production.

| Area | Reuse | Missing or different |
|---|---|---|
| Host’s event gallery | `convex/files.ts` and `events.imageStorageIds` | Host-only, maximum three images; no attendee attribution, captions, or person tags. Preserve this promotional gallery. |
| Uploads | `useFileUpload`, `uploadToStorage`, `claimUpload`, `deleteStoredFile` | Batch upload and event-photo publishing. Ordinary gallery files are not resized today. |
| Image processing | `shrinkImage.ts` and location-metadata stripping in the upload path | Aspect-preserving display/thumbnail variants and enforceable byte budgets. Existing avatar/cover settings should keep their defaults. |
| Work and encouragement | Existing Projects, attached artifacts, **Cheer them on**, and `SupportersList` | No general comment thread or event-to-work collection. Cheers are usable for a manual pilot. |
| Guest list | `loadGuests`, `mergeGuests`, `findMyRsvp` | A complete post-event audience shared with announcements. “Going” means registered, not verified attendance. |
| Host messaging | **Guests → Message attendees**, `AnnouncementComposer`, `announcements.ts` | Current broadcast audience omits ticket-only buyers present in the merged guest list. Reconcile before promising everyone will receive it. |
| Media delivery | `functions/media/[id].ts` and shared image URL helpers | Media URLs are publicly readable and cached for up to a day. A hidden page cannot make these images private. |

Paths in this table are relative to `app/`. Related product direction: [Projects IA](project-ia.md), [Announcements PRD](../announcements-prd.md), and [Tables ADR](../adr/tables-primary-community-container.md).

## 1. Host setup and timing

- The host or cohost opens **After the event**, adds the showcased work, chooses the photo settings, and previews the attendee experience.
- Host chooses **Open photo contributions** once the gathering has ended. Prefer an explicit event end time; for older events without one, require host confirmation that it has finished. Do not infer that an event is over merely because its start time passed.
- Contributions stay open for 30 days by default. Host may close early or reopen. Existing published photos and artwork links remain viewable after contributions close.
- A draft or canceled event cannot open contributions or send this follow-up. Host closes comments separately if needed; closing uploads does not close artwork comments.
- Hosts can prepare the showcase before the event, but publishing it and sending the recap are separate actions.

**Visibility decision:** for the smallest launch, enable photo galleries on public events only. The picker must say **“These photos will be public on this event page.”** The uploader confirms before publishing. Private/member-only events keep attendee photos disabled until protected media delivery is built. Private galleries would need authorization on both media bytes and records, suitable caching, and revocation; they are additional scope.

If a public event later becomes private, immediately hide its gallery records and stop contributions, delete the public variants, and begin cache invalidation. Previously public photos cannot be made retrospectively private. Communicate the existing cache delay; do not offer a privacy toggle that only hides the page.

## 2. Sharing photos

### Attendee flow

1. Open **Share your photos** from the follow-up or event page.
2. Sign in if needed; return to the same event and action afterward.
3. Select up to 10 images. Show small previews, per-image progress, and optional **Caption**, **Tag people**, and **Link to a showcased work** controls.
4. Show who can see the photos and a short permission statement: “Share photos you took or have permission to share. Please respect anyone who asks not to be pictured.”
5. Tap **Publish photos**. Each successful photo appears with photographer credit. A failed image can be retried without repeating successful ones.

No caption or tag is required. The upload should work comfortably with one thumb. People can edit captions/tags or delete their own photos later. Show helpful empty, closed, uploading, partial-failure, and unsupported-file states.

### Who may contribute

- Signed-in people on the event’s merged **going** roster may upload; hosts/cohosts may upload too. This includes accepted applications, account-backed RSVPs, and paid tickets after cancellation/refund eligibility is applied.
- A registration is eligibility, not proof the person physically attended. Say **“Were you there? Share a few photos”**, not “Your attendance was verified.” Existing Table attendance can exclude someone explicitly marked absent where that record exists; a missing attendance record does not mean absent.
- Email-only guests first verify the email matching their registration and link it to an account through the existing identity/onboarding flow. Do not trust a typed email, put an email in a public URL, or silently create an unrestricted account. Resolve invite-only signup friction before rollout.
- Walk-ins and people whose ticket was bought by someone else can request host access. Host grants an event-specific contribution permission after sign-in. A purchaser’s plus-ones are not automatically independent contactable accounts.
- Check eligibility when issuing an upload and again when publishing. Event closure, account blocks, or removed eligibility must take effect server-side.

### Mobile image budget

These are proposed product defaults, to be checked on real phones before launch.

| Property | Requirement |
|---|---|
| Input | JPEG, PNG, WebP; reuse the existing 12 MB image input cap. Only still images in v1. |
| Display copy | Maximum 1,600 px on longest edge, preserve aspect ratio, never upscale. Start around JPEG quality 0.72. |
| Display bytes | Aim for 150–350 KB; hard cap 500 KB per image. Reduce quality/dimensions further when necessary. |
| Thumbnail | Maximum 480 px on longest edge; aim for 20–50 KB, hard cap 60 KB. |
| Storage | Keep the two reduced variants and dimensions; do not retain an archival original. |
| Metadata | Apply orientation before encoding, remove EXIF/location data, store photographer credit in the photo record. |
| Browsing | Paginate; load thumbnails first and full display copies only when opened. Reserve layout space using dimensions. |
| Limits | Start with 30 photos per person/event and 1,000 photos/event; host sees a clear limit message. Caption: 300 characters; up to 10 people/photo. |

Quality alone is not a size guarantee. Extend the shared transform/upload pipeline with an explicit event-photo option; do not change all project pictures or avatars. Keep the full frame in the viewer; grid thumbnails may crop visually.

Process a bounded queue to avoid decoding ten full-size images at once on a phone. Release previews when finished. A failed transform must never fall back to uploading the full original. Verify the stored image format, dimensions, byte sizes, and upload ownership on the server before publishing; reject or normalize files that bypass client processing. Track pending variants and remove abandoned uploads within 24 hours.

Test actual iPhone photo-library uploads, including HEIC. If the browser cannot decode an image, explain how to choose/export a JPEG; do not promise HEIC support based only on its extension. Preserve nonfailed selections if one file is unsupported.

At the proposed hard caps, 1,000 photos use at most about 560 MB for image variants before metadata. A 20-photo grid initially loads at most about 1.2 MB of thumbnails. These are planning ceilings, not measured performance or provider costs.

### Person tags and moderation

- A tag identifies an account, not a face position. No face recognition. The picker searches discoverable profiles eligible for the event; it never exposes guest emails or a private attendance list.
- A person receives one bundled in-app tag request per photo. Their name appears publicly only after they accept; they can decline or remove themselves at any time. Self-tags can be accepted immediately. Deduplicate tag notifications; respect blocks and existing delivery preferences.
- Captions are plain text in v1. No automatic account mentions parsed from captions.
- Uploader can edit/delete; host/cohost can hide/remove photos; admins use existing moderation permissions. Anyone can report a photo, including asking for removal because they are pictured.
- Removing a tag removes the association, not the photo. Reporting someone pictured must offer photo removal separately.
- Deletion hides the photo immediately in the app, deletes both stored variants and tag associations, and cancels pending tag notifications. Existing public media caches may serve a copy for up to a day; state this honestly unless cache invalidation is implemented and verified. Copies already downloaded cannot be recalled.

## 3. Art shown at the event

### A curated event collection

Add **Art shown at this event** to the event page. Hosts search/select existing Projects and arrange the cards in the order they want. Cards show the work, title, artist, and **View work & leave a note**. On the project, an optional **Shown at {event}** link returns to the collection when that event is visible to the viewer.

Use an explicit event-to-project relationship, not a free-text hashtag. A project can appear at many events, and an event can show many projects. This is enough to present a collection without building a separate collection editor throughout the platform.

- Obtain the artist’s agreement before publishing their work in the collection. The artist can withdraw the link. The host selects existing work; the host does not acquire permission to edit the original project.
- When work is missing, ask the artist to add it as a completed Project using the existing posting flow, then link it. Do not duplicate the artist’s page just for this event.
- An optional `artifactId` chooses the specific piece/preview shown from a project. Validate that it belongs to that project. The first release’s comments remain project-level; say this when a project contains multiple pieces. Independent per-piece discussions can follow if needed.
- Reuse project visibility rules. An event link never reveals a draft, private, archived, hidden, or deleted work to someone who could not otherwise see it. Likewise, a project backlink must not reveal a private event.
- Removing a card removes the association only. It never deletes the artist’s project, media, support, or comments.
- Existing `showcaseStatus` and showcase voting belong to the earlier jury workflow; they are not the event collection relation.

### Comments beside the original work

Add one shared **Comments** section to the canonical project page, placed with the work rather than hidden in its funding/support panel. Event cards link directly to it. The artist can open the same conversation from their profile/project even after the event ends.

- Signed-in people allowed to view the project may comment. Physical attendance is not required to encourage an artist. Signed-out readers see the existing visible comments and a sign-in prompt that preserves their destination.
- Use a short prompt: **“What stayed with you about this work?”** Optional suggestions: “A detail you noticed” or “A question for the artist.”
- Flat chronological comments, 1–1,000 characters, plain text. Author can edit/delete their comment; mark edited comments. Artists respond with their own comments in v1. Replies, reactions, ratings, and threaded discussion can wait.
- On a public project, show **“Your comment will be public”** before posting. Event-origin comments have the same audience as the project. Do not imply they are confined to the attendee gallery.
- Keep one conversation across all events. Store optional source-event context without making that event visible to unauthorized readers. A general visitor’s comment needs no event association.
- Artist can hide/report comments on their work; hosts may flag event-origin comments and remove a work from their event, but do not gain global moderation rights over someone else’s project. Admins apply platform moderation. Apply existing block rules to reads and writes.
- Notify the project owner through shared notification/digest rules, excluding self-comments and honoring preferences. Do not email every attendee about every comment. The first release does not subscribe commenters to a new thread notification system.
- If the work is hidden, its comments disappear with it. Deleting an event removes the association/source context, not the canonical artwork conversation.

**Manual pilot alternative:** use **Cheer them on** today for a free written note. Those messages already appear on the project and notify the artist, but they are encouragement records, not editable/reportable comment threads. Keep their label and behavior honest; do not relabel cheers as full comments or migrate them without a separate decision.

## 4. Separate attendee follow-up

This is one additional host-authored thank-you message after the event, separate from the existing pre-event reminders. It contains both options; people do not need two separate messages. Start with manual sending, ideally the next day once the collection and gallery are ready.

Reuse **Message attendees**, the recipient snapshot, queued batches, and notification/email delivery. Registered people receive in-app notifications and email according to preferences; email-only guests receive email. SMS is not included. The existing email CTA opens the event page, where both actions should be prominent.

Before sending:

- Build the audience from the same merged event guest source used by the host guest list, including paid ticket-only buyers. Centralize the rule so preview, send, and delivery cannot drift. Preserve existing reminder semantics when introducing the new post-event audience policy.
- Preview says **“Registered guests”** unless actual attendance is known. Default to eligible going guests; exclude declined/pending, canceled/refunded registrations, and explicit absent records where available. Allow host exclusions for known no-shows without deleting historical registrations.
- Deduplicate linked users and normalized email addresses across RSVP, applications, and tickets. A linked guest/account receives a single intended notification and at most one email. Do not expose the recipient list to other recipients.
- Show eligible, excluded, and unreachable counts. Plus-ones without their own email/account cannot be individually messaged; say so. Do not invent addresses or treat purchaser quantity as separate recipients.
- Respect existing preferences, suppression, and blocked-recipient rules. Guest-email opt-out handling needs review; do not silently subscribe recipients to ongoing marketing.
- Save an immutable recipient snapshot and a send intent/idempotency key. Retries must not create a second announcement or requeue completed recipients. Surface uncertain email delivery for review rather than blindly resending an entire batch.
- Keep existing limits visible: 2,000-character body, two broadcasts/event/24 hours, and 500 resolved recipients per send. For this first release, block larger sends with an actionable message; expanding the limit requires a separately reviewed paginated audience job.
- Preview the final message and destination links; enable **Send follow-up** only when both advertised actions are live. Show queued/sent/failed status and allow retry of failed recipients through the existing delivery path.

There is no automatic send in v1. Any later scheduled follow-up should still be prepared and approved by the host, and canceled if the event/gallery becomes unavailable.

### Ready-to-personalize message once both features are live

**Subject:** A few memories from {event name} — and a note for the artists

> Thanks for being part of {event name}. We’d love to keep a little of the evening together.
>
> **Share your photos:** Add a few pictures from the night here: {photo link}. Captions and tagging people are optional. We’ll make the images smaller for easy viewing on phones. Please share only photos you took or have permission to share. This event’s photo gallery is public.
>
> **Leave a note for an artist:** See the work we shared here: {showcase link}. Open a piece and choose “Leave a comment.” A detail you noticed, something that moved you, or a question for the artist would mean a lot.
>
> You’ll need to sign in to post. Even one photo or one kind sentence is welcome.
>
> Thank you,
>
> {host name}

Use short, stable links to the two sections; proposed query parameters/anchors must actually work before insertion. The subject is suggested copy, not a claim that the current composer supports custom email subjects. For a manual pilot, change “Leave a comment” to **“Cheer them on”** and replace the photo paragraph with the real available submission method. Do not advertise an upload button that has not shipped.

## 5. Data and implementation boundaries

Proposed additions, not final database/API names:

| Record | Main fields and indexes |
|---|---|
| Event recap settings | Enabled/open/closed timestamps, close deadline, public-photo consent version, limit overrides; stored on event or one event-keyed settings row. |
| `eventPhotos` | Event, uploader, display/thumbnail storage IDs and dimensions/bytes, optional caption/project link, moderation state, created/edited timestamps, upload intent ID. Index by event/state/time and uploader/event. |
| `eventPhotoTags` | Photo, tagged user, pending/accepted/declined state, created time. Unique photo/user; index by tagged user/state. |
| Event contribution grants | Event/user, granting host, grant/revoke timestamps for verified walk-ins/linked guests. Unique event/user. |
| `eventShowcaseItems` | Event, project, optional artifact preview, order, adding host, artist agreement record/time. Unique event/project for v1; one card per project. |
| `projectComments` | Project, author, text, optional source event, created/edited/deleted timestamps, moderation state. Index by project/state/time and author. |
| Reports | Extend the existing reporting/moderation model with explicit photo/comment targets; do not overload unrelated message/user report IDs. |
| Announcement metadata | Post-event kind, audience policy, stable send intent, exclusions and existing recipient/delivery records. Reuse existing tables where possible. |

Reuse `requireEventHost`/`hostOf`, `requireOwner`, `requireOwnProfileRow`, existing admin helpers, `projectVisibleTo`, `blockedUserIds`/`assertNotBlocked`, `storedOrExternalUrl`/`projectPhotoUrl`, `PersonAvatar`, `errorMessage`, `insertNotification`, and existing email helpers. Extract a shared rule before adding another copy. Every new public Convex entry point enforces caller and object access; operator jobs stay internal. Use readable `ConvexError({ code, reason })` errors. Treat body text as text, including in email templates.

Photo finalization must be idempotent for an upload intent and must verify both variants belong to that uploader and event. It must not accept an arbitrary person’s storage ID. Background cleanup handles partial uploads and event/account deletion. Event deletion removes its photos/tags/grants/showcase links and pending follow-up work; shared projects/comments survive. Review account-deletion handling for attributed content and storage. Do not log photo contents, captions, emails, or invite tokens into analytics.

Before implementation, run GitNexus impact on each changed symbol and report its blast radius, especially shared audience, media, and upload functions. Run `detect_changes` before commits. This document changes no code symbols and makes no claim of a completed implementation impact review.

## 6. DIY first-event checklist

1. Gather each artist’s name, preferred credit, canonical project link, and permission to feature it. Ask artists with missing work to add a completed project.
2. Put a short ordered **Art shown at this event** list in the event description using working links. This is possible today.
3. Open each project on a phone and confirm that a guest can reach it and that **Cheer them on** accepts a written note after sign-in. Confirm the production backend supports the path.
4. Until attendee uploads ship, use the existing host gallery for up to three representative photos. If collecting more manually, use an existing submission method you control, state its visibility, and provide the actual instructions. No external album or collection service is assumed by this spec.
5. Reconcile the host guest list against the current broadcast preview, especially ticket-only buyers and plus-ones. Resolve omissions before saying “all attendees.” Do not send duplicate catch-up messages to the entire list.
6. Adapt the message above to the features actually available. Test both destination links and the sign-in return on a phone.
7. Send the separate thank-you through **Guests → Message attendees** when ready; inspect failures. This spec preparation does not send it.
8. During the following week, answer artist questions and handle photo removal requests. Seed a few host photos and thoughtful notes so people are not arriving at an empty page.

## 7. Build sequence and acceptance

| Step | Deliverable | Rough engineering effort* |
|---|---|---|
| Manual pilot | Curated links, existing cheers, accurate attendee reconciliation and message copy | Half a day of organizer work; no estimate for creating missing artist pages. |
| 1 | Structured event-to-project showcase, artist consent, visibility-aware cards and return links | 1–2 engineering days |
| 2 | Attendee photo records, shared compression options, batch flow, guest eligibility, tags, reports and cleanup | 4–7 engineering days |
| 3 | Shared project comments with author controls, artist moderation and notifications | 2–4 engineering days |
| 4 | Complete post-event audience, deduplication, send preview, retry controls, integrated phone/accessibility testing | 2–3 engineering days |

*Planning judgment, not a quote: roughly 9–16 engineering days after product decisions, assuming the existing identity and delivery paths are usable. Protected private media, broad HEIC conversion, expanded recipient limits, and threaded comments are additional work. If the goal is a fast pilot, stop at curated links and cheers while building the gallery; do not require full comments first.*

Acceptance scenarios for the implemented version:

- An eligible attendee publishes ten mixed portrait/landscape images from a phone; all stored variants meet dimensions/byte caps, GPS metadata is absent, no originals are retained, and one failed image does not discard the rest.
- A direct API request cannot publish someone else’s file, oversize/unvalidated variants, or photos for a closed/private/canceled event. Retries do not duplicate photo rows; abandoned variants are cleaned up.
- An email-only registered guest verifies and links their account, returns to upload, and receives only the intended access. A typed email or forwarded follow-up does not grant write access. A walk-in can be granted event-specific access by a host.
- Public photo consent is explicit; private-event galleries are unavailable in this release. Removing a photo immediately removes its app display and tags, deletes variants, and states the known media-cache limit accurately.
- A tag stays nonpublic until accepted, can be declined/removed, and does not expose guest email or blocked profiles. Notifications do not multiply on retry.
- The same artwork can be featured at two events while sharing one original project/comment section. Removing one event link leaves the work and conversation intact. Hidden work and private events are not revealed through links/previews.
- A commenter can edit/delete; an artist can hide/report; a host cannot moderate unrelated project comments. All respect visibility/block rules. Blank/oversize text is rejected with a readable error.
- An audience fixture containing an RSVP, accepted application, ticket-only buyer, duplicate guest/account, canceled/refunded registration, explicit absent attendee, and uncontactable plus-one produces the expected unique recipients and preview counts. Preserve pre-event reminders when changing shared resolution.
- Sending/retrying the recap does not duplicate the announcement or completed recipient deliveries. No recap sends automatically; both links work on mobile after sign-in. Keyboard navigation, focus, upload status announcements, and image descriptions are usable.

For the eventual code change, run targeted handler/permission tests, the drift guard, application tests, typecheck/build, and a focused phone-browser E2E. Specifically verify production guest onboarding and deployed backend compatibility before outreach. This documentation-only task needs document/link/diff checks, not application test runs.

Measure eligible recipients, unique recap visitors, contributors, published photos, artists receiving at least one note, and upload failures/bytes. Count events without recording people’s message/photo contents. Establish a baseline from the first event before setting success targets.

## Proposed defaults to review

Proceeding choices for a future build: public-event photo galleries only; signed-in contributors from the merged roster plus host grants; 30-day contributions; 1,600 px/500 KB display copies; opt-in people tags; one showcase card and comment conversation per project; manual next-day follow-up. Confirm these when approving implementation. This spec does not approve feature development, private media infrastructure, deployment, or attendee outreach.
