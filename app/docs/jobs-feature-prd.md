# Jobs Feature - Product Requirements Document

## Overview

The Jobs feature enables Wonderwall members to post and discover creative opportunities within the Kingdom-minded creative community. Job posters can share opportunities and receive interest from qualified creatives, while members can express interest and showcase relevant work.

## Goals

1. **Create economic opportunities** for Kingdom-minded creatives
2. **Build community value** by connecting talent with opportunities
3. **Maintain quality** through member-only visibility controls
4. **Encourage authentic connections** between posters and interested candidates

## User Stories

### As a Job Poster
- I want to post a job opportunity so that I can find Kingdom-minded creatives
- I want to control visibility (private/members) so I can manage who sees my posting
- I want to see who's interested and their relevant work so I can evaluate candidates
- I want to mark jobs as closed when filled so the listing is no longer active
- I want minimal friction in posting so I can quickly share opportunities

### As a Job Seeker
- I want to browse available jobs so I can find opportunities
- I want to express interest in a job so posters know I'm available
- I want to include a note with my interest so I can personalize my application
- I want to link relevant works so posters can see my capabilities
- I want to filter for open jobs so I don't waste time on closed positions

## Features & Requirements

### 1. Job Posting

#### Required Fields
- **Title** (string, max 100 chars) - Job title or role name
- **Description** (rich text, max 5000 chars) - Detailed job description
- **Location** (enum: Remote, Hybrid, On-site)
  - If On-site or Hybrid: City, State/Country (string)
- **Job Type** (enum: Full-time, Part-time, Contract, Freelance)
- **Visibility** (enum: Private, Members Only)
  - Private: Only poster can see
  - Members Only: All authenticated members can see

#### Optional Fields
- **Compensation Range** (string) - e.g., "$50k-$70k" or "Negotiable"
- **External Link** (URL) - Link to full posting or application page
- **Creative Disciplines** (multi-select) - Same job functions from profiles (Designer, Writer, Musician, etc.)
- **Experience Level** (enum: Entry, Mid, Senior, Any)

#### Behavior
- Auto-save draft capability
- Creator is automatically the poster
- Posted date auto-generated
- Status defaults to "Open"
- Can be edited after posting (with "Last updated" timestamp)

### 2. Job Interest

#### Expressing Interest
- Members can click "I'm Interested" button on any Members-visible job
- Interest form includes:
  - **Optional Note** (text, max 500 chars) - Personal message to poster
  - **Work Links** (up to 3) - Select from user's posted works/artifacts
  - **Submit** saves the interest record

#### Interest Display
- **For All Members**: Shows total interest count (e.g., "12 people interested")
- **For Poster Only**: Shows full list of interested members with:
  - Profile name and image
  - Job functions
  - Optional note
  - Linked works (clickable to view)
  - Date of interest

#### Behavior
- One interest per member per job
- Can update note/works after initial interest
- Can withdraw interest (removes from list)
- Interest count updates in real-time

### 3. Jobs Index

#### Views
- **Main Feed**: Lists all jobs (open and closed) by default
- **Open Only Filter**: Toggle to show only open jobs
- **My Posts**: Filter to show only jobs I posted
- **My Interests**: Filter to show jobs I've expressed interest in

#### Job Card Display
Each job card shows:
- Job title
- Poster name and profile image
- Location and job type
- Posted date (or "Updated X days ago")
- Interest count
- Status badge (Open/Closed)
- Preview of description (first 200 chars)

#### Sorting
- Default: Most recent first
- Alternative: Most interested

### 4. Job Detail Page

#### For All Members
- Full job description (rich text formatting)
- All job metadata (location, type, compensation, etc.)
- Poster profile info (name, image, job functions)
- Interest count
- "I'm Interested" button (or "You're interested" if already expressed)
- External link (if provided)

#### For Poster Only
- Everything above, plus:
- List of interested members (with notes and work links)
- "Mark as Closed" button
- "Edit Job" button
- Analytics: views count (future)

### 5. Job Status Management

#### Closing a Job
- Poster clicks "Mark as Closed"
- Confirmation modal: "Are you sure? This will hide the job from the main feed."
- Job status changes to "Closed"
- Job moves to closed section (visible with filter)
- New interests are disabled
- Existing interests remain visible to poster

#### Reopening (Optional)
- Poster can reopen a closed job
- Status changes back to "Open"
- Interests re-enabled

## Data Model

### Jobs Table

```typescript
{
  _id: Id<"jobs">,
  posterId: Id<"users">,
  profileId: Id<"profiles">, // Poster's profile

  // Required fields
  title: string,
  description: string, // Rich text
  location: "Remote" | "Hybrid" | "On-site",
  city?: string, // Required if not Remote
  state?: string, // Required if not Remote
  country?: string, // Required if not Remote
  jobType: "Full-time" | "Part-time" | "Contract" | "Freelance",
  visibility: "Private" | "Members",

  // Optional fields
  compensationRange?: string,
  externalLink?: string,
  disciplines?: string[], // Job functions
  experienceLevel?: "Entry" | "Mid" | "Senior" | "Any",

  // Metadata
  status: "Open" | "Closed",
  postedAt: number, // _creationTime
  updatedAt?: number,
  viewCount?: number, // Future
}
```

### Job Interests Table

```typescript
{
  _id: Id<"jobInterests">,
  jobId: Id<"jobs">,
  userId: Id<"users">,
  profileId: Id<"profiles">,

  note?: string, // Max 500 chars
  workLinks: Id<"artifacts">[], // Max 3

  createdAt: number, // _creationTime
  updatedAt?: number,
}
```

### Indexes

```javascript
// schema.ts
jobs: defineTable({
  // ... fields
})
  .index("by_posterId", ["posterId"])
  .index("by_status", ["status"])
  .index("by_visibility", ["visibility"])
  .index("by_status_and_visibility", ["status", "visibility"]),

jobInterests: defineTable({
  // ... fields
})
  .index("by_jobId", ["jobId"])
  .index("by_userId", ["userId"])
  .index("by_job_and_user", ["jobId", "userId"]), // Unique constraint
```

## UI/UX Specifications

### Navigation
- Add "Jobs" to main navigation menu
- Icon: briefcase or work bag icon
- Badge showing new jobs count (optional)

### Jobs Index Page (`/jobs`)
- Header with "Jobs" title
- "Post a Job" button (prominent, top-right)
- Filter toggles:
  - [ ] Open Only
  - [ ] My Posts
  - [ ] My Interests
- Grid or list view of job cards
- Infinite scroll or pagination

### Post Job Page (`/jobs/new`)
- Clean form layout
- Required field indicators
- Location conditional fields (show city/state only if not Remote)
- Rich text editor for description
- "Save Draft" and "Post Job" buttons
- Preview mode toggle

### Job Detail Page (`/jobs/:id`)
- Hero section with title and metadata
- Poster card (left sidebar or top)
- Description (main content area)
- Interest section:
  - Interest count badge
  - "I'm Interested" button (primary CTA)
  - For poster: List of interested members (cards or table)
- Action buttons (Edit/Close) for poster

### Interest Modal
- Triggered by "I'm Interested" button
- Form with:
  - Textarea for note (optional)
  - Work selector (multi-select, max 3)
  - Preview of selected works
  - "Submit Interest" button
- Confirmation message on submit

### Design Tokens
- Use existing Wonderwall design system
- Job cards: Similar to work/wondering cards
- Status badges:
  - Open: Green/blue gradient
  - Closed: Gray
- Interest count: Badge with count, similar to favorite count

## Technical Considerations

### Permissions
- **Read Jobs**: All authenticated members can read Members-visible jobs
- **Create Jobs**: All authenticated members can post
- **Update Jobs**: Only poster can edit/close their jobs
- **Read Interests**:
  - All members see count only
  - Poster sees full interest details
- **Create Interest**: Authenticated members on non-private, open jobs
- **Delete Interest**: User can withdraw their own interest

### Convex Queries

```typescript
// Get all jobs (with filters)
export const getJobs = query({
  args: {
    statusFilter?: v.optional(v.union(v.literal("Open"), v.literal("Closed"))),
    myPosts?: v.optional(v.boolean()),
    myInterests?: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Implementation
  },
});

// Get single job with poster profile
export const getJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    // Implementation
  },
});

// Get interests for a job (full details for poster, count for others)
export const getJobInterests = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    // Check if current user is poster
    // Return appropriate data
  },
});

// Get user's interest for a job
export const getUserJobInterest = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    // Return current user's interest if exists
  },
});
```

### Convex Mutations

```typescript
// Create job
export const createJob = mutation({
  args: { /* job fields */ },
  handler: async (ctx, args) => {
    // Validate and create
  },
});

// Update job
export const updateJob = mutation({
  args: { jobId: v.id("jobs"), /* fields */ },
  handler: async (ctx, args) => {
    // Check poster permission
    // Update
  },
});

// Close job
export const closeJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    // Check poster permission
    // Set status to Closed
  },
});

// Express interest
export const expressInterest = mutation({
  args: {
    jobId: v.id("jobs"),
    note?: v.optional(v.string()),
    workLinks: v.array(v.id("artifacts")),
  },
  handler: async (ctx, args) => {
    // Validate job is open and visible
    // Upsert interest
  },
});

// Withdraw interest
export const withdrawInterest = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    // Delete user's interest
  },
});
```

### Real-time Updates
- Interest count updates live when new members express interest
- Status changes reflect immediately
- Use Convex reactive queries for auto-updates

### Validation
- Rich text sanitization for description
- URL validation for external links
- Max length enforcement on all text fields
- Work links must belong to the user expressing interest

## Success Metrics

### Primary Metrics
- **Jobs Posted**: Count of total jobs created
- **Open Jobs**: Count of currently open positions
- **Interest Rate**: Average interests per job
- **Poster Engagement**: % of posters who view interest details

### Secondary Metrics
- **Time to First Interest**: Average time from job post to first interest
- **Closure Rate**: % of jobs marked as closed
- **Member Participation**: % of members who've posted or expressed interest

### Analytics Events (PostHog)
- `job_posted` - When user creates a job
- `job_viewed` - When user views job detail
- `interest_expressed` - When user expresses interest
- `interest_withdrawn` - When user withdraws interest
- `job_closed` - When poster closes a job
- `job_edited` - When poster edits a job

## Future Enhancements

### Phase 2
- **Direct Messaging**: Contact interested candidates directly
- **Application Status**: Poster can mark candidates as "Reviewing," "Interviewed," "Hired"
- **Email Notifications**: Notify poster when someone expresses interest
- **Saved Jobs**: Members can save jobs for later
- **Job Alerts**: Subscribe to new jobs matching criteria

### Phase 3
- **Featured Jobs**: Paid promotion for job posts
- **Company Profiles**: Organizations can create profiles and post jobs
- **Advanced Filters**: Filter by discipline, experience, compensation, location
- **Search**: Full-text search across job titles and descriptions
- **Analytics Dashboard**: For posters to see views, interest trends

### Phase 4
- **Job Recommendations**: AI-suggested jobs based on profile
- **Skills Matching**: Auto-suggest members to posters based on skills
- **Integration**: Connect with external job boards
- **Referral System**: Members can refer other members for jobs

## Open Questions

1. **Moderation**: Should jobs require approval before going live?
2. **Spam Prevention**: Rate limits on job posting?
3. **Data Retention**: How long to keep closed jobs visible?
4. **External Applications**: If external link provided, should we still collect interests or just show link?
5. **Mobile**: Any mobile-specific considerations for posting/browsing?

## Timeline Estimate

- **Phase 1 (MVP)**: 2-3 weeks
  - Week 1: Data model, backend queries/mutations
  - Week 2: Core UI (index, detail, post form)
  - Week 3: Interest flow, testing, polish
- **Phase 2**: 1-2 weeks
- **Phase 3**: 2-3 weeks
- **Phase 4**: Ongoing

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
