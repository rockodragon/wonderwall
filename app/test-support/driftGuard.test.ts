// The drift guard (Rick, 2026-10-10: "add a rule ... check for existing
// code"). A review that day found the same rule written over and over —
// 117 profile lookups, two sign-in calls, six shapes of "not signed in",
// 16 error readers — and several copies had drifted into bugs (uploaded
// avatars missing, server messages dropped, admin functions left public).
//
// Each pattern below has a shared helper. The limit is how many inline
// copies are left today; it only goes down:
//   - add a copy and this fails: use the helper instead;
//   - remove copies and this fails too: lower the limit to the new count,
//     so the copies can't creep back.
// Patterns marked "one place" may appear only in the helper's own file.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "_generated" || name === "node_modules" ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const FILES = [...sourceFiles(join(ROOT, "convex")), ...sourceFiles(join(ROOT, "app"))].map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));

type Rule = {
  name: string;
  pattern: RegExp;
  /** Inline copies allowed today, outside `home`. */
  limit: number;
  /** The helper's own file, where the pattern belongs. */
  home?: string;
  use: string;
};

const RULES: Rule[] = [
  {
    name: "profile looked up by userId inline",
    pattern: /query\(\s*"profiles"\s*\)\s*\.withIndex\(\s*"by_userId"/g,
    limit: 115,
    home: "convex/helpers.ts",
    use: "a shared profile lookup in convex/helpers.ts (one is coming; until then copy nothing new)",
  },
  {
    name: "deprecated auth.getUserId",
    pattern: /\bauth\.getUserId\(/g,
    limit: 109,
    home: "convex/helpers.ts",
    use: 'getAuthUserId from "@convex-dev/auth/server", or requireEventHost / requireOwner / requireOperator in convex/helpers.ts and convex/eventHosts.ts',
  },
  {
    name: 'plain Error("Not authenticated") (production hides it from the page)',
    pattern: /throw new Error\(\s*"Not authenticated"\s*\)/g,
    limit: 43,
    home: "convex/helpers.ts",
    use: 'ConvexError({ code: "unauthenticated", reason: "Sign in first." }) or a require* helper',
  },
  {
    name: "notification inserted directly",
    pattern: /\.insert\(\s*"notifications"/g,
    limit: 25,
    use: "an existing notify helper near your code (a shared one is coming); copy nothing new",
  },
  {
    name: "storage.getUrl outside images.ts",
    pattern: /storage\.getUrl\(/g,
    limit: 15,
    home: "convex/images.ts",
    use: "storedOrExternalUrl / profileImageUrl / projectPhotoUrl / eventCoverUrl / orgLogoUrl in convex/images.ts",
  },
  {
    name: "inline profile.isAdmin check",
    pattern: /profile\??\.isAdmin\b/g,
    limit: 24,
    home: "convex/helpers.ts",
    use: "isAdmin / isAdminProfile / requireOperator / requireAdminCtx in convex/helpers.ts, or useIsAdmin in app/lib",
  },
  {
    name: "server error read by hand (one place)",
    pattern: /"reason" in /g,
    limit: 0,
    home: "app/lib/convexError.ts",
    use: "errorMessage(err, fallback) / errorCode / isNotSignedIn in app/lib/convexError.ts",
  },
  {
    name: "conversation started by hand (one place)",
    pattern: /api\.messaging\.getOrCreateConversation/g,
    limit: 0,
    home: "app/lib/useStartConversation.ts",
    use: "useStartConversation in app/lib/useStartConversation.ts",
  },
  {
    name: "avatar initial drawn by hand",
    pattern: /charAt\(0\)\.toUpperCase\(\)/g,
    limit: 23,
    home: "app/components/PersonAvatar.tsx",
    use: "PersonAvatar (people) or OrgLogo (organizations) in app/components",
  },
];

describe("drift guard: no new copies of a shared rule", () => {
  for (const rule of RULES) {
    it(rule.name, () => {
      const where = FILES.filter((f) => f.path !== rule.home)
        .map((f) => ({ path: f.path, n: (f.text.match(rule.pattern) ?? []).length }))
        .filter((f) => f.n > 0);
      const count = where.reduce((sum, f) => sum + f.n, 0);
      const list = where.map((f) => `  ${f.path} (${f.n})`).join("\n");
      expect(
        count,
        count > rule.limit
          ? `${count} inline copies of "${rule.name}" — the limit is ${rule.limit}. Use ${rule.use}.\n${list}`
          : `${count} copies left of "${rule.name}" — lower its limit in test-support/driftGuard.test.ts from ${rule.limit} to ${count}.`,
      ).toBe(rule.limit);
    });
  }
});
