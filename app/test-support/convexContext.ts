export type Row = Record<string, any> & { _id: string };

/** Just enough of Convex's ctx: get / insert / patch / delete, and
 * query().withIndex(name, q => q.eq(..).gte(..)) or .filter(...) followed by
 * collect / first / unique / take. Index names aren't checked — the schema
 * does that for real. */
export function makeCtx(
  tables: Record<string, Row[]>,
  viewerId: string | null,
) {
  const store: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables))
    store[name] = rows.map((r) => ({ ...r }));
  const rowsOf = (table: string) => (store[table] ??= []);
  let counter = 100;
  const find = (id: string) =>
    rowsOf(id.split(":")[0]).find((r) => r._id === id) ?? null;

  function query(table: string) {
    let rows = rowsOf(table).slice();
    const api = {
      withIndex(_name: string, build: (q: any) => any) {
        const conds: ((r: Row) => boolean)[] = [];
        const q: any = {
          eq: (f: string, v: unknown) => (conds.push((r) => r[f] === v), q),
          gt: (f: string, v: any) => (conds.push((r) => r[f] > v), q),
          gte: (f: string, v: any) => (conds.push((r) => r[f] >= v), q),
          lt: (f: string, v: any) => (conds.push((r) => r[f] < v), q),
          lte: (f: string, v: any) => (conds.push((r) => r[f] <= v), q),
        };
        build(q);
        rows = rows.filter((r) => conds.every((c) => c(r)));
        return api;
      },
      filter(build: (q: any) => any) {
        const q = {
          field: (name: string) => (r: Row) => r[name],
          eq: (a: any, b: any) => (r: Row) =>
            (typeof a === "function" ? a(r) : a) ===
            (typeof b === "function" ? b(r) : b),
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
  };

  return {
    db,
    auth: {
      getUserIdentity: async () =>
        viewerId ? { subject: `${viewerId}|session` } : null,
    },
    storage: { getUrl: async () => null, delete: async () => {} },
    scheduler: { runAfter: async () => {} },
    store,
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
