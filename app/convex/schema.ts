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
    .index("by_inviteSlug", ["inviteSlug"]),

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
    // Location fields
    location: v.optional(v.string()), // Display string: "Tamarack State Beach, Carlsbad, CA"
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizerId", ["organizerId"])
    .index("by_datetime", ["datetime"])
    .index("by_status", ["status"]),

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
    wantsToHost: v.optional(v.boolean()),
    portfolioUrl: v.optional(v.string()),
    hearAboutUs: v.optional(v.string()),
    hearAboutUsOther: v.optional(v.string()),
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

  // Host organizations (provisioned by operators, not self-serve).
  // The Garden itself is the default host org; churches/sponsors are also
  // hostOrgs (kind "church") so coverage + allocations share one shape.
  hostOrgs: defineTable({
    name: v.string(),
    slug: v.string(),
    kind: v.string(), // "platform" | "church" | "org"
    givingUrl: v.optional(v.string()), // fallback outbound giving page
    // Stripe Payment Link from the ORG'S OWN Stripe account (they create it,
    // we embed it). Giving starts and ends on our site via after_completion
    // redirect back to /fund/:slug — org stays merchant of record (D3).
    paymentLinkUrl: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()), // set for orgs that buy coverage
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

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
    hostOrgId: v.id("hostOrgs"), // whose community the 40% dues share accrues to
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
    budget: v.optional(v.number()), // paid: declared budget — the guardrail (required by mutation)
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_kind_status", ["userId", "kind", "status"])
    .index("by_kind_status", ["kind", "status"])
    .index("by_storySlug", ["storySlug"])
    .index("by_legacyJobId", ["legacyJobId"]),

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
    // workshop), tags are what discipline it's for. Drawn from the same
    // canonical INTERESTS list used by People and Projects.
    tags: v.optional(v.array(v.string())),
    // "Jenna's case" — some instructors already run sign-ups/payment through
    // an outside tool. Mirrors projects.supportPaymentLinkUrl's convention
    // (an optional external link, off-platform money, no in-house payment
    // processing) — see that field's comment. Unlike supportPaymentLinkUrl,
    // this one IS wired into a UI/mutation flow: clicking through still
    // calls signUpForOffering so the sign-up is recorded here regardless of
    // what happens on the external site.
    externalPaymentLinkUrl: v.optional(v.string()),
    status: v.string(), // "active" | "archived"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

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
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_email", ["eventId", "email"]),

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

  // Story updates (W3) — the credit-carrying timeline on public story pages.
  storyUpdates: defineTable({
    projectId: v.id("projects"),
    authorUserId: v.id("users"),
    body: v.string(),
    mediaUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_projectId", ["projectId"]),
});
