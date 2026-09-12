// One-time migration: rename the `waitlist.wantsToHost` DB field to
// `waitlist.interestedInHosting` (schema.ts). Same shape as
// profileInterestsFieldMigration.ts — rows written before the rename still
// carry the old key, and Convex schema validation refuses to deploy while
// any row does. Idempotent: rows without the old key are skipped.
//
// Deploy with schema validation temporarily off (see
// docs/runbooks/step-0-go-live.md, "Stale data"), then:
//   npx convex run garden/waitlistHostFieldMigration:migrateWaitlistHostField

import { internalMutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type LegacyWaitlistDoc = Doc<"waitlist"> & { wantsToHost?: boolean };

export const migrateWaitlistHostField = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = (await ctx.db.query("waitlist").collect()) as LegacyWaitlistDoc[];
    let migrated = 0;
    for (const row of rows) {
      if (row.wantsToHost === undefined) continue;
      await ctx.db.patch(row._id, {
        interestedInHosting: row.interestedInHosting ?? row.wantsToHost,
        wantsToHost: undefined,
      } as Partial<Doc<"waitlist">> & { wantsToHost: undefined });
      migrated++;
    }
    return { migrated, skipped: rows.length - migrated, total: rows.length };
  },
});
