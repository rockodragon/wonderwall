<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **wonderwall** (4034 symbols, 7435 relationships, 288 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/wonderwall/context` | Codebase overview, check index freshness |
| `gitnexus://repo/wonderwall/clusters` | All functional areas |
| `gitnexus://repo/wonderwall/processes` | All execution flows |
| `gitnexus://repo/wonderwall/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

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
