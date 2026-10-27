import { expect, it } from "vitest";
import schema from "../convex/schema";

it("declares each table index name once, including after branch integration", () => {
  for (const [name, table] of Object.entries(schema.tables)) {
    const indexes = (table as unknown as { " indexes"(): { indexDescriptor: string }[] })[" indexes"]();
    const names = indexes.map(index => index.indexDescriptor);
    expect(new Set(names).size, `${name} has duplicate index names`).toBe(names.length);
  }
});
