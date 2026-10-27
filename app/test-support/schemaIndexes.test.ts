// Convex refuses a deploy whose schema names an index twice on one table
// (IndexNamesNotUnique), but defineTable accepts it, so nothing else here
// would notice: #130 and #133 each added invites.by_usedBy, both merged, and
// the tests passed while production stopped deploying (2026-10-27).

import { describe, expect, it } from "vitest";
import schema from "../convex/schema";

type Indexes = { " indexes"(): { indexDescriptor: string }[] };

describe("the schema", () => {
  it("names each index once per table", () => {
    const repeated: string[] = [];
    for (const [table, def] of Object.entries(schema.tables as unknown as Record<string, Indexes>)) {
      const names = def[" indexes"]().map((i) => i.indexDescriptor);
      for (const name of new Set(names)) {
        if (names.filter((n) => n === name).length > 1) repeated.push(`${table}.${name}`);
      }
    }
    expect(repeated).toEqual([]);
  });
});
