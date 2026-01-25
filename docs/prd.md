# Wonderwall PRD

## Overview
- **Product**: Social directory + discovery for Christian creatives
- **Platform**: Cross-platform native mobile (React Native or Flutter) — iOS + Android
- **Backend**: Convex.dev (DB + real-time) with embeddings for semantic search
- **Access**: Invite-only community; extensible to multiple communities later

## Problem
Christian creatives lack a purpose-built space to discover peers, share work, ask questions, and find opportunities—existing platforms are noisy and fragmented.

## Goals
1. Enable discovery by skills, background, and current wonderings
2. Lightweight profiles with portfolio artifacts
3. Community events with easy applications
4. Private-by-default responses to wonderings, with optional public sharing

## Non-Goals (MVP)
- Multi-community federation
- Full social feed with likes/comments
- Jobs/gigs (post-MVP)
- Payment processing

## Target Users
- Christian creatives (designers, writers, filmmakers, musicians, etc.)
- Event organizers
- Community connectors seeking collaborators

## Core User Flows
1. **Onboarding**: Receive invite → create account → build profile
2. **Profile setup**: Add bio, job functions, links, artifacts, wondering
3. **Discovery**: Search/browse → filter → view profile → respond to wondering
4. **Events**: Browse events → apply (one-tap + message) → organizer reviews

## MVP Features

### 1. Profiles
- **Core fields**: name, profile image, job functions (curated multi-select), short bio
- **Attributes**: location, employer, social handles (Twitter, Instagram, LinkedIn)
- **Links**: ordered list with label + URL
- **Artifacts**: portfolio cards (text/image/video/audio/link); supports markdown

### 2. Wonderings
- Short prompt/question visible on profile
- **Free plan**: 1 active wondering, expires after 2 weeks (viewable but no new responses)
- **Paid plan**: Mark as permanent, potentially multiple
- **Responses**:
  - Rich media (video/audio/text) via external capture link
  - Private by default
  - Owner can publish to make public

### 3. Search & Discovery
- Semantic search across: bios, job functions, wonderings, artifacts
- Filters: job function, location, employer
- Results: profile cards with snippet

### 4. Events
- Fields: title, description, date/time, location, tags, organizer
- Visibility: community-only
- Registration: open or approval-required
- Applications: one-tap + short message
- Organizer actions: review, accept, decline

### 5. Notifications
- New response to your wondering
- Event application status updates
- New invite acceptance (for inviters)

### 6. Invites
- Members generate invite links/codes
- New users must have valid invite to register

## Data Model
| Entity | Key Fields |
|--------|------------|
| User | id, email, authProvider, plan, createdAt |
| Profile | userId, name, bio, imageUrl, jobFunctions[], location |
| Attribute | profileId, key, value |
| Link | profileId, label, url, order |
| Artifact | profileId, type, content, mediaUrl, order |
| Wondering | profileId, prompt, expiresAt, isPermanent |
| WonderingResponse | wonderingId, responderId, mediaType, mediaUrl, isPublic |
| Event | organizerId, title, description, datetime, location, tags[], requiresApproval |
| EventApplication | eventId, applicantId, message, status |
| Invite | inviterId, code, usedBy, usedAt |
| Embedding | entityType, entityId, vector |

## Non-Functional Requirements
- **Privacy**: Responses private by default; explicit publish action
- **Auth**: Email/social OAuth; invite validation on signup
- **Performance**: Sub-500ms search with vector + keyword hybrid
- **Push notifications**: Event updates, wondering responses

## Success Metrics
| Metric | Definition |
|--------|------------|
| Activation | % completing profile + 1 artifact + 1 wondering |
| Discovery | % of searches leading to profile view |
| Engagement | Wondering responses per active user/month |
| Events | Apply rate, acceptance rate |

## Future Enhancements
- Jobs/gigs marketplace
- Multi-community support with gates
- In-app messaging
- Follow/feed for wondering updates
- Admin moderation tools
- Paid plan billing integration

## Decisions
1. **Job functions**: Curated list + "Other" free-text option
2. **Messaging**: Deferred—use external links (profile social handles) for MVP
3. **Moderation**: None for MVP
4. **Profile stats**: Track views and likes (schema included)

## Tech Stack (v1 Web)
- **Frontend**: React + Remix, TypeScript
- **Backend**: Convex (DB + real-time + auth)
- **Hosting**: Cloudflare Pages
- **Future**: React Native + Expo for mobile
