# Messaging Feature - Product Requirements Document

## Overview

Enable direct communication between job posters and interested candidates, as well as general member-to-member messaging. Includes message center, notifications, and trust/safety features (block, report).

## Goals

1. **Facilitate connections** - Enable posters and interested candidates to communicate directly
2. **Build trust** - Provide safety features (block, report) to maintain community standards
3. **Reduce friction** - Simple, real-time messaging experience
4. **Maintain quality** - Admin oversight for reported content

## User Stories

### As a Job Poster
- I want to message candidates who expressed interest so I can discuss opportunities
- I want to see a notification badge when I have unread messages
- I want to block users who are inappropriate so they can't contact me
- I want to report abusive messages so admins can take action

### As an Interested Candidate
- I want to receive messages from job posters about opportunities
- I want to reply to messages in a conversation thread
- I want to see all my conversations in one place
- I want to block and report users if needed

### As an Admin
- I want to see reported messages prominently so I can review and take action
- I want to see report details (reporter, reported, message content, reason)
- I want to be able to dismiss reports or take action (warn, ban)

## Features & Requirements

### 1. Conversations

#### Creating a Conversation
- Job poster can initiate conversation with any interested candidate from job detail page
- Members can initiate conversation from another member's profile (future)
- Cannot message blocked users or users who blocked you
- Cannot message yourself

#### Conversation Thread
- Shows all messages between two users
- Real-time updates (Convex reactivity)
- Messages show: sender name, message content, timestamp
- Visual distinction between sent (right) and received (left) messages
- Scroll to bottom on new messages

#### Data Model
```typescript
// Conversations table
{
  _id: Id<"conversations">,
  participants: [Id<"users">, Id<"users">], // Exactly 2 participants
  lastMessageAt: number, // For sorting
  createdAt: number,
}

// Messages table
{
  _id: Id<"messages">,
  conversationId: Id<"conversations">,
  senderId: Id<"users">,
  content: string, // Max 2000 chars
  readAt?: number, // When recipient read it
  createdAt: number,
}
```

### 2. Message Center

#### Navigation
- Add "Messages" icon to nav (envelope icon)
- Show notification badge with unread count (red dot with number)
- Badge shows total unread messages across all conversations

#### Inbox View (`/messages`)
- List of all conversations sorted by lastMessageAt (newest first)
- Each row shows:
  - Other participant's profile image and name
  - Preview of last message (first 50 chars)
  - Relative timestamp (2m ago, 1h ago, etc.)
  - Unread indicator (bold text, blue dot)
- Click row to open conversation
- Empty state: "No messages yet"

#### Conversation View (`/messages/:conversationId`)
- Header with other participant's name/image (link to profile)
- Message thread (scrollable)
- Input field at bottom with Send button
- "Back to Messages" link

### 3. Notifications Badge

#### Implementation
- Query for unread message count
- Display in nav as red badge on Messages icon
- Update in real-time when new messages arrive
- Clear badge when messages are read

#### Badge States
- No badge: 0 unread
- Red dot with number: 1-99 unread
- Red dot with "99+": 100+ unread

### 4. Block Feature

#### Blocking a User
- Block button on user's profile page
- Block option in conversation (menu dropdown)
- Confirmation: "Block [Name]? They won't be able to message you."

#### Block Behavior
- Blocked user cannot send you messages
- Existing conversation is hidden from blocked user
- You can still see the conversation (but marked as blocked)
- Blocked user cannot see your profile (future)

#### Unblocking
- View blocked users in Settings
- Unblock button restores normal access

#### Data Model
```typescript
// Blocks table
{
  _id: Id<"blocks">,
  blockerId: Id<"users">, // User who blocked
  blockedId: Id<"users">, // User who was blocked
  createdAt: number,
}
```

### 5. Report Feature

#### Reporting a Message
- Report button on message (flag icon in menu)
- Report form:
  - Reason (required): Harassment, Spam, Inappropriate content, Other
  - Additional details (optional, max 500 chars)
- Confirmation: "Report submitted. Our team will review."

#### Report Behavior
- Report is logged with full context
- Reporter can continue using the app normally
- No immediate action (admin review required)

#### Data Model
```typescript
// Reports table
{
  _id: Id<"reports">,
  reporterId: Id<"users">,
  reportedUserId: Id<"users">,
  messageId?: Id<"messages">, // If reporting a specific message
  reason: "harassment" | "spam" | "inappropriate" | "other",
  details?: string,
  status: "pending" | "reviewed" | "dismissed" | "action_taken",
  adminNotes?: string,
  reviewedAt?: number,
  reviewedBy?: Id<"users">,
  createdAt: number,
}
```

### 6. Admin Reports View

#### Reports Section on Admin Page
- Display at TOP of admin page in red/warning style
- Header: "Pending Reports (X)" with count
- Only show if there are pending reports

#### Report Card Display
- Red/orange warning styling to stand out
- Shows:
  - Reporter name and profile link
  - Reported user name and profile link
  - Reason badge (Harassment, Spam, etc.)
  - Reported message content (if applicable)
  - Additional details from reporter
  - Timestamp
- Action buttons:
  - "Dismiss" - marks as reviewed, no action
  - "Warn User" - sends warning, marks action taken
  - "Ban User" - bans reported user, marks action taken
  - "View Conversation" - opens full context

#### Report Status
- Pending (default) - needs review
- Reviewed - admin looked at it
- Dismissed - no action needed
- Action Taken - warning or ban issued

## UI/UX Specifications

### Navigation Badge
```
Messages (envelope icon)
  └─ [3] (red badge with count)
```

### Message Center Layout
```
┌─────────────────────────────────────┐
│ Messages                            │
├─────────────────────────────────────┤
│ ┌─────┐ John Doe                 2m │
│ │ img │ Hey, I saw your interest... │
│ └─────┘ ●                           │
├─────────────────────────────────────┤
│ ┌─────┐ Jane Smith               1h │
│ │ img │ Thanks for reaching out!    │
│ └─────┘                             │
└─────────────────────────────────────┘
```

### Conversation Layout
```
┌─────────────────────────────────────┐
│ ← Back   John Doe                 ⋮ │
├─────────────────────────────────────┤
│                                     │
│        ┌──────────────────┐        │
│        │ Hi! I saw you're │        │
│        │ interested in... │ 2:30pm │
│        └──────────────────┘        │
│                                     │
│ ┌──────────────────┐               │
│ │ Yes! I'd love to │               │
│ │ discuss further. │ 2:32pm       │
│ └──────────────────┘               │
│                                     │
├─────────────────────────────────────┤
│ [Type a message...          ] [Send]│
└─────────────────────────────────────┘
```

### Admin Reports Section
```
┌─────────────────────────────────────┐
│ ⚠️ PENDING REPORTS (3)              │
│ (red/orange background)             │
├─────────────────────────────────────┤
│ Reporter: @alice → Reported: @bob   │
│ Reason: [Harassment]                │
│ Message: "You're terrible at..."    │
│ Details: "This user has been..."    │
│ 2 hours ago                         │
│ [Dismiss] [Warn User] [Ban User]    │
├─────────────────────────────────────┤
│ (more reports...)                   │
└─────────────────────────────────────┘
```

## Technical Considerations

### Convex Schema Additions

```typescript
// schema.ts additions

conversations: defineTable({
  participants: v.array(v.id("users")), // Exactly 2
  lastMessageAt: v.number(),
  createdAt: v.number(),
})
  .index("by_participant", ["participants"])
  .index("by_lastMessageAt", ["lastMessageAt"]),

messages: defineTable({
  conversationId: v.id("conversations"),
  senderId: v.id("users"),
  content: v.string(),
  readAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_conversationId", ["conversationId"])
  .index("by_senderId", ["senderId"]),

blocks: defineTable({
  blockerId: v.id("users"),
  blockedId: v.id("users"),
  createdAt: v.number(),
})
  .index("by_blockerId", ["blockerId"])
  .index("by_blockedId", ["blockedId"])
  .index("by_blocker_blocked", ["blockerId", "blockedId"]),

reports: defineTable({
  reporterId: v.id("users"),
  reportedUserId: v.id("users"),
  messageId: v.optional(v.id("messages")),
  reason: v.union(
    v.literal("harassment"),
    v.literal("spam"),
    v.literal("inappropriate"),
    v.literal("other"),
  ),
  details: v.optional(v.string()),
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
```

### Key Queries

```typescript
// Get user's conversations with last message preview
getConversations(userId)

// Get messages in a conversation (paginated)
getMessages(conversationId, limit, cursor)

// Get unread message count for nav badge
getUnreadCount(userId)

// Get pending reports for admin
getPendingReports()
```

### Key Mutations

```typescript
// Send a message (creates conversation if needed)
sendMessage(recipientId, content)

// Mark messages as read
markConversationRead(conversationId)

// Block a user
blockUser(userId)

// Unblock a user
unblockUser(userId)

// Report a message/user
createReport(reportedUserId, messageId?, reason, details?)

// Admin: Review report
reviewReport(reportId, status, adminNotes?)
```

### Real-time Updates
- Use Convex reactive queries for:
  - Message list (auto-updates when new messages arrive)
  - Unread count badge
  - Conversation thread
- Optimistic updates for sending messages

### Permissions
- Users can only see their own conversations
- Users cannot message blocked/blocking users
- Only admin can see/action reports
- Cannot send empty messages

## Success Metrics

### Primary
- Messages sent per day
- Active conversations (messages in last 7 days)
- Response rate (% of conversations with replies)

### Secondary
- Block rate (% of users who block someone)
- Report rate (% of users who file reports)
- Report resolution time

### PostHog Events
- `message_sent` - User sends a message
- `conversation_started` - New conversation created
- `message_read` - User reads messages
- `user_blocked` - User blocks someone
- `user_unblocked` - User unblocks someone
- `report_submitted` - User reports content
- `report_reviewed` - Admin reviews report

## Future Enhancements

### Phase 2
- Group conversations (for event organizers)
- Message attachments (images)
- Message reactions (thumbs up, etc.)
- Typing indicators
- Read receipts

### Phase 3
- Push notifications
- Email notifications for unread messages
- Message search
- Archive conversations
- Mute notifications per conversation

## Open Questions

1. Should we allow messaging between any members, or only job-related contexts initially?
2. Should blocked users be notified they've been blocked?
3. Rate limiting on messages to prevent spam?
4. Message retention policy (how long to keep messages)?

## Timeline

- **Phase 1 (MVP)**: Core messaging, notifications, block, report, admin view
- **Phase 2**: Enhancements based on usage patterns
- **Phase 3**: Advanced features

## Approval

- [ ] Reviewed by product team
- [ ] Reviewed by engineering
- [ ] Reviewed by design
- [ ] Approved for development

---

**Document Version**: 1.0
**Last Updated**: 2026-01-27
**Author**: Claude (Product Planning)
**Status**: Draft
