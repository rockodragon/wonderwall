// One-time migration: drop the legacy `showcaseApplications.discipline`
// field (schema.ts). Same shape as waitlistHostFieldMigration.ts.
//
// The bespoke discipline enum was replaced by the canonical `interests`
// array. The field was removed from the schema on the assumption that no
// stored row carried it — the page had never launched publicly. That was
// wrong: smoke-test submissions are rows too, and Convex refuses to deploy
// a schema while any document has a field the validator doesn't allow.
// "Not launched" is not "no data."
//
// The old value is carried across rather than discarded. These particular
// rows are test data, but a migration that silently drops someone's answer
// is the wrong thing to have in the tree the next time one of these is
// needed — and mapping it costs nothing.
//
// Idempotent: rows without the old key are skipped, and an existing
// `interests` answer always wins over the legacy one.
//
// Deploy with schema validation temporarily off (see
// docs/runbooks/step-0-go-live.md, "Stale data"), then:
//   npx convex run garden/showcaseDisciplineMigration:migrateShowcaseDiscipline

import { internalMutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type LegacyShowcaseDoc = Doc<"showcaseApplications"> & { discipline?: string };

/** Old enum value -> the nearest canonical INTERESTS entry
    (app/constants/interests.ts). Anything unrecognized becomes "Other"
    rather than being dropped. */
const DISCIPLINE_TO_INTEREST: Record<string, string> = {
  apparel: "Craft",
  visual: "Art",
  music: "Music",
  photography: "Photography",
  film: "Filmmaking",
  writing: "Writing",
  spokenword: "Poetry",
  design: "Design",
  other: "Other",
};

export const migrateShowcaseDiscipline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = (await ctx.db
      .query("showcaseApplications")
      .collect()) as LegacyShowcaseDoc[];
    let migrated = 0;
    for (const row of rows) {
      if (row.discipline === undefined) continue;
      const carried = DISCIPLINE_TO_INTEREST[row.discipline] ?? "Other";
      await ctx.db.patch(row._id, {
        // An answer the applicant gave on the new field is the better
        // answer; only fill in from the legacy one when there is nothing.
        interests: row.interests?.length ? row.interests : [carried],
        discipline: undefined,
      } as Partial<Doc<"showcaseApplications">> & { discipline: undefined });
      migrated++;
    }
    return { migrated, skipped: rows.length - migrated, total: rows.length };
  },
});
