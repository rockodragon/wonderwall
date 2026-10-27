import { indexFields } from "./indexChecks";

export type Row = Record<string, any> & { _id: string };

/** Just enough of Convex's ctx: get / insert / patch / delete, and
 * query().withIndex(name, q => q.eq(..).gte(..)) or .filter(...), optionally
 * .order("desc") (newest inserted first), followed by collect / first /
 * unique / take / paginate. Index names aren't checked — the schema does
 * that for real.
 *
 * Stored files are rows of a `_storage` table ({ _id: "_storage:a",
 * _creationTime }), read by db.system.get. storage.delete removes the row
 * and records the id in `deletedFiles`. */
export function makeCtx(
  tables: Record<string, Row[]>,
  viewerId: string | null,
) {
  const store: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables))
    store[name] = rows.map((r) => ({ ...r }));
  const rowsOf = (table: string) => (store[table] ??= []);
  const deletedFiles: string[] = [];
  let counter = 100;
  const find = (id: string) =>
    rowsOf(id.split(":")[0]).find((r) => r._id === id) ?? null;

  function query(table: string) {
    let rows = rowsOf(table).slice();
    let fields = ["_creationTime", "_id"];
    let direction: "asc" | "desc" = "asc";
    const compare = (a: any, b: any): number => {
      if (a === b) return 0;
      if (a === undefined) return -1;
      if (b === undefined) return 1;
      if (a === null) return -1;
      if (b === null) return 1;
      return a < b ? -1 : 1;
    };
    const compareKeys = (a: unknown[], b: unknown[]) => {
      for (let i = 0; i < fields.length; i += 1) {
        const result = compare(a[i], b[i]);
        if (result) return direction === "asc" ? result : -result;
      }
      return 0;
    };
    const keyOf = (row: Row) => fields.map(field => row[field]);
    const ordered = () => rows.slice().sort((a, b) => compareKeys(keyOf(a), keyOf(b)));
    const api = {
      withIndex(name: string, build: (q: any) => any) {
        fields = [...indexFields(table, name), "_creationTime", "_id"];
        const conds: ((r: Row) => boolean)[] = [];
        const q: any = {
          eq: (f: string, v: unknown) => (conds.push((r) => r[f] === v), q),
          gt: (f: string, v: any) => (conds.push((r) => compare(r[f], v) > 0), q),
          gte: (f: string, v: any) => (conds.push((r) => compare(r[f], v) >= 0), q),
          lt: (f: string, v: any) => (conds.push((r) => compare(r[f], v) < 0), q),
          lte: (f: string, v: any) => (conds.push((r) => compare(r[f], v) <= 0), q),
        };
        build(q);
        rows = rows.filter((r) => conds.every((c) => c(r)));
        return api;
      },
      order(next: "asc" | "desc") {
        direction = next;
        rows = ordered();
        return api;
      },
      filter(build: (q: any) => any) {
        const val = (x: any, r: Row) => (typeof x === "function" ? x(r) : x);
        const cmp = (test: (a: any, b: any) => boolean) => (a: any, b: any) => (r: Row) =>
          test(val(a, r), val(b, r));
        const q = {
          field: (name: string) => (r: Row) => r[name],
          eq: cmp((a, b) => a === b),
          neq: cmp((a, b) => a !== b),
          gt: cmp((a, b) => a > b),
          gte: cmp((a, b) => a >= b),
          lt: cmp((a, b) => a < b),
          lte: cmp((a, b) => a <= b),
          and: (...ps: ((r: Row) => boolean)[]) => (r: Row) => ps.every((p) => p(r)),
          or: (...ps: ((r: Row) => boolean)[]) => (r: Row) => ps.some((p) => p(r)),
        };
        const pred = build(q);
        rows = rows.filter((r) => pred(r));
        return api;
      },
      async collect() {
        return rows.map((r) => ({ ...r }));
      },
      async take(n: number) {
        return rows.slice(0, n).map((r) => ({ ...r }));
      },
      async unique() {
        if (rows.length > 1)
          throw new Error("unique() matched more than one row");
        return rows[0] ? { ...rows[0] } : null;
      },
      async first() {
        return rows[0] ? { ...rows[0] } : null;
      },
      async paginate({ cursor, numItems }: { cursor: string | null; numItems: number }) {
        const after = cursor ? JSON.parse(cursor, (_key, value) => value?.__missingValue === true ? undefined : value) as { key: unknown[]; fields: string[]; direction: string } : null;
        if (after && (JSON.stringify(after.fields) !== JSON.stringify(fields) || after.direction !== direction))
          throw new Error("Pagination cursor belongs to a different query");
        const remaining = ordered().filter(row => !after || compareKeys(keyOf(row), after.key) > 0);
        const page = remaining.slice(0, numItems);
        return {
          page: page.map(row => ({ ...row })),
          isDone: remaining.length <= numItems,
          continueCursor: page.length ? JSON.stringify({ key: keyOf(page[page.length - 1]), fields, direction }, (_key, value) => value === undefined ? { __missingValue: true } : value) : cursor ?? "",
        };
      },
    };
    return api;
  }

  const db = {
    query,
    async get(id: string) {
      const r = find(id);
      return r ? { ...r } : null;
    },
    normalizeId(table: string, id: string) {
      return id.startsWith(`${table}:`) && find(id) ? id : null;
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const _id = `${table}:${++counter}`;
      rowsOf(table).push({ _id, _creationTime: Date.now(), ...doc });
      return _id;
    },
    async patch(id: string, fields: Record<string, unknown>) {
      const r = find(id);
      if (!r) throw new Error(`patch: no row ${id}`);
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) delete r[k];
        else r[k] = v;
      }
    },
    async delete(id: string) {
      const table = id.split(":")[0];
      store[table] = rowsOf(table).filter((r) => r._id !== id);
    },
    // System tables: only `_storage` is used. normalizeId checks the shape,
    // not that the file exists, as Convex's does.
    system: {
      normalizeId(table: string, id: string) {
        return id.startsWith(`${table}:`) ? id : null;
      },
      async get(id: string) {
        const r = rowsOf("_storage").find((f) => f._id === id);
        return r ? { ...r } : null;
      },
    },
  };

  return {
    db,
    auth: {
      getUserIdentity: async () =>
        viewerId ? { subject: `${viewerId}|session` } : null,
    },
    storage: {
      getUrl: async () => null,
      delete: async (id: string) => {
        deletedFiles.push(id);
        store._storage = rowsOf("_storage").filter((f) => f._id !== id);
      },
    },
    scheduler: { runAfter: async () => {} },
    store,
    deletedFiles,
  } as any;
}

export const run = (
  fn: unknown,
  ctx: unknown,
  args: Record<string, unknown> = {},
) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(
    ctx,
    args,
  );
