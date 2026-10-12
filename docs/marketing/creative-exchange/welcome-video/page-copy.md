# Welcome page — copy

v1 · 2026-10-01 · pairs with `script.md`  
Long scroller: video at top, one section per beat. Opening section doubles as Patricia's welcome note.

Tone: half the words. One idea per line. Buttons use the app's verb.

---

## Opening (Patricia's welcome note)

**Headline:** Welcome in.

**Line:** You make things. Here's how to get them seen, staffed, and supported.

**Button:** Create account → `/` or sign-up

**Note body (email / in-app, optional):**

Hi — glad you're here.

Post one project when you're ready. Cheer someone on. When you become a member, you'll pick who gets your monthly grant.

Start at the video above, or tap Create account.

—

---

## Sections (scroll)

### Who this is for

**Headline:** The Garden

**Line:** The platform is open to any creative. The Garden is the Christian creative community on it, and it is where this started.

**Button:** none (or Explore Today → `/today`)

**Claim:** `CLAIMS.theGarden`

### Join

**Headline:** Joining is free.

**Line:** Create an account. Add one piece of work. Skip anything you're not ready for.

**Button:** Create account

**Claim:** `CLAIMS.join`

### Post

**Headline:** Put work on the wall.

**Line:** Tap + Post. Start a project, or hire someone for paid work.

**Button:** Start a project → `/projects` (opens + Post)

### Find your people

**Headline:** Find your people.

**Line:** Add the roles you need. Browse People. Send a message.

**Button:** Browse People → `/people`

### Support others

**Headline:** Support other people's work.

**Line:** Cheer them on is free. Back this when a project is raising. You keep 90% of what a backer gives you.

**Button:** Browse projects → `/projects`

**Claims:** `CLAIMS.backingShort` (fee detail: `CLAIMS.processingFee` in a footnote or info, not the main line)

### The grant fund

**Headline:** Ask the grant fund.

**Line:** Membership is $10 a month. Half of your membership funds grants for other creatives. Become a member, post a project, and propose it.

**Button:** Become a member → `/join` (fund CTA: Become a member and create a project → `/fund/:slug`)

**Claims:** `CLAIMS.membership`, `CLAIMS.dues`

### Your monthly grant

**Headline:** Your monthly grant.

**Line:** Each month you choose who gets your monthly grant: a creative, a project, or the grant fund. What you give goes to them in full.

**Button:** Give → `/give`

**Claims:** `CLAIMS.memberDirected`, `CLAIMS.memberDirectedFull`  
**Second line (small):** If you don't pick within a week, it goes to the grant fund. (`CLAIMS.memberDirectedDefault`)

### Show up

**Headline:** Show up.

**Line:** RSVP to an event, or host one.

**Button:** Host an event → `/events`

### Close

**Headline:** Your turn.

**Line:** Create an account. Or start a project.

**Button primary:** Create account  
**Button secondary:** Start a project

---

## Page chrome (recommendation)

- Video embeds from YouTube or Vimeo via `app/app/lib/videoEmbed.ts`. Do not store the file in the app.
- One composition: video first, then the sections above. No card grid of features.
- Living-room feel: next action always the section button.
