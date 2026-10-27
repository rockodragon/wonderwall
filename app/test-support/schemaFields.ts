// Which schema fields point at a table, read from convex/schema.ts itself,
// so a list kept by hand (admin/mergeUsers.ts USER_ID_FIELDS, admin/
// mergeOrganizations.ts ORG_ID_FIELDS) fails its test when the schema
// gains a field the list doesn't name.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** "table.field" for every top-level field of a table in schema.ts whose
 * validator names `v.id("<target>")`; a nested one (events.displayHosts'
 * `userId`) counts under its top-level field. Sorted. */
export function schemaFieldsPointingAt(target: string): string[] {
  const text = readFileSync(join(__dirname, "../convex/schema.ts"), "utf8");
  const out = new Set<string>();
  let table = "";
  let field = "";
  for (const line of text.split("\n")) {
    const t = /^ {2}(\w+): defineTable\(/.exec(line);
    if (t) {
      table = t[1];
      field = "";
      continue;
    }
    const f = /^ {4}(\w+):/.exec(line);
    if (f) field = f[1];
    if (table && field && line.includes(`v.id("${target}")`)) out.add(`${table}.${field}`);
  }
  return [...out].sort();
}
