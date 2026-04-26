# Member Paywall and Live Media Integration

## Product Context

TheCrossBoard, also referred to as The Cross Board, is currently positioned at [thecrossboard.org](https://www.thecrossboard.org) as a community for Kingdom-minded employers, sponsors, and creatives. The homepage promise is: find work, show your craft, collaborate. The product already includes jobs, portfolios/work posts, events, direct messaging, invitations, search, notifications, blocking/reporting, and organization-facing hiring/patronage positioning.

This spec is therefore not about building a community platform from zero. The missing business capability is paid access:

- Member paywall for individual creative memberships, sponsored memberships, and organization benefits.
- Video/media paywall for private replays, paid live sessions, closed conversations, workshops, and archives.
- Live event workflows for public reach, member participation, and paid insider access.
- A practical decision on whether "calls" means interactive video rooms, webinar-style broadcasts, audio rooms, or scheduled private conversations.

## Executive Summary

Tentative recommendation: use YouTube deliberately, but do not make YouTube the product.

TheCrossBoard should publish enough public video on YouTube to grow the channel, build search surface, and send qualified people back to [thecrossboard.org](https://www.thecrossboard.org). Public interviews, clips, trailers, artist features, event highlights, and selected full public sessions belong there. Paid/private sessions, member replays, critique rooms, and closed creative conversations should be gated on TheCrossBoard.

For live events, the practical path is:

1. Keep the core marketplace/community custom: profiles, portfolios, jobs, organization tiers, messaging, member graph, recommendations, and [paywall entitlements](entitlements-paywall-foundation.md).
2. Use Zoom links as the fastest near-term hosted option for small live member events where operational simplicity matters more than native UX.
3. Use Cloudflare Stream for paywalled watch-only broadcasts and replays because it fits TheCrossBoard's Cloudflare stack, supports signed playback, and avoids WebRTC complexity for passive viewers.
4. Use LiveKit when the event requires native interactive video: panelists, stages, critique sessions, office hours, screen share, host controls, and eventual streaming out to YouTube or HLS.
5. Treat YouTube as the public distribution layer. It is fine, and likely strategically correct, for only public material to live on YouTube. Not every paid or member-only session needs to be on YouTube.

Opinionated first build:

- Build [membership entitlements](entitlements-paywall-foundation.md) and event media records first.
- Add public YouTube event embeds using existing YouTube parsing patterns.
- Add gated Cloudflare Stream replay/live playback for paid members.
- Use Zoom manually for early closed sessions while validating formats.
- Build LiveKit only after there is repeated demand for native interactive sessions inside TheCrossBoard.

The main risk is overbuilding live rooms before proving paid programming demand. The main opportunity is that TheCrossBoard's custom advantage is not video itself; it is connecting video/events to profiles, portfolios, jobs, organizations, sponsored memberships, and direct hiring outcomes.

## Business Outcome

The goal is to convert existing product surface area into a sustainable membership and programming model.

- Free creatives keep the supply side strong by creating profiles, portfolios, job interest, and community activity.
- Organizations pay because they can see creative work, message talent, post jobs, and sponsor memberships as patrons of the arts.
- Public video attracts new visitors from YouTube, Instagram, Substack, search, and partner sharing.
- Member-gated and paid media create a reason to join, return, and stay.
- Live programming strengthens relationships in the community instead of becoming isolated content on another platform.

## What Was Scanned

This document was updated after scanning the local homepage and organizations page:

- [Homepage route](../../app/app/routes/home.tsx): "TheCrossBoard - Jobs, Portfolios & Collabs for Creatives", "Bringing Kingdom-minded employers, sponsors, and creatives together to exercise our gifts", "Jobs. Portfolios. Collabs. Events. All in one place", invite-only beta, portfolios, jobs, collaborations, events, and organization CTA.
- [Organizations route](../../app/app/routes/organizations.tsx): "Hire Kingdom Creatives", values-aligned talent, see portfolios before reaching out, direct connection, free volunteer postings, organization tiers, patronage/sponsored memberships, and paid organization partnership positioning.
- Existing app functionality: portfolio artifacts support video/audio/link/image/text, YouTube/Vimeo embed URL parsing exists for profile/settings/work surfaces, events exist, jobs exist, direct messaging exists, and `profiles.plan` already hints at free vs paid.

## JTBD

### Creative Member

When I want my work to lead to opportunity, I want my profile, work, events, conversations, and jobs in one trusted place, so that people can evaluate my craft and reach out with real opportunities.

### Organization

When I need values-aligned creative talent, I want to see portfolios and start direct conversations, so that I can hire with more confidence than a resume-only job board.

### Patron/Sponsor

When I fund creative memberships or partner with the platform, I want clear visibility, impact, and access to emerging talent, so that sponsorship feels like real patronage rather than a generic donation.

### Event Attendee

When I discover an interview, discussion, music event, or workshop, I want to understand what is public, what requires membership, and what requires payment, so that I know whether to watch, join, or upgrade.

## Recommended Access Model

| Layer | Audience | Product Job | Example Access |
| --- | --- | --- | --- |
| Public | Anyone | Discovery and trust | Homepage, public profiles/work, public jobs, public event pages, selected YouTube embeds |
| Free Creative | Logged-in creatives | Supply, participation, and network density | Profile, portfolio, job interest, messaging, RSVPs, member-visible events |
| Paid Creative | Paying or sponsored creatives | Retention and deeper access | Paid replays, closed sessions, workshops, critique rooms, permanent/expanded profile benefits |
| Organization Partner | Paying organizations | Hiring and patronage | Org profile, job volume, direct messaging, sponsored memberships, talent matching |
| Admin/Host | Operators and event producers | Programming and monetization | Event setup, gated media, live room controls, replay publishing, entitlement overrides |

## Current Capability Versus Gap

| Area | Current State | Gap |
| --- | --- | --- |
| Profiles/portfolios | Built; artifacts support image, text, video, audio, links; YouTube/Vimeo embed parsing exists | Paid profile/member benefits and gated media permissions |
| Jobs | Built; jobs and job interest workflows exist | Organization entitlement limits, paid posting limits, sponsored access |
| Events | Built as community events | Event access levels, livestream/replay fields, check-in/attendance, paid event logic |
| Messaging | Built | Paid or org-only messaging policies if desired |
| YouTube embed | Built for portfolio/profile/work surfaces | Event-specific livestream/replay workflow, admin UX, canonical event archive |
| Membership/paywall | Partial hint via `profiles.plan` | Billing, entitlements, plan state, server-side media gating |
| Live interaction/calls | Not built | Decide format: broadcast, webinar, interactive room, audio room, or office-hours scheduling |

## Tentative Roadmap

| Step | Scope | Business Value | Estimate |
| --- | --- | --- | --- |
| 1 | Entitlement helper, membership records, locked event/media states | Enables member paywall and paid media | 2-4 days without billing; 1-2 weeks with Stripe/webhooks |
| 2 | Event media records and public YouTube embeds | Converts public media into TheCrossBoard traffic | 1-2 days |
| 3 | Gated Zoom link support for early paid sessions | Starts selling/validating live programming immediately | 1-3 days after entitlements |
| 4 | Cloudflare Stream VOD/live signed playback | Adds real video paywall for replays and broadcasts | 1-2 weeks after entitlements |
| 5 | LiveKit interactive rooms for repeated high-value formats | Native stage/panelist/member interaction | 2-3 weeks prototype; 4-8 weeks production webinar |
| 6 | Hybrid LiveKit-to-YouTube/Cloudflare broadcast | Scales public/private live events while keeping native host room | 2-4 weeks after LiveKit baseline |

## What "Calls" Usually Means

Community platforms use "calls" to mean scheduled live rooms where people can join with audio/video. Depending on the platform, that may be closer to Zoom, a webinar, a livestream, or an audio room.

For TheCrossBoard, "calls" should be split into clearer product formats:

| Format | Audience Experience | Best Use | Pros | Cons |
| --- | --- | --- | --- | --- |
| Broadcast livestream | One or a few hosts stream to many viewers with chat/discussion elsewhere | Public interviews, performances, announcements | Scales well, simple mental model, easy to record | Low audience participation |
| Webinar | Hosts/panelists on video; audience watches, asks questions, may be promoted | Interviews, panels, workshops | Good balance of control and interaction | Needs roles, moderation, Q&A |
| Interactive room | Many members can join audio/video | Closed conversations, critique sessions, office hours | Highest intimacy and member value | Harder moderation, expensive at scale, needs WebRTC |
| Audio room | Live voice conversation, optional stage/audience roles | Discussions, prayer/conversation, casual salons | Lower production friction than video | Less visual/media value; still needs realtime infra |
| Scheduled private conversation | One-to-one or small-group booking with messaging/reminders | Mentorship, hiring chats, intro sessions | Easier MVP if messaging exists | Less event-like; may need calendar integration |

Recommended language: use "live sessions" publicly, and model the backend as event media plus optional interactive rooms. Avoid promising "calls" until the exact format is selected.

## Zoom As A Practical Near-Term Option

Yes, it is normal for communities to use Zoom links inside a community platform. Many communities treat their platform as the calendar, access-control, discussion, and replay archive layer, while Zoom handles the live meeting itself. Skool communities using Zoom or Zoom-style events are not surprising; hosted community platforms often support native calls, external links, or integrations because Zoom is familiar and reliable.

For TheCrossBoard, Zoom is useful as a bridge:

Pros:

- Fastest way to run interactive video sessions without building room UI.
- Familiar to members, guests, interviewees, and organizations.
- Good for early paid workshops, office hours, critique sessions, interviews, and invite-only conversations.
- Handles device permissions, waiting rooms, host controls, recording, breakout rooms, and screen sharing.
- Lets the team learn which event formats people will pay for before investing in LiveKit.

Cons:

- The live experience happens outside TheCrossBoard, so the product loses some brand, analytics, and community continuity.
- Zoom links can be forwarded unless paired with registration, waiting rooms, or per-user links.
- Recordings still need a gated replay workflow if they become paid content.
- Chat, Q&A, attendance, and engagement data may live outside the app unless imported.
- It does not strengthen TheCrossBoard's native network graph unless attendance and follow-up actions are pulled back into profiles, jobs, messages, and event pages.

Recommended Zoom use:

- Use Zoom for the first wave of small paid or member-only live sessions.
- Keep the event page, RSVP, entitlement, reminder, and replay archive on TheCrossBoard.
- Store external meeting metadata on `eventMedia` or `eventLiveSessions`.
- After the session, upload or import the recording into Cloudflare Stream for gated replay.
- Move to LiveKit only when native interaction becomes a recurring, strategically important part of the product.

Business estimate:

- Basic external Zoom link gated by member entitlement: 1-3 engineering days after entitlement helpers exist.
- Better Zoom workflow with unique registration links, attendance import, and replay processing: 1-3 weeks depending on API depth.

## YouTube Channel Strategy

Would keeping paid/private sessions off YouTube hurt YouTube channel positioning? It should not be a problem if TheCrossBoard consistently publishes a strong public lane.

YouTube's own visibility model supports this distinction: public videos can appear in search, recommendations, the channel page, and subscriber feeds. Unlisted videos can be shared by link but generally do not appear in search, recommendations, the Videos tab, or subscriber feeds unless added to a public playlist. That means unlisted paid sessions are not a channel-growth strategy anyway.

Recommended YouTube programming mix:

- Public full episodes when the goal is reach.
- Short clips from paid/member sessions when the clip is approved for public marketing.
- Trailers and highlight reels for paid events.
- Guest/artist profile videos that link to TheCrossBoard profiles and event pages.
- Public livestreams for launches, showcases, broad interviews, and community-facing events.

Do not put on YouTube:

- Paid replays where the business value is access control.
- Closed critique sessions with member work shown on screen.
- Private conversations where trust depends on limited attendance.
- Anything with member privacy, unreleased work, or sensitive hiring/community discussion.

Recommended rule:

- YouTube gets the public artifact.
- TheCrossBoard gets the canonical event page, member access, replay archive, discussion, profiles, work links, jobs, and conversion path.
- For paid sessions, publish clips or summaries on YouTube rather than the full protected session.

This preserves channel growth while protecting the reason to become a member.

## Where Custom Is Advantageous

TheCrossBoard should build custom where the product advantage comes from the creative network, not generic community software.

Custom is strategically valuable for:

- Profiles: the core trust object for creatives, organizations, sponsors, and event guests.
- Portfolios/work cards: the proof layer that makes hiring and collaboration better than generic communities.
- Jobs and job interest: TheCrossBoard can tie opportunities directly to profiles, work samples, and values-aligned organizations.
- Organization tiers and patronage: sponsor memberships, job volume, direct messaging, featured org profiles, and ecosystem impact are specific to this business model.
- Entitlements: individual memberships, sponsored memberships, organization access, event tickets, comped access, and admin overrides should share one rules layer.
- Event archives: every event can become a durable node connected to speakers, artists, work, jobs, organizations, and follow-up conversations.
- Discovery/search: semantic matching across profiles, works, jobs, events, and organizations is hard to replicate inside Skool/Zoom/YouTube.

Use vendors for commodities:

- Zoom for early interactive meetings.
- YouTube for public distribution and channel discovery.
- Cloudflare Stream for paywalled HLS/VOD.
- LiveKit for native WebRTC when interaction becomes part of the core product.
- Stripe or the existing billing provider for payments, invoices, portals, and subscription state.

The implementation principle: own the graph and the paywall; rent the media transport until the user experience demands native control.

## Recommended Implementation Path

Use [Entitlements and Paywall Foundation](entitlements-paywall-foundation.md) as the implementation source of truth for plan tables, capability checks, organization subscriptions, sponsored seats, and admin overrides.

### Phase 1: Entitlements And Event Media

Build the paywall foundation first. This unlocks video paywalls, member-only events, sponsored memberships, and organization benefits.

Core entities:

```typescript
memberships: {
  userId: Id<"users">,
  status: "active" | "trialing" | "past_due" | "canceled" | "comped",
  plan: "free" | "paid_creative" | "sponsored_creative" | "org_partner" | "org_patron" | "founding_partner",
  source: "stripe" | "sponsored" | "admin" | "legacy",
  organizationId?: Id<"organizations">,
  sponsorId?: Id<"users">,
  currentPeriodEnd?: number,
  createdAt: number,
  updatedAt: number,
}

eventMedia: {
  eventId: Id<"events">,
  accessLevel: "public" | "member" | "paid" | "org_partner" | "admin",
  mediaKind: "youtube_video" | "youtube_live" | "cloudflare_stream_live" | "cloudflare_stream_vod" | "livekit_room" | "external_url",
  providerId?: string,
  embedUrl?: string,
  playbackUrl?: string,
  thumbnailUrl?: string,
  startsAt?: number,
  replayAvailableAt?: number,
  isReplay: boolean,
  createdAt: number,
}
```

Server rules:

- Anonymous users can fetch public event metadata and public media.
- Logged-in users can fetch member media.
- Paid/sponsored users can fetch paid media.
- Organization partner access should be separate from creative member access because org value is hiring/patronage, not necessarily insider creative programming.
- Media playback tokens should be generated server-side only after entitlement checks.

Business estimate:

- 2-4 engineering days for membership schema, entitlement helper, and basic locked state if billing status is manually/admin assigned.
- 1-2 weeks if Stripe checkout, webhooks, customer portal, sponsored memberships, and organization-tier limits are included.

### Phase 2: YouTube For Public Discovery

YouTube should stay in the acquisition role:

- Public interviews, clips, trailers, and selected replays live on YouTube.
- YouTube descriptions link back to canonical TheCrossBoard event/archive pages.
- Event pages embed public YouTube videos when public discovery is the goal.
- YouTube comments can stay enabled for discovery, but the primary community discussion should be linked back to TheCrossBoard.

Technical note:

- Existing YouTube URL parsing already handles `watch`, `youtu.be`, `embed`, `shorts`, and `/live/` URL shapes in profile/settings contexts.
- The event implementation should reuse that parsing logic instead of creating a separate ad hoc parser.

Business estimate:

- 1-2 engineering days to add event media fields, admin paste-URL flow, event embed rendering, and locked state placeholders if the existing event UI is straightforward.
- Additional 1-2 days for attribution fields and analytics events.

### Phase 3: Cloudflare Stream For Paywalled Broadcast And Replay

Cloudflare Stream is the strongest practical fit for paid video playback and replay because the app already runs on Cloudflare-oriented infrastructure and Stream supports live/on-demand video, HLS/DASH playback, automatic encoding, analytics, and signed URLs.

Use Cloudflare Stream when:

- The audience watches, but does not need to appear on camera.
- The value is a paid livestream, replay, workshop archive, or music/interview broadcast.
- You need real paywall protection stronger than unlisted YouTube.
- You want low operational complexity.

Pros:

- Built for live and VOD delivery without running media servers.
- Signed URLs support authenticated/paid viewing.
- HLS/DASH playback works across devices.
- Live recordings can become replays.
- Pricing is simple: storage minutes plus delivered minutes; Cloudflare currently lists $5 per 1,000 minutes stored and $1 per 1,000 minutes delivered, with encoding and bandwidth included in the delivered-minute model.

Cons:

- Not an interactive video room. Viewers cannot join as participants.
- Live ingest still requires a production tool or broadcaster, such as OBS, Restream, or a custom ingest flow.
- Chat/Q&A/discussion must be built separately or attached through existing event discussion/messaging patterns.

Technical route:

1. Admin creates event media with `mediaKind: "cloudflare_stream_live"`.
2. Server creates or stores a Cloudflare Stream live input.
3. Host streams RTMP/SRT from OBS or production software into Cloudflare.
4. Event page requests a signed playback token after entitlement check.
5. Viewer watches via Cloudflare Stream player or HLS URL.
6. Recording is attached back to the event as `cloudflare_stream_vod`.

Business estimate:

- MVP paywalled broadcast/replay: 1-2 weeks after entitlement foundation.
- Production-quality event ops tooling: 2-4 additional weeks for admin controls, replay states, thumbnails, captions/transcripts, analytics, and support workflows.

### Phase 4: LiveKit For Interactive Sessions

LiveKit is the best fit if TheCrossBoard wants members to join live rooms with audio/video, not just watch. It provides WebRTC rooms, participant roles, server-issued access tokens, recording/egress, and livestream/recording output paths. LiveKit Egress can record rooms to MP4/HLS and stream to YouTube Live, Twitch, Facebook, or RTMP endpoints.

Use LiveKit when:

- Participants need to speak, appear on camera, screenshare, or be promoted to the stage.
- The event is a paid closed conversation, office hours, critique room, or panel with audience participation.
- You need role-based room access: host, panelist, attendee, moderator.

Pros:

- Real interactive audio/video with lower latency than HLS.
- Strong fit for paid salons, critique sessions, and interactive conversations.
- Server-generated room tokens map cleanly to TheCrossBoard entitlements.
- Egress can record and output HLS/MP4 or restream to YouTube/RTMP.

Cons:

- More complex than Cloudflare Stream.
- Costs scale with participant minutes, bandwidth, and egress/transcoding.
- Requires room UI, device permissions, moderation controls, host controls, reconnect handling, and support expectations.
- Large public broadcasts should not put every viewer in WebRTC; use HLS/broadcast for viewers and WebRTC only for hosts/panelists.

Technical route:

1. Add `liveRooms` connected to events.
2. Server creates LiveKit room and issues short-lived tokens after entitlement checks.
3. Roles:
   - host: publish audio/video/screen, mute/remove others, start/stop egress.
   - panelist: publish audio/video/screen.
   - attendee: join muted or view-only depending on event format.
   - moderator: manage chat/Q&A/participants.
4. Use LiveKit React components or SDK for the room UI.
5. Use Egress to record room composite to storage and optionally send RTMP to YouTube or Cloudflare/Mux.
6. Attach replay back to event media.

Business estimate:

- Prototype closed room for 2-20 participants: 2-3 weeks.
- Moderated webinar with host/panelist/attendee roles, recording, replay, and admin controls: 4-8 weeks.
- Production-grade event platform with robust backstage, Q&A, captions, analytics, and support tooling: 8-12+ weeks.

## Practical Architecture Recommendation

Use both Cloudflare Stream and LiveKit, but for different jobs:

| Need | Recommended Tech | Why |
| --- | --- | --- |
| Public YouTube discovery | YouTube embed | Already useful for reach and search |
| Paid livestream where audience watches | Cloudflare Stream Live | Simpler, scalable, paywall-friendly |
| Paid replay/archive | Cloudflare Stream VOD with signed URLs | Stronger gating than unlisted YouTube |
| Closed interactive conversation | LiveKit | WebRTC participation and room roles |
| Public broadcast from interactive room | LiveKit Egress to YouTube and/or Cloudflare | Hosts interact in LiveKit; audience watches scalable stream |
| Audio-only salon | LiveKit audio room | Same entitlement/token model; lower production friction |

Default recommendation:

1. Build member/paid entitlement checks first.
2. Add event media records and public YouTube embeds.
3. Add Cloudflare Stream signed playback for paid replays and non-interactive paid broadcasts.
4. Add LiveKit only for interactive sessions where members need to participate live.

This keeps the near-term implementation tied to business value: paid media access and membership conversion before a full event-room product.

## Cost Model Examples

These are planning estimates, not vendor quotes.

### Cloudflare Stream Example

Scenario: 90-minute paid replay, 500 paid viewers, average watch time 60 minutes.

- Storage: 90 stored minutes, rounded into purchased storage blocks.
- Delivery: 500 viewers x 60 minutes = 30,000 delivered minutes.
- At Cloudflare's currently listed $1 per 1,000 delivered minutes, playback delivery would be about $30, plus storage allocation.

Business implication:

- Cloudflare Stream economics are friendly for paid replays and broadcasts. The bigger work is entitlement, event ops, content production, and conversion, not raw delivery cost.

### LiveKit Interactive Example

Scenario: 60-minute closed critique session, 12 participants on audio/video, recorded.

- Connection minutes: 12 x 60 = 720 participant minutes.
- Bandwidth depends on video quality, number of published tracks, and subscriptions.
- Recording/egress adds transcoding/egress usage.

Business implication:

- LiveKit is appropriate for high-value interactive events with limited seats. It should be priced like access, not like commodity content.

### Hybrid Event Example

Scenario: 4 speakers in LiveKit, 1 moderator, 1,000 public viewers.

- Put 5 active participants in LiveKit.
- Egress the program feed to YouTube and/or Cloudflare Stream.
- Public viewers watch YouTube/Cloudflare HLS, not WebRTC.

Business implication:

- This avoids paying WebRTC costs for passive viewers while still giving hosts a flexible interactive production environment.

## Paywall UX

Locked states should not feel punitive. They should make the value clear:

- Public preview: title, guest/speaker/artist, date, short description, clip/trailer if available.
- Clear badge: Public, Members, Paid Members, Organization Partner, Sponsored.
- Primary CTA: join, upgrade, RSVP, or register interest.
- For sponsored members: explain who sponsored access when appropriate.
- For organizations: connect paid tiers to hiring, direct messaging, job volume, and sponsored memberships rather than only content.

## Open Product Decisions

- Is individual paid membership annual, monthly, or both?
- Are paid events included in membership, sold as one-off tickets, or both?
- Do organization tiers grant content access, or only hiring/patronage benefits?
- Are sponsored creative memberships full paid memberships or limited access grants?
- Should public YouTube streams be live, or should YouTube receive edited clips after TheCrossBoard-hosted events?
- Do we want event chat/discussion inside TheCrossBoard, or do we rely on YouTube/Substack comments for public events?
- Which first paid format is most likely to sell: replay archive, live workshop, closed interview, critique room, or office hours?

## Sources Checked

- [Cloudflare Stream overview](https://developers.cloudflare.com/stream/)
- [Cloudflare Stream live video](https://developers.cloudflare.com/stream/stream-live/)
- [Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/)
- [Cloudflare Stream signed URLs](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/)
- [LiveKit Egress overview](https://docs.livekit.io/home/egress/overview)
- [LiveKit Egress output types](https://docs.livekit.io/home/egress/outputs)
- [LiveKit Egress examples](https://docs.livekit.io/home/egress/examples)
- [LiveKit Cloud billing](https://docs.livekit.io/home/cloud/billing)
- [YouTube embedded players and parameters](https://developers.google.com/youtube/player_parameters)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube Help: embed videos and playlists](https://support.google.com/youtube/answer/171780)
- [YouTube Help: create a live stream with an encoder](https://support.google.com/youtube/answer/2907883)
- [YouTube Help: video privacy settings](https://support.google.com/youtube/answer/157177)
