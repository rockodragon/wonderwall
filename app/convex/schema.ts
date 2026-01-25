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
    jobFunctions: v.array(v.string()), // curated list + "other:custom"
    location: v.optional(v.string()),
    plan: v.optional(v.string()), // "free" | "paid" - defaults to free
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_name", ["name"]),

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

  // Portfolio artifacts
  artifacts: defineTable({
    profileId: v.id("profiles"),
    type: v.string(), // "text" | "image" | "video" | "audio" | "link"
    content: v.optional(v.string()), // markdown for text type
    mediaUrl: v.optional(v.string()), // external URL for media
    mediaStorageId: v.optional(v.id("_storage")), // Convex file storage
    title: v.optional(v.string()), // optional title for the artifact
    order: v.number(),
    createdAt: v.number(),
  }).index("by_profileId", ["profileId"]),

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
    location: v.optional(v.string()),
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
});
