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
    limit: 0,
    home: "convex/helpers.ts",
    use: "getProfileByUserId / displayNameOf in convex/helpers.ts",
  },
  {
    name: "deprecated auth.getUserId",
    pattern: /\bauth\.getUserId\(/g,
    limit: 0,
    home: "convex/helpers.ts",
    use: "requireUserId (signed out is refused) / currentUserId (signed out sees nothing) in convex/helpers.ts, or requireEventHost / requireOwner / requireOperator",
  },
  {
    name: 'plain Error("Not authenticated") (production hides it from the page)',
    pattern: /throw new Error\(\s*"Not authenticated"\s*\)/g,
    limit: 0,
    home: "convex/helpers.ts",
    use: "requireUserId in convex/helpers.ts, or fail(code, reason) in convex/errors.ts",
  },
  {
    name: "notification inserted directly",
    pattern: /\.insert\(\s*"notifications"/g,
    limit: 0,
    home: "convex/notify.ts",
    use: "insertNotification in convex/notify.ts (its `email` option sends the email too)",
  },
  {
    name: "own profile required by hand (one place)",
    pattern: /"no_profile"/g,
    limit: 0,
    home: "convex/helpers.ts",
    use: "requireProfile(ctx, userId) in convex/helpers.ts",
  },
  {
    name: "storage.getUrl outside images.ts",
    pattern: /storage\.getUrl\(/g,
    limit: 2,
    home: "convex/images.ts",
    use: "storedFileUrl / storedOrExternalUrl / profileImageUrl / projectPhotoUrl / eventCoverUrl / orgLogoUrl in convex/images.ts (they serve files through our own domain when MEDIA_BASE_URL is set)",
  },
  {
    name: "inline profile.isAdmin check",
    pattern: /profile\??\.isAdmin\b/g,
    limit: 21,
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
    name: "money formatted inline",
    // Also the hand-written shapes: `$${n.toLocaleString(`, a JSX `${n.toLocaleString(`
    // on a line with no template string, and `(cents / 100).toLocaleString(` / `.toFixed(`.
    pattern:
      /minimumFractionDigits|style:\s*"currency"|\$\$\{[^}`]*toLocaleString|^[^`\n]*\$\{[^}`\n]*toLocaleString|\/ 100\)\.(?:toLocaleString|toFixed)/gm,
    // Left on purpose: fixed whole-dollar caps in error reasons (stripe, stripeHandlers,
    // grantProposals), form-field and log values, and the demo pages.
    limit: 10,
    home: "convex/money.ts",
    use: "formatCents / formatDollars in convex/money.ts (formatMoney in app/garden/ui.tsx is the same one)",
  },
  {
    name: "server error shown raw on a page",
    pattern: /(?:set[A-Z]\w*|alert)\(\s*\w+ instanceof Error\s*\?\s*\w+\.message/g,
    limit: 0,
    use: "errorMessage(err, fallback) in app/lib/convexError.ts — err.message is \"[CONVEX M(...)] Server Error\" in production",
  },
  {
    name: "server error text scraped by hand",
    pattern: /Uncaught Error: /g,
    limit: 0,
    use: "errorMessage(err, fallback) in app/lib/convexError.ts, and a ConvexError reason (fail in convex/errors.ts) on the server",
  },
  {
    name: "file uploaded to storage by hand (one place)",
    // A hand-rolled POST skips the location strip (app/lib/imageLocation.ts).
    pattern: /await generateUploadUrl\(\)/g,
    limit: 0,
    home: "app/lib/uploadFile.ts",
    use: "uploadToStorage(generateUploadUrl, file) in app/lib/uploadFile.ts — it removes where a photo was taken before the upload",
  },
  {
    name: "upload size cap written inline",
    pattern: /\d+\s*\*\s*1024\s*\*\s*1024/g,
    // Left on purpose: useCoverPick takes bigger pictures because it shrinks
    // them first, and convex/linkPreview.ts caps the preview image it fetches
    // for a pasted link.
    limit: 2,
    home: "app/lib/useFileUpload.ts",
    use: "useFileUpload in app/lib/useFileUpload.ts (it checks the size), or MAX_UPLOAD_BYTES / maxSize there for a hint",
  },
  {
    name: "upload problem shown in alert()",
    // alert() is poor on phones. Matches an alert that talks about a file.
    pattern: /\balert\([^)]*?(?:\b(?:upload\w*|images?|files?|photos?|pictures?|logos?)\b|\d\s*MB\b)/gi,
    limit: 0,
    use: "useFileUpload in app/lib/useFileUpload.ts — show its `error` next to the picker",
  },
  {
    name: "paid membership status checked inline",
    // products.ts's ["paid", "active", "past_due"] is a purchase's status,
    // not a seat's, and doesn't match.
    pattern: /new Set\(\[\s*"active",\s*"past_due"\s*\]\)|status === "active" \|\| \w+\.status === "past_due"/g,
    // Left: garden/memberships.ts and garden/reports.ts keep their own set.
    limit: 2,
    home: "convex/garden/entitlements.ts",
    use: "isEntitledMembership / hasPaidMembership in convex/garden/entitlements.ts",
  },
  {
    name: "avatar initial drawn by hand",
    pattern: /charAt\(0\)\.toUpperCase\(\)/g,
    limit: 8,
    home: "app/components/PersonAvatar.tsx",
    use: "PersonAvatar (people) or OrgLogo (organizations) in app/components",
  },
  {
    name: '"3d ago" written inline',
    pattern: /\}\s?(?:m|h|d|w|mo|y|minutes?|hours?|days?|weeks?|months?|years?) ago\b/g,
    limit: 2,
    home: "app/lib/dates.ts",
    use: "timeAgo in app/lib/dates.ts",
  },
  {
    name: "placeholder name checked inline (one place)",
    // The copies had drifted: some missed a blank name, some a different case.
    pattern: /["'`]new user["'`]|\/\^?new user|[!=]==?\s*PLACEHOLDER_NAME\b|\bPLACEHOLDER_NAME\s*[!=]==?/gi,
    limit: 0,
    home: "convex/names.ts",
    use: "hasRealName / PLACEHOLDER_NAME in convex/names.ts",
  },
  {
    name: "project shown-or-not checked inline (one place)",
    pattern: /status\s*!==\s*"archived"\s*&&\s*!isHidden\(/g,
    limit: 0,
    home: "convex/moderationRules.ts",
    use: "isShownProject in convex/moderationRules.ts",
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
