// One-time migration: role-noun JOB_FUNCTIONS values -> topic-noun INTERESTS
// values (docs/the-exchange-v1-prd.md-adjacent product decision — "is a
// Photographer" reframed as "interested in Photography" so the same word
// works for a person, a project, and a class). Walks every `profiles` row
// and remaps both `interests` and `supportInterests` — the two fields
// that drew their picker options from the old JOB_FUNCTIONS list (see
// app/constants/jobFunctions.ts for the full old list, app/constants/
// interests.ts for the new one). Idempotent by construction: a value not
// found in the old->new map (already a new value, or anything unrecognized)
// passes through unchanged, so running this again after values are already
// migrated is a no-op — same "safe to run more than once" contract as
// jobsMigration.ts, just without needing a foreign-key guard since there's
// no new row being inserted here, only existing rows being remapped in
// place.
//
// Nothing to migrate on `projects` or the legacy `jobs` table: projects.
// interests didn't exist before this change (see garden/projects.ts), so
// there's no prior data in it to remap — new projects just start populating
// it going forward. The legacy `jobs.disciplines` field is a separate,
// still-JOB_FUNCTIONS-flavored axis on a table that's already frozen
// (jobsMigration.ts copies `jobs` rows into `projects` once; it doesn't stay
// live) and out of scope for this pass.

import { internalMutation } from "../_generated/server";

// ——— Pure core ———

/** Old role-noun JOB_FUNCTIONS value -> new topic-noun INTERESTS value.
 * "Producer" and "Roadie" both collapse into "Production" — the only
 * many-to-one case in this table; every other entry is a 1:1 rename. */
export const OLD_TO_NEW_INTEREST: Record<string, string> = {
  Designer: "Design",
  Illustrator: "Illustration",
  Animator: "Animation",
  Photographer: "Photography",
  Videographer: "Videography",
  Filmmaker: "Filmmaking",
  Writer: "Writing",
  Poet: "Poetry",
  Artist: "Art",
  Craftsman: "Craft",
  Musician: "Music",
  Dancer: "Dance & Movement",
  Actor: "Acting",
  "Worship Leader": "Worship",
  Producer: "Production",
  "Sound Engineer": "Audio",
  Developer: "Technology",
  "Content Creator": "Content Creation",
  Pastor: "Ministry",
  Leader: "Leadership",
  Teacher: "Teaching",
  Speaker: "Public Speaking",
  Entrepreneur: "Entrepreneurship",
  Marketer: "Marketing",
  "Product Manager": "Product Management",
  Roadie: "Production",
  Other: "Other",
};

/** True if any value in the list is an old role-noun value still awaiting
 * remap — used to count "before" state without mutating anything. */
export function hasOldInterests(values: string[] | undefined): boolean {
  if (!values) return false;
  return values.some((v) => v in OLD_TO_NEW_INTEREST && OLD_TO_NEW_INTEREST[v] !== v);
}

/** Remaps a list of old role-noun values to the new topic-noun INTERESTS
 * vocabulary, deduping after mapping (two old values — e.g. "Producer" and
 * "Roadie" — can collapse into one new value; a profile that had both should
 * end up with just one "Production" entry, not two). A value not in the old
 * map (already a new value, or anything unrecognized) passes through
 * unchanged, which is what makes this idempotent. Order is preserved for
 * unchanged lists; a changed list keeps first-occurrence order after dedup. */
export function remapInterests(values: string[] | undefined): string[] | undefined {
  if (!values) return values;
  const mapped = values.map((v) => OLD_TO_NEW_INTEREST[v] ?? v);
  return Array.from(new Set(mapped));
}

function sameList(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

// ——— Runner (operator-invoked once from the dashboard/CLI, idempotent) ———
// npx convex run garden/interestsMigration:migrateInterests --prod

export const migrateInterests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();

    // "Before" counts — profiles still carrying at least one old-vocabulary
    // value, computed ahead of any patching so a re-run's report is honest
    // about how much (if anything) was actually left to do.
    let profilesWithOldInterests = 0;
    let profilesWithOldSupportInterests = 0;
    for (const profile of profiles) {
      if (hasOldInterests(profile.interests)) profilesWithOldInterests++;
      if (hasOldInterests(profile.supportInterests)) profilesWithOldSupportInterests++;
    }

    let interestsUpdated = 0;
    let supportInterestsUpdated = 0;
    let profilesTouched = 0;

    for (const profile of profiles) {
      const patch: Record<string, unknown> = {};

      const newInterests = remapInterests(profile.interests);
      if (!sameList(newInterests, profile.interests)) {
        patch.interests = newInterests;
        interestsUpdated++;
      }

      const newSupportInterests = remapInterests(profile.supportInterests);
      if (!sameList(newSupportInterests, profile.supportInterests)) {
        patch.supportInterests = newSupportInterests;
        supportInterestsUpdated++;
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(profile._id, patch);
        profilesTouched++;
      }
    }

    return {
      totalProfiles: profiles.length,
      before: {
        profilesWithOldInterests,
        profilesWithOldSupportInterests,
      },
      after: {
        interestsUpdated,
        supportInterestsUpdated,
        profilesTouched,
        profilesUnchanged: profiles.length - profilesTouched,
      },
    };
  },
});
