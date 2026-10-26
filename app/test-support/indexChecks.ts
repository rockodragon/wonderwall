// A fake ctx (convexContext.ts makeCtx) whose reads are checked against the
// real schema, as shortlist.test.ts checks its own: every withIndex must name
// an index the table has, and its eq()s must walk that index's fields in
// order. A read with no index at all is allowed but written down in `scans`
// (one table name per read), so a test can pin which tables a query reads
// whole and catch a new unindexed read.

import schema from "../convex/schema";

type Indexes = { " indexes"(): { indexDescriptor: string; fields: string[] }[] };

/** The fields of a real schema index, or a throw: a typo'd or missing index
 * fails the test rather than a deployment. */
export function indexFields(table: string, index: string): string[] {
  const tables = schema.tables as unknown as Record<string, Indexes | undefined>;
  const found = tables[table]?.[" indexes"]().find((i) => i.indexDescriptor === index);
  if (!found) throw new Error(`${table} has no index ${index}`);
  return found.fields;
}

/** Wraps `ctx.db.query` in place. Returns the list of whole-table reads. */
export function checkIndexes(ctx: { db: { query: (table: string) => any } }): { scans: string[] } {
  const scans: string[] = [];
  const query = ctx.db.query.bind(ctx.db);
  ctx.db.query = (table: string) => {
    let inner = query(table);
    let indexed = false;
    const ended = (method: "collect" | "first" | "unique" | "take" | "paginate") => (...args: unknown[]) => {
      if (!indexed) scans.push(table);
      return inner[method](...args);
    };
    const api: Record<string, unknown> = {
      withIndex(name: string, build: (q: unknown) => unknown) {
        const fields = indexFields(table, name);
        const used: string[] = [];
        const range = (field: string) => (used.push(field), recorder);
        const recorder: Record<string, (field: string) => unknown> = { eq: range, gt: range, gte: range, lt: range, lte: range };
        build(recorder);
        used.forEach((field, i) => {
          if (fields[i] !== field) throw new Error(`${table}.${name}: "${field}" isn't field ${i} of the index`);
        });
        indexed = true;
        inner = inner.withIndex(name, build);
        return api;
      },
      filter(build: unknown) {
        inner = inner.filter(build);
        return api;
      },
      collect: ended("collect"),
      first: ended("first"),
      unique: ended("unique"),
      take: ended("take"),
      paginate: ended("paginate"),
    };
    return api;
  };
  return { scans };
}
