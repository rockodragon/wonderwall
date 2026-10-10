# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

# Reuse before you write (HARD RULE)

On 2026-10-10 a review found the same rule written over and over: 117 copies
of "load this person's profile", two sign-in calls, six shapes of "not signed
in", 16 error readers, ~15 admin functions left public. Several copies had
drifted into real bugs. Most were written by agent sessions copying the
nearest pattern instead of finding the shared one. Never again:

1. **Search first.** Before writing any check, lookup, formatter, error
   reader, notification, image URL or UI bit, grep for an existing helper
   (`rg "function require|export function|export const use" app/convex app/app/lib app/app/components`)
   and use it. If you find two copies and no helper, extract the helper
   before adding a third. Never paste a third copy.
2. **Use the shared helpers:**
   - Who may change an event: `requireEventHost` / `hostOf` (app/convex/eventHosts.ts)
   - Owns a project/class: `requireOwner` · on own profile: `requireOwnProfileRow` · operator/admin: `requireOperator`, `requireAdminCtx`, `isAdmin` (app/convex/helpers.ts)
   - Pictures: `storedOrExternalUrl`, `profileImageUrl`, `projectPhotoUrl`, `eventCoverUrl`, `orgLogoUrl` (app/convex/images.ts)
   - Communities: `resolveCommunities`, `getCommunityMember`, `activeCommunityMemberships`, `COMMUNITY_KIND` (app/convex/garden/communityLookup.ts)
   - Blocks: `blockedUserIds`, `assertNotBlocked`, `findConversation` (app/convex/blocks.ts)
   - Server errors on a page: `errorMessage(err, fallback)`, `isNotSignedIn` (app/app/lib/convexError.ts)
   - Message someone: `useStartConversation` · admin pages: `useIsAdmin` · faces: `PersonAvatar`, `OrgLogo`
3. **Errors a person sees** are `ConvexError({ code, reason })` with a readable reason. Production hides a plain `Error`'s message.
4. **Every public `mutation`/`query` checks who's calling.** Operator-only code is `internalMutation`/`internalQuery`.
5. **The drift guard enforces this.** `app/test-support/driftGuard.test.ts` fails when an inline copy of a shared rule is added, and names the helper to use. Don't raise a limit to get past it; use the helper. When you remove copies, lower the limit.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

