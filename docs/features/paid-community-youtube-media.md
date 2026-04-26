# Paid Community and YouTube Media Integration

## Business Outcome

This feature should create a growth loop where public programming attracts new people and insider programming converts the most engaged people into paying members.

The desired outcomes are:

- Grow qualified awareness through public video, search, and shareable event pages.
- Convert visitors into free accounts through profile, job, and event participation.
- Convert free members into paid insiders through access to scarce live experiences, closed conversations, replays, and deeper community rooms.
- Keep thegrassboard as the relationship and opportunity hub while using YouTube, Substack, and Instagram as distribution surfaces.
- Avoid operating too many content homes before the audience and membership model are proven.

## JTBD

### Creative Member

When I want to be seen, hired, and connected with other serious creatives, I want one place where my profile, work, events, and opportunities reinforce each other, so that visibility turns into relationships and paid work.

### Event Attendee

When I discover an interview, performance, or discussion, I want to quickly understand who it is for, what I can access for free, and what I get by joining or paying, so that I can participate without platform confusion.

### Insider Member

When I pay for access, I want meaningful proximity to people, conversations, replays, and private rooms, so that the membership feels like access to a living creative circle rather than another content subscription.

### Community Operator

When we publish media, I want one workflow that supports public reach and private monetization, so that every event can become audience growth, community engagement, and reusable content.

## Recommended Product Shape

Use a three-layer access model:

| Layer | Audience | Purpose | Example Access |
| --- | --- | --- | --- |
| Public | Anyone | Discovery and trust | Public event pages, selected YouTube embeds, public work, public profiles |
| Free Member | Logged-in members | Community participation | RSVP, comments/discussions, member-only events, job interest, profile creation |
| Paid Insider | Paying members | Monetization and deeper belonging | Closed sessions, private livestreams, replays, workshops, critique rooms, insider discussions |

This keeps the public surface valuable enough to grow, the free account valuable enough to join, and the paid tier valuable enough to retain.

## MVP User Journey

1. A public video clip, YouTube premiere, Instagram post, Substack post, or shared event URL brings someone to an event page.
2. The event page shows the title, guests, topic, date/time, access level, and a clear call to join or RSVP.
3. If the event is public, the page embeds a YouTube video or livestream and prompts visitors to create a free account for discussion, reminders, or related opportunities.
4. If the event is insider-only, the page shows a preview, speaker information, and a membership call to action. The stream or replay is only visible after entitlement checks.
5. After the event, the page becomes an archive with replay, transcript/notes, related profiles, related work, and follow-up discussion.

## YouTube Strategy

YouTube should be used for reach, search, recommendations, clips, public premieres, and social proof. It should not be the only source of member value.

Best uses:

- Public interviews, clips, trailers, music sessions, and excerpts.
- Search-optimized titles and descriptions that point back to thegrassboard event pages.
- Playlists by series, discipline, guest, or event type.
- Embedded public videos on event pages.
- Public livestreams when the goal is audience growth.

Risky uses:

- Treating unlisted YouTube links as secure paid access. Unlisted links can be shared.
- Hosting all insider value on YouTube, which trains users to stay on YouTube instead of joining the community.
- Fragmenting comments between YouTube, Substack, Instagram, and thegrassboard without a clear source of truth.

Recommended rule:

- Public content can live on YouTube and embed on thegrassboard.
- Paid insider content should be gated by thegrassboard entitlements. If YouTube is used for delivery, assume it is convenience gating, not strong DRM.
- The public YouTube description should always link to the canonical event/archive page on thegrassboard.

## Technical Integration

### Event Media Model

Add media fields to events or create a related `eventMedia` entity:

```typescript
{
  eventId: Id<"events">,
  accessLevel: "public" | "member" | "insider",
  mediaType: "youtube_video" | "youtube_live" | "youtube_playlist" | "external_embed" | "native_upload",
  provider: "youtube" | "vimeo" | "mux" | "substack" | "other",
  providerId?: string,
  embedUrl?: string,
  canonicalUrl?: string,
  thumbnailUrl?: string,
  startsAt?: number,
  endsAt?: number,
  replayAvailableAt?: number,
  title?: string,
  description?: string,
}
```

### Rendering Rules

- Public event pages can show public YouTube embeds to anyone.
- Member-only media requires a logged-in user.
- Insider media requires an active paid membership entitlement.
- Locked states should show a preview image, short event description, and the upgrade/join action.
- Replays should be attached to the original event page instead of becoming disconnected posts.

### YouTube Embed Options

YouTube supports iframe embeds and the IFrame Player API for richer control. The simple embed path is enough for MVP:

```html
<iframe
  src="https://www.youtube.com/embed/VIDEO_ID"
  title="Event video"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen
></iframe>
```

Use the IFrame Player API when the product needs playback events, custom controls, or analytics hooks. Google documents a minimum embedded player viewport of 200px by 200px and recommends including an `origin` parameter when using JavaScript API control.

### Access Control

Recommended entitlement checks:

- `anonymous`: can view public metadata and public media.
- `member`: can view public and member media.
- `insider`: can view public, member, and insider media.
- `admin`: can create, preview, and manage all media.

Do not rely on hidden frontend routes for access control. Media visibility should be enforced server-side when returning event media records.

### Streaming Options

| Option | Pros | Cons | Best Use |
| --- | --- | --- | --- |
| YouTube public livestream | Strong discovery, familiar UX, easy embeds, low direct cost | Limited gating, sends attention back to YouTube, comments can fragment | Public interviews, launches, music sessions, trailers |
| YouTube unlisted livestream | Easy to embed and share with members | Link can leak; not a true paywall | Low-risk member sessions where leakage is acceptable |
| YouTube members-only | Native YouTube monetization and gating | Moves membership relationship to YouTube | Not recommended as primary model |
| Substack live video | Already part of current content footprint; can notify subscribers and gate by subscriber type | Another community destination; less tied to profiles/jobs | Audience testing and newsletter-led live sessions |
| Skool native calls | Built-in events, calls, tiers, payments, and community | Community lives on Skool, not thegrassboard; less marketplace/profile control | Fast validation of insider community before building |
| Circle or Mighty Networks | Mature paid community, events, live streams, mobile apps | Separate platform, monthly cost, integration tradeoffs | Validation or hosted community if custom build is delayed |
| Mux/Vimeo/custom | Stronger control, cleaner gating, branded UX | More implementation and operating cost | Long-term insider archive and premium VOD |

## Platform Comparison

### Build thegrassboard Natively

Pros:

- Own the profiles, work graph, jobs, events, and membership relationship.
- Can connect media directly to creative profiles and hiring outcomes.
- Strongest long-term differentiation versus generic communities.
- Can design the public-to-free-to-paid journey around the actual marketplace.

Cons:

- Requires product, billing, access control, moderation, and event operations work.
- Slower to validate paid programming than a hosted community tool.
- Requires clearer content operations and admin workflows.

Best when:

- The goal is a durable creative network, not just a paid content group.

### Skool

Skool offers community, classroom/content, calendar/events, native calls, payments, freemium, tiers, and event permissions. Its help docs currently describe free groups, subscriptions, freemium plans, tiered pricing, and one-time payments; event access can be restricted by member level, tier, or course access. Skool also supports native video uploads plus YouTube, Vimeo, Loom, and Wistia embeds.

Pros:

- Fastest way to test paid insider programming.
- Built-in payments, tiers, event permissions, calls, video, and member engagement loops.
- Low implementation burden.

Cons:

- The community, member graph, payments, and engagement live primarily inside Skool.
- Weaker fit for creative portfolios, jobs, marketplace matching, and public SEO pages.
- Less control over brand, data model, and custom user journey.

Best when:

- The team wants to validate paid insider programming before building it into thegrassboard.

### Circle

Circle offers discussions, courses, events, live streams, paid memberships, member directory, profiles, custom domain, analytics, and APIs on higher plans. Pricing currently starts around $89/month for Professional and $199/month for Business, with live stream limits and transaction fees by plan.

Pros:

- Mature community and paid membership stack.
- Better customization/API posture than simpler community tools.
- Useful for courses, events, and private spaces.

Cons:

- Still a separate community destination.
- Less purpose-built for creative work portfolios and jobs.
- Live streaming limits may matter as programming scales.

Best when:

- The team wants hosted community infrastructure with more business/customization controls than Skool.

### Mighty Networks

Mighty Networks offers community, courses, events, paid memberships, branded apps on higher plans, livestreaming, member discovery, and automations. Current plans list Launch, Scale, Growth, and Mighty Pro tiers, with streaming hours, viewer caps, storage, and transaction fees varying by plan.

Pros:

- Strong paid community and mobile app experience.
- Good fit for membership programs, cohorts, events, and courses.
- More robust community business tooling than a basic forum.

Cons:

- Higher cost as needs grow.
- Separate destination from thegrassboard marketplace.
- Native app value is useful but may not solve portfolio/jobs differentiation.

Best when:

- The membership/community program is the primary product and a branded mobile experience matters.

### Substack

Substack is already part of the current content footprint. It now supports video posts and live video, including access choices for everyone, subscribers, or paid subscribers.

Pros:

- Existing audience and publishing workflow.
- Strong email notifications and paid subscriber model.
- Useful for essays, announcements, interviews, and live tests.

Cons:

- Subscription relationship and discussion are anchored outside thegrassboard.
- Weak fit for creative profiles, jobs, work discovery, and marketplace behavior.
- Adds another place where community conversation can fragment.

Best when:

- Testing demand through the existing audience before moving the highest-value experiences into thegrassboard.

## Recommendation

Do not replace thegrassboard with Skool, Circle, Mighty, or Substack. Use them only as validation or distribution tools.

Recommended path:

1. Build public event/archive pages in thegrassboard with YouTube embeds.
2. Add simple access levels to events: public, member, insider.
3. Use Stripe or the existing billing direction for insider entitlement checks when ready.
4. Keep using YouTube for public discovery and clips.
5. Use Substack for announcements and audience testing while linking back to canonical event pages.
6. Consider Skool only as a temporary pilot for paid insider programming if custom membership work would delay learning by more than a few weeks.

## MVP Scope

### Phase 1: Public Media Pages

- Event detail pages support public YouTube embeds.
- Event pages include speaker/artist profiles, description, date/time, and related links.
- YouTube descriptions link back to event pages.
- Admin can paste a YouTube URL or video ID.

### Phase 2: Membership Gate

- Add `accessLevel` to events and event media.
- Add locked state UI for member and insider content.
- Add entitlement checks before returning gated media.
- Add RSVP/reminder capture for free members.

### Phase 3: Insider Programming

- Add paid membership state.
- Add insider-only livestream or replay media.
- Add insider event discussions.
- Add replay archive and post-event notes.

### Phase 4: Media Growth Loop

- Add clips and related content modules.
- Track source attribution from YouTube, Substack, Instagram, and direct links.
- Add conversion reporting by content source: visitor to signup, signup to RSVP, RSVP to paid insider.

## Key Product Decisions

- Are insider sessions paid by recurring membership, one-time event ticket, or both?
- Should free members be able to attend live public sessions but only insiders get replays?
- Should YouTube comments be enabled, or should discussion be directed back to thegrassboard?
- Should paid media use YouTube unlisted at first, or should premium replays use a more controllable provider?
- Is Skool a pilot platform, a competitor, or a non-goal?

## Success Metrics

| Metric | Why It Matters |
| --- | --- |
| YouTube viewer to event-page click-through | Validates YouTube as acquisition channel |
| Event-page visitor to free signup | Validates public page conversion |
| Free signup to RSVP | Validates programming demand |
| RSVP to attendance | Validates event value and reminders |
| Free member to paid insider | Validates monetization |
| Paid insider retention | Validates recurring membership |
| Replay views per event | Validates archive value |
| Profile/job actions after event | Validates that programming strengthens the creative network |

## Risks

- Content fragmentation across YouTube, Substack, Instagram, and thegrassboard.
- Paid value feels like content access instead of meaningful community access.
- YouTube drives awareness but keeps attention away from thegrassboard.
- Unlisted YouTube links leak and weaken perceived exclusivity.
- Hosted community tools validate engagement but trap the highest-value relationships off-platform.

## Sources Checked

- [YouTube embedded players and parameters](https://developers.google.com/youtube/player_parameters)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube Help: embed videos and playlists](https://support.google.com/youtube/answer/171780)
- [YouTube Help: create a live stream with an encoder](https://support.google.com/youtube/answer/2907883)
- [Skool Help: pricing setup](https://help.skool.com/article/215-how-to-setup-pricing-for-the-group)
- [Skool Help: payments FAQ](https://help.skool.com/article/86-subscriptions-faq)
- [Skool Help: event/call permissions](https://help.skool.com/article/149-how-to-set-permissions-for-an-event)
- [Skool Help: go live on Skool](https://help.skool.com/article/210-how-to-go-live-on-skool)
- [Skool Help: add videos](https://help.skool.com/article/58-video-link-tips)
- [Circle pricing](https://circle.so/pricing)
- [Mighty Networks pricing](https://www.mightynetworks.com/pricing)
- [Substack Help: live video](https://support.substack.com/hc/en-us/articles/30316077882516-Getting-started-with-Live-Video-on-Substack)
- [Substack Help: desktop live video](https://support.substack.com/hc/en-us/articles/43904564079892)
- [Substack Help: video embeds](https://support.substack.com/hc/en-us/articles/15659757294228-How-do-I-embed-a-video-in-a-Substack-post)
- [Upwork client pricing](https://www.upwork.com/pricing/client)
- [Upwork freelancer service fee](https://support.upwork.com/hc/en-us/articles/211062538-Learn-about-the-Freelancer-Service-Fee)
- [Dribbble hiring](https://dribbble.com/hiring)
- [Behance fees FAQ](https://help.behance.net/hc/en-us/articles/10770324288923-FAQ-What-are-the-fees)
