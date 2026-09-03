import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Convex Auth tables (users, sessions, accounts, etc.)
  ...authTables,

  // Profile (1:1 with user)
  profiles: defineTable({
    userId: v.id("users"),
    name: v.string(),
    bio: v.optional(v.string()),
    imageUrl: v.optional(v.string()), // external URL (legacy)
    imageStorageId: v.optional(v.id("_storage")), // Convex file storage
    interests: v.array(v.string()), // canonical INTERESTS vocabulary + "other:custom"
    // Location: `location` stays the plain display string everything already
    // reads/matches on. The rest is structured data from the same Google
    // Places pipeline `events` already uses (convex/location.ts +
    // LocationAutocomplete) — collected once, alongside the string, instead
    // of thrown away after the autocomplete resolves.
    location: v.optional(v.string()),
    locationType: v.optional(v.string()), // "venue" | "city" | "zip" | "address" | "online" | "tbd"
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        stateCode: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        countryCode: v.optional(v.string()),
      }),
    ),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    placeId: v.optional(v.string()), // Google Places ID for enrichment
    plan: v.optional(v.string()), // "free" | "paid" - defaults to free
    inviteSlug: v.optional(v.string()), // unique slug for invite links (e.g., "rick-moy")
    inviteUsageCount: v.optional(v.number()), // track how many times their invite link has been used
    unlimitedInvites: v.optional(v.boolean()), // admin accounts with unlimited invites
    isAdmin: v.optional(v.boolean()), // admin access for platform management
    // Fixed personal code for approving waitlist entries (waitlist.ts
    // approveEntry) — 6 chars, part of the admin's name + a random suffix,
    // generated once (admin.ts syncAdminGroup) and reused for every person
    // that admin approves. Resolves through the same route as inviteSlug
    // (convex/invites.ts findInviterProfile) so approved members sign
    // up at the same /signup/:code URL as a peer invite.
    adminCode: v.optional(v.string()),
    // Garden roles — free to hold, pay per act (plan §2.1). Levels are NOT
    // stored here; they derive from memberships (garden/entitlements.ts).
    patronRole: v.optional(v.boolean()),
    partnerRole: v.optional(v.boolean()),
    // V1 onboarding (docs/the-exchange-v1-prd.md §6, §13.1): the role
    // someone chose at signup — "creative" | "patron" | "partner". Roles
    // stay additive (patronRole/partnerRole above still govern capability),
    // this is just which onramp they took, for UX (default view, copy).
    primaryRole: v.optional(v.string()),
    orgName: v.optional(v.string()), // patron/partner: their org, if any
    supportInterests: v.optional(v.array(v.string())), // patron: categories they want to fund
    partnerOfferings: v.optional(v.array(v.string())), // partner: what they can offer
    lastLikeNotifiedAt: v.optional(v.number()), // last time likes digest was sent
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_name", ["name"])
    .index("by_inviteSlug", ["inviteSlug"])
    .index("by_adminCode", ["adminCode"]),

  // Flexible key-value attributes (social handles, employer, etc.)
  attributes: defineTable({
    profileId: v.id("profiles"),
    key: v.string(), // "twitter", "instagram", "linkedin", "employer", etc.
    value: v.string(),
  })
    .index("by_profileId", ["profileId"])
    .index("by_profileId_key", ["profileId", "key"]),

  // Ordered links on profile
  links: defineTable({
    profileId: v.id("profiles"),
    label: v.string(),
    url: v.string(),
    order: v.number(),
  }).index("by_profileId", ["profileId"]),

  // Portfolio artifacts. The Exchange V1 pivot (docs/the-exchange-v1-prd.md
  // §7) retires "Portfolio" as its own concept: each artifact becomes the
  // media attached to its own new passion project via projectId (set by
  // garden/artifactsMigration.ts, idempotent). profileId stays for the
  // legacy /works reader and as the artifact's original-author link.
  artifacts: defineTable({
    profileId: v.id("profiles"),
    type: v.string(), // "text" | "image" | "video" | "audio" | "link"
    content: v.optional(v.string()), // markdown for text type
    mediaUrl: v.optional(v.string()), // external URL for media
    mediaStorageId: v.optional(v.id("_storage")), // Convex file storage
    ogImageUrl: v.optional(v.string()), // fetched og:image for link types
    title: v.optional(v.string()), // optional title for the artifact
    order: v.number(),
    createdAt: v.number(),
    projectId: v.optional(v.id("projects")), // set once migrated (V1 pivot)
  })
    .index("by_profileId", ["profileId"])
    .index("by_projectId", ["projectId"]),

  // Wondering prompts
  wonderings: defineTable({
    profileId: v.id("profiles"),
    prompt: v.string(),
    imageStorageId: v.optional(v.id("_storage")), // background image
    expiresAt: v.optional(v.number()), // null = permanent (paid)
    isPermanent: v.boolean(),
    isActive: v.boolean(), // only one active at a time for free
    createdAt: v.number(),
  })
    .index("by_profileId", ["profileId"])
    .index("by_profileId_active", ["profileId", "isActive"]),

  // Responses to wonderings
  wonderingResponses: defineTable({
    wonderingId: v.id("wonderings"),
    responderId: v.id("users"),
    mediaType: v.string(), // "text" | "video" | "audio" | "link"
    content: v.optional(v.string()), // for text responses
    mediaUrl: v.optional(v.string()), // for media responses
    isPublic: v.boolean(), // owner can publish
    createdAt: v.number(),
  })
    .index("by_wonderingId", ["wonderingId"])
    .index("by_responderId", ["responderId"]),

  // Community events
  events: defineTable({
    organizerId: v.id("users"),
    title: v.string(),
    description: v.string(),
    datetime: v.number(),
    endTime: v.optional(v.number()), // optional end timestamp (ms) — must be > datetime (enforced in mutations)
    // Optional paid ticket tiers (e.g. General $25 · Patron $100). Absent =
    // free/RSVP-only event; RSVPs keep working alongside tiers.
    ticketTiers: v.optional(
      v.array(
        v.object({
          name: v.string(),
          priceCents: v.number(),
          description: v.optional(v.string()),
          quantity: v.optional(v.number()), // optional cap; absent = uncapped
        }),
      ),
    ),
    // Location fields
    location: v.optional(v.string()), // Venue name / display string: "Tamarack State Beach"
    venueAddress: v.optional(v.string()), // Free-text street address ("123 Main St, Carlsbad, CA") — preferred for maps links when present. (`address` below is the structured autocomplete object, so this plain-string field gets its own name.)
    locationType: v.optional(v.string()), // "venue" | "city" | "zip" | "online" | "tbd"
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        stateCode: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        countryCode: v.optional(v.string()),
      }),
    ),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    placeId: v.optional(v.string()), // Radar place ID for enrichment
    tags: v.array(v.string()),
    requiresApproval: v.boolean(),
    status: v.string(), // "draft" | "published" | "cancelled" | "completed"
    coverImageStorageId: v.optional(v.id("_storage")), // cover/background image
    coverColor: v.optional(v.string()), // fallback gradient color (e.g. "blue", "purple")
    imageStorageIds: v.optional(v.array(v.id("_storage"))), // up to 3 gallery images
    // ——— Gated event video (docs/gated-event-video-prd.md) ———
    // Every field below is PUBLIC BY DESIGN. events.list / events.get /
    // events.search all `return { ...event }` and two of them are
    // unauthenticated browse surfaces, so anything on this table is published
    // to the world. That is fine for these four and NOT fine for a join link:
    // meetingUrl/recordingUrl live in the separate `eventVideo` table below
    // (PRD Criticism #1). Do not add a secret field to this table.
    accessType: v.optional(v.string()), // "public" | "paid" — absent = public
    priceCents: v.optional(v.number()), // shown on the public page; that's the point of a price
    paymentLinkUrl: v.optional(v.string()), // public by design — you must see it to pay
    hasVideo: v.optional(v.boolean()), // "this event has a room" — carries no secret
    // The community this event was posted into (optional; public by design,
    // it's a name on a card). See projects.hostOrgId.
    hostOrgId: v.optional(v.id("hostOrgs")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizerId", ["organizerId"])
    .index("by_datetime", ["datetime"])
    .index("by_status", ["status"])
    .index("by_hostOrgId", ["hostOrgId"]),

  // The ONLY home for secret event URLs (docs/gated-event-video-prd.md,
  // "Data model"). Nothing spreads this document into a public response:
  // exactly one query (convex/eventVideo.ts) may ever return these fields,
  // and it resolves a role first. A `{ ...event }` spread cannot leak a
  // field that isn't on the event document — that's the whole point of the
  // separate table, and it fails closed for code nobody has written yet.
  eventVideo: defineTable({
    eventId: v.id("events"),
    meetingUrl: v.optional(v.string()), // the live join link
    recordingUrl: v.optional(v.string()), // the replay link, posted after
    recordingPostedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_eventId", ["eventId"]),

  // Event applications
  eventApplications: defineTable({
    eventId: v.id("events"),
    applicantId: v.id("users"),
    message: v.optional(v.string()),
    status: v.string(), // "pending" | "accepted" | "declined"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_applicantId", ["applicantId"])
    .index("by_eventId_status", ["eventId", "status"]),

  // Invite codes for invite-only access
  invites: defineTable({
    inviterId: v.id("users"),
    code: v.string(),
    usedBy: v.optional(v.id("users")),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_inviterId", ["inviterId"]),

  // Embeddings for semantic search
  embeddings: defineTable({
    entityType: v.string(), // "profile" | "artifact" | "wondering"
    entityId: v.string(), // ID of the entity
    vector: v.array(v.float64()),
    content: v.string(), // the text that was embedded
    updatedAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .vectorIndex("by_vector", {
      vectorField: "vector",
      dimensions: 1536, // OpenAI ada-002
      filterFields: ["entityType"],
    }),

  // Analytics: profile views
  profileViews: defineTable({
    profileId: v.id("profiles"),
    viewerId: v.optional(v.id("users")), // null for anonymous
    createdAt: v.number(),
  })
    .index("by_profileId", ["profileId"])
    .index("by_viewerId", ["viewerId"]),

  // Analytics: profile likes
  profileLikes: defineTable({
    profileId: v.id("profiles"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_profileId", ["profileId"])
    .index("by_userId", ["userId"])
    .index("by_profileId_userId", ["profileId", "userId"]),

  // Artifact likes
  artifactLikes: defineTable({
    artifactId: v.id("artifacts"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_artifactId", ["artifactId"])
    .index("by_userId", ["userId"])
    .index("by_artifactId_userId", ["artifactId", "userId"]),

  // Favorites (can favorite profiles or events)
  favorites: defineTable({
    userId: v.id("users"),
    targetType: v.string(), // "profile" | "event"
    targetId: v.string(), // ID of the profile or event
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_type", ["userId", "targetType"])
    .index("by_target", ["targetType", "targetId"])
    .index("by_userId_target", ["userId", "targetType", "targetId"]),

  // Waitlist for users interested in joining
  waitlist: defineTable({
    email: v.string(),
    createdAt: v.number(),
    // Follow-up questions answered after joining — each one bumps
    // priorityScore, which is what "move up the list" is ranked on.
    priorityScore: v.optional(v.number()),
    answeredAt: v.optional(v.number()),
    role: v.optional(
      v.union(v.literal("creative"), v.literal("patron"), v.literal("partner")),
    ),
    projectDescription: v.optional(v.string()),
    projectUrl: v.optional(v.string()),
    // Has a project they want to bring/showcase at launch — "host" here
    // means bringing a project, distinct from the Host role (an org that
    // runs a Table) below. Kept separate to not overload that word.
    hasLaunchProject: v.optional(v.boolean()),
    portfolioUrl: v.optional(v.string()),
    // Prospective Host signal — copy says "Community Host" (parallel to the
    // existing Community Partner persona), since "Table" is internal
    // branding external people won't know yet. Host onboarding itself is
    // out of V1 scope; this is just a lead to follow up on manually.
    interestedInHosting: v.optional(v.boolean()),
    hearAboutUs: v.optional(v.string()),
    hearAboutUsOther: v.optional(v.string()),
    // Admin approval (waitlist.ts approveEntry). approvedBy names which
    // admin approved them — their adminCode (profiles.adminCode) is what
    // got emailed, looked up from this at display/send time rather than
    // copied here, so a right-to-be-forgotten deletion of the admin's
    // account doesn't leave a dangling code string behind.
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

  // Jobs board
  jobs: defineTable({
    posterId: v.id("users"),
    profileId: v.id("profiles"),
    // Required fields
    title: v.string(),
    description: v.string(), // Rich text/markdown
    location: v.union(
      v.literal("Remote"),
      v.literal("Hybrid"),
      v.literal("On-site"),
    ),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
    zipCode: v.optional(v.string()), // For future distance-based filtering
    jobType: v.union(
      v.literal("Full-time"),
      v.literal("Part-time"),
      v.literal("Contract"),
      v.literal("Freelance"),
    ),
    visibility: v.union(v.literal("Private"), v.literal("Members")),
    // Optional fields
    hiringOrg: v.optional(v.string()), // Company/organization name
    postAnonymously: v.boolean(), // Default false, hides hiringOrg if true
    compensationRange: v.optional(v.string()),
    externalLink: v.optional(v.string()),
    disciplines: v.optional(v.array(v.string())), // Job functions from profiles
    experienceLevel: v.optional(
      v.union(
        v.literal("Entry"),
        v.literal("Mid"),
        v.literal("Senior"),
        v.literal("Any"),
      ),
    ),
    // Metadata
    status: v.union(v.literal("Open"), v.literal("Closed")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_posterId", ["posterId"])
    .index("by_profileId", ["profileId"])
    .index("by_status", ["status"])
    .index("by_visibility", ["visibility"])
    .index("by_status_and_visibility", ["status", "visibility"])
    .index("by_location", ["location"]),

  // Job interest tracking
  jobInterests: defineTable({
    jobId: v.id("jobs"),
    userId: v.id("users"),
    profileId: v.id("profiles"),
    note: v.optional(v.string()), // Max 500 chars (enforced in mutation)
    workLinks: v.array(v.id("artifacts")), // Max 3 (enforced in mutation)
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_jobId", ["jobId"])
    .index("by_userId", ["userId"])
    .index("by_jobId_userId", ["jobId", "userId"]), // Unique constraint

  // Direct messaging - Conversations
  conversations: defineTable({
    participants: v.array(v.id("users")), // Exactly 2 participants
    lastMessageAt: v.number(), // For sorting conversations by recency
    createdAt: v.number(),
  }).index("by_lastMessageAt", ["lastMessageAt"]),

  // Direct messaging - Messages
  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    content: v.string(), // Max 2000 chars (enforced in mutation)
    readAt: v.optional(v.number()), // When recipient read the message
    createdAt: v.number(),
  })
    .index("by_conversationId", ["conversationId"])
    .index("by_senderId", ["senderId"])
    .index("by_conversationId_createdAt", ["conversationId", "createdAt"]),

  // User blocking
  blocks: defineTable({
    blockerId: v.id("users"), // User who blocked
    blockedId: v.id("users"), // User who was blocked
    createdAt: v.number(),
  })
    .index("by_blockerId", ["blockerId"])
    .index("by_blockedId", ["blockedId"])
    .index("by_blocker_blocked", ["blockerId", "blockedId"]),

  // Notifications
  notifications: defineTable({
    userId: v.id("users"), // Recipient of the notification
    type: v.string(), // "invite_accepted" | "message" | etc.
    title: v.string(),
    message: v.string(),
    linkUrl: v.optional(v.string()), // URL to navigate to when clicked
    imageUrl: v.optional(v.string()), // Avatar or related image
    relatedUserId: v.optional(v.id("users")), // User who triggered the notification
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_readAt", ["userId", "readAt"]),

  // Content/user reports for admin review
  reports: defineTable({
    reporterId: v.id("users"),
    reportedUserId: v.id("users"),
    messageId: v.optional(v.id("messages")), // If reporting a specific message
    reason: v.union(
      v.literal("harassment"),
      v.literal("spam"),
      v.literal("inappropriate"),
      v.literal("other"),
    ),
    details: v.optional(v.string()), // Max 500 chars (enforced in mutation)
    status: v.union(
      v.literal("pending"),
      v.literal("reviewed"),
      v.literal("dismissed"),
      v.literal("action_taken"),
    ),
    adminNotes: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_reportedUserId", ["reportedUserId"])
    .index("by_reporterId", ["reporterId"]),

  // ========================================
  // Job Board Crawler - Partner Discovery
  // ========================================

  // Crawled organizations (potential job board partners)
  crawledOrganizations: defineTable({
    // Discovery info
    sourceUrl: v.string(), // Original URL where discovered
    source: v.string(), // "publicsquare" | "directory" | "manual" | "referral" | "church_finder"
    discoveredAt: v.number(),

    // Organization details
    name: v.string(),
    website: v.optional(v.string()), // Main website if different from sourceUrl
    industry: v.optional(v.string()),
    description: v.optional(v.string()), // AI-generated summary

    // Location
    streetAddress: v.optional(v.string()), // Full street address (e.g., "123 Main St")
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    country: v.optional(v.string()),

    // Size and type
    employeeEstimate: v.optional(v.string()), // "1-5" | "5-20" | "20-50" | "50-100" | "100+"
    orgType: v.optional(v.string()), // "church" | "business" | "nonprofit" | "ministry"

    // Classification - Persona tags
    personaTags: v.array(v.string()), // ["CHURCH", "NONPROFIT", "EDUCATION", etc.]

    // Scoring (0-100 scale)
    valuesScore: v.number(), // 0-40: Faith/values alignment signals
    hiringScore: v.number(), // 0-30: Hiring potential indicators
    qualityScore: v.number(), // 0-20: Organization quality/professionalism
    contactScore: v.number(), // 0-10: Contact info availability
    totalScore: v.number(), // Sum of above

    // AI analysis results
    faithSignals: v.array(v.string()), // Detected faith-related phrases
    conservativeSignals: v.array(v.string()), // Conservative indicators

    // Contact information
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    contactFormUrl: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),

    // Career page info
    hasCareerPage: v.optional(v.boolean()),
    careerPageUrl: v.optional(v.string()),
    lastJobsCrawledAt: v.optional(v.number()),

    // Leadership - notable people to contact or mention
    leadershipMarkdown: v.optional(v.string()), // Markdown formatted leadership info

    // Workflow status
    status: v.string(), // "new" | "contacted" | "responded" | "converted" | "declined" | "nurture"
    segment: v.string(), // "hot" | "warm" | "nurture" | "research" | "low"

    // CRM integration
    exportedToCrm: v.boolean(),
    crmId: v.optional(v.string()), // ID in external CRM (Upsight)
    lastExportedAt: v.optional(v.number()),

    // Metadata
    crawledAt: v.number(),
    lastUpdated: v.number(),
    notes: v.optional(v.string()), // Admin notes

    // Raw data storage
    rawHtml: v.optional(v.string()), // Stored for re-analysis (truncated)
    rawClassification: v.optional(v.string()), // Full AI classification JSON
  })
    .index("by_source", ["source"])
    .index("by_status", ["status"])
    .index("by_segment", ["segment"])
    .index("by_totalScore", ["totalScore"])
    .index("by_state", ["state"])
    .index("by_personaTag", ["personaTags"])
    .index("by_exportedToCrm", ["exportedToCrm"])
    .index("by_website", ["website"]),

  // Crawler run history (for monitoring and debugging)
  crawlerRuns: defineTable({
    source: v.string(), // Which source was crawled
    status: v.string(), // "running" | "completed" | "failed" | "cancelled"
    config: v.optional(v.string()), // JSON config used for this run

    // Stats
    urlsProcessed: v.number(),
    orgsFound: v.number(),
    orgsCreated: v.number(),
    orgsUpdated: v.number(),
    errors: v.array(v.string()), // Error messages

    // Timing
    startedAt: v.number(),
    completedAt: v.optional(v.number()),

    // Who triggered it
    triggeredBy: v.optional(v.id("users")), // null for scheduled runs
  })
    .index("by_status", ["status"])
    .index("by_source", ["source"])
    .index("by_startedAt", ["startedAt"]),

  // Crawler sources configuration
  crawlerSources: defineTable({
    name: v.string(), // "publicsquare" | "church_finder" | etc.
    displayName: v.string(),
    baseUrl: v.string(),
    isActive: v.boolean(),

    // Crawl settings
    crawlFrequency: v.string(), // "daily" | "weekly" | "manual"
    lastCrawledAt: v.optional(v.number()),
    nextCrawlAt: v.optional(v.number()),

    // Rate limiting
    requestsPerMinute: v.number(),
    delayBetweenRequests: v.number(), // milliseconds

    // Selector configuration (for scraping)
    selectors: v.optional(v.string()), // JSON config for CSS selectors

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_isActive", ["isActive"]),

  // URL queue for crawling
  crawlerQueue: defineTable({
    url: v.string(),
    source: v.string(),
    priority: v.number(), // Higher = more urgent
    status: v.string(), // "pending" | "processing" | "completed" | "failed"
    retryCount: v.number(),
    maxRetries: v.number(),

    // Results
    organizationId: v.optional(v.id("crawledOrganizations")),
    errorMessage: v.optional(v.string()),

    // Timing
    addedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_source", ["source"])
    .index("by_priority", ["priority"])
    .index("by_url", ["url"]),

  // Jobs scraped from organization career pages
  crawledJobs: defineTable({
    // Link to organization
    organizationId: v.id("crawledOrganizations"),

    // Job details
    title: v.string(),
    department: v.optional(v.string()),
    location: v.optional(v.string()), // "Remote", "New York, NY", etc.
    locationType: v.optional(v.string()), // "remote" | "onsite" | "hybrid"
    employmentType: v.optional(v.string()), // "full-time" | "part-time" | "contract" | "internship"

    // Compensation (if disclosed)
    salaryMin: v.optional(v.number()),
    salaryMax: v.optional(v.number()),
    salaryPeriod: v.optional(v.string()), // "yearly" | "hourly"

    // Description
    description: v.optional(v.string()), // Truncated job description
    requirements: v.optional(v.array(v.string())),

    // Application
    applyUrl: v.string(),
    applicationDeadline: v.optional(v.number()),

    // Source tracking
    sourceType: v.string(), // "crawled" | "posted" (org posted directly)
    sourceUrl: v.string(), // Career page URL where found

    // Dates
    postedDate: v.optional(v.number()), // When job was posted (if found)
    crawledAt: v.number(),
    lastSeenAt: v.number(), // Updated each time we see it

    // Status
    isActive: v.boolean(), // false if job no longer appears on site
    deactivatedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_isActive", ["isActive"])
    .index("by_sourceType", ["sourceType"])
    .index("by_crawledAt", ["crawledAt"])
    .index("by_applyUrl", ["applyUrl"]),

  // ————————————————————————————————————————————————————————————————
  // The Garden — Phase 1B (docs/phase-1b/spec.md). W1: money foundation.
  // Entitlement inputs live here; server-side can() reads them via
  // garden/entitlements.getGardenUser. Levels derive from memberships,
  // never stored on profiles (profiles carries only the free-to-hold roles).
  // ————————————————————————————————————————————————————————————————

  // Host organizations = COMMUNITIES (docs/features/community-groups.md).
  // One table, three kinds: "community" (a named group on the platform —
  // The Garden is the first; hosts apply, operators approve), "org"/"church"
  // (a sponsor or fund owner — Abiding Practice — that may never be listed
  // as a community), and "platform" (the single creatives.exchange row that
  // owns the platform-wide project pool ledger; never listed). Coverage,
  // allocations, tables, and grantContributions all key off this table.
  //
  // Every community field below is OPTIONAL so rows written before the
  // community layer keep validating: absent status reads as "active",
  // absent visibility as "public", absent joinPolicy as "open"
  // (garden/communities.ts normalizes).
  hostOrgs: defineTable({
    name: v.string(),
    slug: v.string(),
    kind: v.string(), // "community" | "platform" | "church" | "org"
    givingUrl: v.optional(v.string()), // fallback outbound giving page
    // Stripe Payment Link from the ORG'S OWN Stripe account (they create it,
    // we embed it). Giving starts and ends on our site via after_completion
    // redirect back to /fund/:slug — org stays merchant of record (D3).
    paymentLinkUrl: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()), // set for orgs that buy coverage
    // ——— Community layer ———
    tagline: v.optional(v.string()), // one line under the name
    description: v.optional(v.string()), // the community's own words (plain text)
    coverUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    locationLabel: v.optional(v.string()), // "San Diego" / "Online" — display only
    ownerUserId: v.optional(v.id("users")), // the host who applied / runs it
    status: v.optional(v.string()), // "pending" | "active" | "declined" | "archived"
    visibility: v.optional(v.string()), // "public" | "unlisted"
    joinPolicy: v.optional(v.string()), // "open" | "apply"
    applicantNote: v.optional(v.string()), // "what you already gather" — from the apply form
    approvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_kind_status", ["kind", "status"])
    .index("by_ownerUserId", ["ownerUserId"]),

  // Community membership (user ↔ community). Distinct from `memberships`
  // below, which is the PAID SEAT: a seat is platform membership, not
  // community membership (brief §5.6). Belonging to a community is free.
  communityMembers: defineTable({
    hostOrgId: v.id("hostOrgs"),
    userId: v.id("users"),
    role: v.string(), // "host" | "moderator" | "member"
    status: v.string(), // "active" | "pending" (joinPolicy "apply") | "removed"
    isHome: v.optional(v.boolean()), // the member's named home community (one at most)
    joinedAt: v.number(),
  })
    .index("by_hostOrgId", ["hostOrgId"])
    .index("by_userId", ["userId"])
    .index("by_hostOrgId_userId", ["hostOrgId", "userId"]),

  // Stripe customer linkage (1:1 with user once they ever check out).
  billingCustomers: defineTable({
    userId: v.id("users"),
    stripeCustomerId: v.string(),
    email: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

  // Membership state — driven exclusively by Stripe webhooks + the nightly
  // reconcile cron (idempotent upserts keyed by stripeSubscriptionId).
  memberships: defineTable({
    userId: v.id("users"),
    level: v.string(), // "seat" | "five" | "host"
    status: v.string(), // "active" | "past_due" | "canceled" | "incomplete"
    // A seat is PLATFORM membership (brief §5.6) — new self-paid seats leave
    // this unset. Still written for covered seats (the sponsoring org) and
    // kept on legacy rows; entitlements never read it.
    hostOrgId: v.optional(v.id("hostOrgs")),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    coveredByCodeId: v.optional(v.id("coverageCodes")), // set for covered seats
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"])
    .index("by_coveredByCodeId", ["coveredByCodeId"]),

  // Coverage codes: ONE church subscription (quantity = seats) per code (D2).
  coverageCodes: defineTable({
    hostOrgId: v.id("hostOrgs"), // the sponsoring org
    code: v.string(), // e.g. "GRACE-FALL"
    seats: v.number(), // mirrors subscription quantity via webhook
    stripeSubscriptionId: v.string(),
    status: v.string(), // "active" | "suspended" | "canceled" — card failure suspends with grace, never silently strips seats
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]),

  coverageRedemptions: defineTable({
    codeId: v.id("coverageCodes"),
    userId: v.id("users"),
    membershipId: v.optional(v.id("memberships")),
    redeemedAt: v.number(),
  })
    .index("by_codeId", ["codeId"])
    .index("by_userId", ["userId"]),

  // Projects (passion + paid). Legacy jobs freeze and copy in via
  // legacyJobId (W2). Active-passion count is an entitlement input.
  projects: defineTable({
    userId: v.id("users"), // the creator (passion) or poster (paid)
    kind: v.string(), // "passion" | "paid"
    title: v.string(),
    blurb: v.optional(v.string()),
    // Paid projects declare a money STATE, not necessarily a number (the
    // guardrail, plan §2.3 — see convex/garden/projects.ts). All three fields
    // are optional so rows written before budgetType existed keep working:
    // for display, a legacy row with a `budget` and no `budgetType` reads as
    // "amount", and one with neither reads as "proposals".
    budgetType: v.optional(v.string()),
    //   "amount"     — a set number: `budget` is it, `budgetMax` unset
    //   "range"      — `budget` is the low end, `budgetMax` the high end
    //   "proposals"  — open to proposals; neither number is set
    //   "volunteer"  — explicitly unpaid; neither number is set
    budget: v.optional(v.number()), // paid: the amount, or a range's low end
    budgetMax: v.optional(v.number()), // paid: a range's high end
    goal: v.optional(v.number()), // passion: optional target
    raisedCents: v.optional(v.number()), // passion: keep-what-you-raise running total
    status: v.string(), // "pending" | "active" | "in_progress" | "completed" | "archived"
    photoUrl: v.optional(v.string()),
    storySlug: v.optional(v.string()), // public story page (W3)
    legacyJobId: v.optional(v.id("jobs")),
    // V1 support widget (docs/the-exchange-v1-prd.md §9): set once by the
    // poster/an operator, mirrors hostOrgs.paymentLinkUrl. Financial support
    // is off until this exists — no in-house payment processing in V1.
    supportPaymentLinkUrl: v.optional(v.string()),
    // Location: same structured shape as `events`/`profiles` — `location`
    // stays the plain display string everything reads/matches on, the rest
    // is structured data from the same Google Places pipeline (convex/
    // location.ts + LocationAutocomplete).
    location: v.optional(v.string()),
    locationType: v.optional(v.string()), // "venue" | "city" | "zip" | "address" | "online" | "tbd"
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        stateCode: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        countryCode: v.optional(v.string()),
      }),
    ),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    placeId: v.optional(v.string()), // Google Places ID for enrichment
    remote: v.optional(v.boolean()), // true (default when unset) = anywhere/remote-friendly; false = must be local to `location`
    // Passion-only campaign deadline (docs/the-exchange-v1-prd.md §7 review
    // follow-up). Not on paid projects — a hiring post has no equivalent
    // "campaign" concept.
    raiseByDate: v.optional(v.number()), // epoch ms
    // Self-declared, unverified nonprofit disclosure (review follow-up) — no
    // EIN/verification field for V1, that's a deliberate scope cut.
    benefitsNonprofit: v.optional(v.boolean()),
    nonprofitName: v.optional(v.string()),
    // A project's own declared topics (the canonical INTERESTS list) —
    // separate from anything on the creator's profile. Optional: an older
    // project from before this field existed, or one where nothing was
    // selected at creation, has none — callers fall back to the creator's
    // own interests in that case rather than treating it as untagged.
    interests: v.optional(v.array(v.string())),
    // Which creation path produced this row (review follow-up — a quick
    // portfolio share and a deliberately-posted project both insert here,
    // and were indistinguishable on the public /projects browse grid).
    // "posted" = createPassionProject/createPaidProject (convex/garden/
    // projects.ts) — a deliberate project post. "portfolio" = the companion
    // project artifacts.create (convex/artifacts.ts) inserts as a side
    // effect of a quick single-artifact share. Optional and defensive:
    // existing rows predate this field until garden/projectOriginMigration.ts
    // backfills them; treat an absent value as "posted" everywhere it's read.
    origin: v.optional(v.string()),
    // The community this was posted INTO (optional — content belongs to the
    // person, and is only tagged to a community; community-groups.md §0).
    hostOrgId: v.optional(v.id("hostOrgs")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_kind_status", ["userId", "kind", "status"])
    .index("by_kind_status", ["kind", "status"])
    .index("by_storySlug", ["storySlug"])
    .index("by_legacyJobId", ["legacyJobId"])
    .index("by_hostOrgId", ["hostOrgId"]),

  // Support widget (docs/the-exchange-v1-prd.md §9): one record per act of
  // support on a project. Financial types start "pending" until an operator
  // confirms the money actually moved (no webhook listener in V1 — see PRD
  // §9); encouragement/resource need no money and are confirmed on creation.
  projectSupport: defineTable({
    projectId: v.id("projects"),
    supporterUserId: v.optional(v.id("users")),
    supporterName: v.string(),
    type: v.string(), // "financial_one_time" | "financial_recurring" | "encouragement" | "resource"
    amountCents: v.optional(v.number()),
    message: v.optional(v.string()),
    resourceDescription: v.optional(v.string()),
    visible: v.boolean(), // show supporter name publicly (default true)
    status: v.string(), // "pending" | "confirmed"
    createdAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_supporterUserId", ["supporterUserId"]),

  // Classes & Coaching — recurring offerings (a weekly class, a mentorship
  // slot, a workshop series) that don't fit Projects (one-off) or Events
  // (single datetime, RSVP-based). Tied directly to the creator (userId),
  // not a Host org — deliberately NOT built on the deferred gardenTables/
  // hostOrgs system below (that requires a Host org; V1 is single-tenant).
  offerings: defineTable({
    userId: v.id("users"), // creator
    title: v.string(),
    description: v.optional(v.string()),
    format: v.string(), // "class" | "coaching" | "workshop" | "mentorship" | "other"
    cadence: v.optional(v.string()), // free text, e.g. "Tuesdays 6pm" — no recurrence engine
    // Structured date, mirroring events.datetime's naming/type convention —
    // `cadence` above stays the free-text display string (no recurrence
    // engine here), this is the actual first/next session time.
    startDate: v.optional(v.number()), // epoch ms — first/next session
    isRecurring: v.optional(v.boolean()),
    endDate: v.optional(v.number()), // epoch ms — "until when" for a recurring series, or the workshop's end date
    priceCents: v.optional(v.number()), // undefined/0 = free
    location: v.optional(v.string()),
    locationType: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        stateCode: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        countryCode: v.optional(v.string()),
      }),
    ),
    coordinates: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    placeId: v.optional(v.string()),
    remote: v.optional(v.boolean()), // true (default) = online/anywhere, false = must be local
    photoUrl: v.optional(v.string()), // external URL — secondary fallback, see photoStorageId
    photoStorageId: v.optional(v.id("_storage")), // Convex file storage — primary upload path
    // Discipline tags (e.g. "Photography") — a separate axis from `format`
    // above: format is what kind of session this is (class/coaching/
    // workshop), interests are what discipline it's for. Same field name as
    // projects.interests — both draw from the canonical INTERESTS list.
    interests: v.optional(v.array(v.string())),
    // "Jenna's case" — some instructors already run sign-ups/payment through
    // an outside tool. Mirrors projects.supportPaymentLinkUrl's convention
    // (an optional external link, off-platform money, no in-house payment
    // processing) — see that field's comment. Unlike supportPaymentLinkUrl,
    // this one IS wired into a UI/mutation flow: clicking through still
    // calls signUpForOffering so the sign-up is recorded here regardless of
    // what happens on the external site.
    externalPaymentLinkUrl: v.optional(v.string()),
    // The community this offering was posted into (optional). The table
    // comment above predates the community layer: an offering still belongs
    // to its creator; this is a tag, not ownership (community-groups.md).
    hostOrgId: v.optional(v.id("hostOrgs")),
    status: v.string(), // "active" | "archived"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_hostOrgId", ["hostOrgId"]),

  // Offering sign-ups (fix for offerings.ts: previously no way to record
  // "someone joined this class," even when payment happened externally).
  // Two payment paths, one record shape — mirrors garden/support.ts's
  // projectSupport in spirit (pledge-only, no real charge, off-platform
  // money leaves no direct signal so it's status-tracked by hand/by pattern
  // rather than a webhook):
  //   "pledged"   — a paid offering, no external link: real intent, no money
  //                 actually moved (same "pledge, not charge" semantics as
  //                 projectSupport's financial types).
  //   "confirmed" — free offering (nothing to charge), OR a paid offering
  //                 with externalPaymentLinkUrl set (payment happens off-
  //                 platform; clicking the external link still records this
  //                 row so the creator has one place to see who's coming).
  offeringSignups: defineTable({
    offeringId: v.id("offerings"),
    userId: v.id("users"),
    name: v.string(), // denormalized for display
    status: v.string(), // "pledged" | "confirmed"
    createdAt: v.number(),
  })
    .index("by_offeringId", ["offeringId"])
    .index("by_offeringId_userId", ["offeringId", "userId"]),

  // Tables — ongoing gatherings with a roster (W4; operator-created in v1).
  gardenTables: defineTable({
    name: v.string(),
    slug: v.string(),
    hostOrgId: v.id("hostOrgs"),
    hostUserId: v.optional(v.id("users")),
    mode: v.string(), // "open" | "member" | "cohort"
    format: v.optional(v.string()), // "Class" | "Mentorship" | "Critique" | "Open mic" | "Workshop" | "Show"
    program: v.optional(v.string()), // e.g. "Pathfinding · Abiding Practice"
    cadence: v.optional(v.string()),
    blurb: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    priceCents: v.optional(v.number()), // cohorts only; free-table rule enforced in mutations
    meetingUrl: v.optional(v.string()), // default link; sessions can override (D8: Daily.co)
    status: v.string(), // "active" | "archived"
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_hostOrgId", ["hostOrgId"])
    .index("by_status", ["status"]),

  tableMemberships: defineTable({
    tableId: v.id("gardenTables"),
    userId: v.id("users"),
    joinedAt: v.number(),
  })
    .index("by_tableId", ["tableId"])
    .index("by_userId", ["userId"])
    .index("by_tableId_userId", ["tableId", "userId"]),

  tableSessions: defineTable({
    tableId: v.id("gardenTables"),
    title: v.optional(v.string()),
    startsAt: v.number(),
    durationMins: v.optional(v.number()),
    meetingUrl: v.optional(v.string()), // overrides table default when set
    createdAt: v.number(),
  }).index("by_tableId_startsAt", ["tableId", "startsAt"]),

  sessionRsvps: defineTable({
    sessionId: v.id("tableSessions"),
    userId: v.id("users"),
    status: v.string(), // "going" | "out"
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_sessionId_userId", ["sessionId", "userId"]),

  // Event RSVPs with a guest path (W4 — the first-table page's mailto dies here).
  eventRsvps: defineTable({
    eventId: v.id("events"),
    userId: v.optional(v.id("users")), // absent for guests
    name: v.string(),
    email: v.string(),
    invitedBy: v.optional(v.string()), // "bring someone" provenance
    // "pending" | "confirmed" — absent on free events. Organizer-set only:
    // rsvpToEvent is unauthenticated, so the existence of an RSVP row is
    // never a credential (docs/gated-event-video-prd.md, Criticism #3).
    // No UI writes this yet — the paid path is deferred (PRD "Build order").
    paymentStatus: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_email", ["eventId", "email"]),

  // Completed event-ticket purchases — written exclusively by the Stripe
  // webhook (checkout.session.completed, mode "payment", kind "event_ticket";
  // see garden/stripeHandlers.ts). Idempotent upsert keyed by
  // stripeSessionId. No refunds/self-serve management — operator-handled.
  ticketPurchases: defineTable({
    eventId: v.id("events"),
    tierName: v.string(), // denormalized tier name at purchase time
    amountCents: v.number(),
    buyerEmail: v.optional(v.string()),
    userId: v.optional(v.id("users")), // absent for guest checkout
    stripeSessionId: v.string(),
    status: v.string(), // "paid" | "refunded" (refunds are operator bookkeeping)
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_stripeSessionId", ["stripeSessionId"])
    .index("by_userId", ["userId"]),

  // AP Fund public allocations ledger (W5; operator-entered, display-only lane).
  allocations: defineTable({
    hostOrgId: v.id("hostOrgs"), // the fund (e.g. Abiding Practice)
    projectId: v.optional(v.id("projects")),
    recipientName: v.string(), // denormalized so the ledger survives project edits
    amountCents: v.number(),
    period: v.string(), // "2026-08" or "2026-08 · monthly"
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_hostOrgId", ["hostOrgId"])
    .index("by_projectId", ["projectId"]),

  // Money IN to a grant pool (allocations above is money OUT). One row per
  // inflow, typed — never free text (community-grant-pools.md §4). Written
  // by the Stripe webhook (dues shares on invoice.paid, one-time pool
  // contributions on checkout.session.completed) or by an operator (top-ups,
  // sponsor money, entry fees, adjustments). Idempotent by stripeRef.
  //
  // Fee rule ("one bite per dollar", pools doc §2): grossCents is what the
  // payer paid; platformCents is the platform's share INCLUDING processing;
  // poolCents is what the pool actually holds. For dues, the receipt split
  // is 50/50; for direct inflows, 10% platform. Awards out are 0%.
  grantContributions: defineTable({
    hostOrgId: v.id("hostOrgs"), // the pool owner: the platform row, or a community
    type: v.string(), // "dues_share" | "contribution_in" | "topup_in" | "sponsor_in" | "entry_fee_in" | "adjustment"
    grossCents: v.number(),
    platformCents: v.number(),
    poolCents: v.number(), // may be negative on an adjustment (refund/chargeback clawback)
    userId: v.optional(v.id("users")), // the payer, when known
    payerName: v.optional(v.string()), // display name for public credit (never email)
    membershipId: v.optional(v.id("memberships")),
    stripeRef: v.optional(v.string()), // invoice id / checkout session id — idempotency key
    period: v.string(), // "YYYY-MM" — same convention as allocations.period
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_hostOrgId", ["hostOrgId"])
    .index("by_stripeRef", ["stripeRef"])
    .index("by_userId", ["userId"]),

  // ——— Community line items for sale (docs/features/community-groups.md §7) ———
  // A community can sell several products at different prices: a premium
  // tier, a resource bundle, a cohort. One-time or monthly. Buyers get the
  // product's gated `resources` (private links) — served ONLY by
  // garden/products.getProductAccess after a purchase check; the public
  // listing never includes them. Money: host 90% / platform 10% (the
  // published split for anything a host sells), recorded per purchase.
  communityProducts: defineTable({
    hostOrgId: v.id("hostOrgs"),
    name: v.string(),
    description: v.optional(v.string()),
    benefits: v.optional(v.string()), // what you get, plain text
    priceCents: v.number(),
    billing: v.string(), // "one_time" | "monthly"
    resources: v.optional(
      v.array(v.object({ label: v.string(), url: v.string() })),
    ), // GATED — never spread into a public response
    status: v.string(), // "active" | "archived"
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_hostOrgId", ["hostOrgId"]),

  // One row per PAYMENT on a community product: a one-time checkout, the
  // first payment of a subscription (keyed by checkout session), or a
  // renewal (keyed by invoice). Access = any row for (product, user) that is
  // one-time "paid", or a subscription row whose status is still entitled.
  // Written by the Stripe webhook (garden/stripeHandlers.ts).
  productPurchases: defineTable({
    productId: v.id("communityProducts"),
    hostOrgId: v.id("hostOrgs"),
    userId: v.optional(v.id("users")),
    buyerEmail: v.optional(v.string()),
    grossCents: v.number(),
    platformCents: v.number(), // 10% incl. processing
    hostCents: v.number(), // 90% — accrues as OWED until a payout is recorded
    billing: v.string(), // mirrors the product at purchase time
    status: v.string(), // "paid" (one-time) | "active" | "past_due" | "canceled" | "refunded"
    stripeRef: v.string(), // checkout session id or invoice id — idempotency key
    stripeSubscriptionId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()), // ms, subscriptions
    period: v.string(), // "YYYY-MM"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_productId", ["productId"])
    .index("by_hostOrgId", ["hostOrgId"])
    .index("by_userId", ["userId"])
    .index("by_stripeRef", ["stripeRef"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]),

  // Operator-recorded payouts of a host's accrued share (manual transfers
  // until Stripe Connect — phase-1b architect §2.5). Owed = sum(hostCents
  // on productPurchases) − sum(hostPayouts.amountCents).
  hostPayouts: defineTable({
    hostOrgId: v.id("hostOrgs"),
    amountCents: v.number(),
    reference: v.optional(v.string()), // Zelle/bank memo
    note: v.optional(v.string()),
    paidAt: v.number(),
    createdAt: v.number(),
  }).index("by_hostOrgId", ["hostOrgId"]),

  // Story updates (W3) — the credit-carrying timeline on public story pages.
  storyUpdates: defineTable({
    projectId: v.id("projects"),
    authorUserId: v.id("users"),
    body: v.string(),
    mediaUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_projectId", ["projectId"]),

  // Announcements (docs/announcements-prd.md). One row per send (manual
  // broadcast or system reminder). Cross-table target reference follows the
  // `favorites` idiom (targetType + string id), tightened to a literal
  // union — `favorites.targetType` is a bare v.string().
  announcements: defineTable({
    targetType: v.union(
      v.literal("project"),
      v.literal("event"),
      v.literal("offering"),
    ),
    targetId: v.string(), // Id of the projects/events/offerings row
    senderUserId: v.optional(v.id("users")), // absent = system reminder
    kind: v.union(v.literal("broadcast"), v.literal("reminder")),
    // Reminder idempotency: "reminder24h:{targetType}:{targetId}:{startsAt}".
    // Absent on broadcasts. Uniqueness enforced in the mutation via
    // by_reminderKey lookup-before-insert (transactional in Convex).
    reminderKey: v.optional(v.string()),
    body: v.string(), // max 2000 chars (enforced in mutation)
    // Denormalized audit counts. recipientCount/unreachableCount are final at
    // send time; emailedCount starts at 0 and each delivery batch adds to it.
    recipientCount: v.number(), // rows in announcementRecipients
    emailedCount: v.number(), // unique addresses emails were scheduled for
    unreachableCount: v.number(), // resolved audience members with no channel
    createdAt: v.number(),
  })
    // createdAt in the index so the rate-limit window check and the
    // newest-first history list are both index scans, not filters.
    .index("by_target_createdAt", ["targetType", "targetId", "createdAt"])
    .index("by_reminderKey", ["reminderKey"]),

  // One row per resolved recipient of one announcement. Doubles as the
  // delivery worklist: deliveredAt is absent until the batch job processes
  // the row. Delivery fields record what was QUEUED, not what landed —
  // emails.sendNotificationEmail is fire-and-forget (no Resend webhook in
  // V1), so "delivered" would be a lie. Exactly one of userId/email may be
  // absent, never both.
  announcementRecipients: defineTable({
    announcementId: v.id("announcements"),
    userId: v.optional(v.id("users")), // absent for guest (email-only) recipients
    email: v.optional(v.string()), // normalized; set for guests at resolve time,
                                   // and for account recipients at delivery time
    notificationId: v.optional(v.id("notifications")), // absent for guests
    emailQueuedAt: v.optional(v.number()), // absent if no address on file
    deliveredAt: v.optional(v.number()), // absent = still pending
    createdAt: v.number(),
  })
    // eq(announcementId).eq(deliveredAt, undefined) is the batch cursor —
    // same undefined-in-index pattern as notifications.by_userId_readAt.
    .index("by_announcementId_deliveredAt", ["announcementId", "deliveredAt"])
    // Cross-batch email dedupe (see Recipient resolution).
    .index("by_announcementId_email", ["announcementId", "email"]),
});
