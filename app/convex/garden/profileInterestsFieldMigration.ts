// One-time migration: rename the `profiles.jobFunctions` DB field to
// `profiles.interests` (schema.ts). This is a pure field-name move — the
// VALUES were already remapped role-noun -> topic-noun in production by
// garden/interestsMigration.ts (see that file's OLD_TO_NEW_INTEREST table);
// this migration doesn't touch values at all, it only relocates whatever
// value is already sitting under the old key to the new one and removes the
// old key. Idempotent by key presence: a profile with no `jobFunctions` key
// left (already migrated, or created after the schema rename) is a no-op —
// same "safe to run more than once" contract as jobsMigration.ts /
// interestsMigration.ts.

import { internalMutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

// ——— Pure core ———

// The generated `Doc<"profiles">` type reflects the CURRENT schema, which no
// longer declares `jobFunctions` — but a not-yet-migrated row can still carry
// it on disk. Read it through this loosely-typed alias instead of `any`.
type LegacyProfileDoc = Doc<"profiles"> & { jobFunctions?: string[] };

/** True if a raw profile row still has the old `jobFunctions` key present
 * (regardless of value — even `[]` counts, since the key itself is what's
 * being retired). Used both to decide whether to patch and to report
 * "before" counts without mutating anything. */
export function hasLegacyJobFunctionsKey(profile: LegacyProfileDoc): boolean {
  return profile.jobFunctions !== undefined;
}

// ——— Runner (operator-invoked once from the dashboard/CLI, idempotent) ———
// npx convex run garden/profileInterestsFieldMigration:migrateProfileInterestsField --prod

export const migrateProfileInterestsField = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = (await ctx.db.query("profiles").collect()) as LegacyProfileDoc[];

    let migrated = 0;
    let skipped = 0;

    for (const profile of profiles) {
      if (!hasLegacyJobFunctionsKey(profile)) {
        skipped++;
        continue;
      }
      await ctx.db.patch(profile._id, {
        interests: profile.jobFunctions,
        // Patching a field to `undefined` removes it from the document.
        jobFunctions: undefined,
      } as Partial<Doc<"profiles">> & { jobFunctions: undefined });
      migrated++;
    }

    return { migrated, skipped, total: profiles.length };
  },
});
