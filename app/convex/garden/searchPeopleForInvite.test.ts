// The invite picker's name search (projectTeam.ts searchPeopleForInvite):
// people already listed are left out before its 10 are picked, so an org
// with many listed "Ma…" names still finds the one sought (orgs.$slug.edit).
import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../../test-support/convexContext";
import { SEARCH_LIMIT, searchPeopleForInvite } from "./projectTeam";

const person = (n: number, name: string) => ({ _id: `profiles:${n}`, userId: `users:${n}`, name });
const MAS = Array.from({ length: SEARCH_LIMIT }, (_, i) => person(i + 1, `Ma ${String.fromCharCode(65 + i)}`));
const SOUGHT = person(99, "Ma Zed");
const VIEWER = person(50, "Ma Viewer");
const tables = { profiles: [...MAS, SOUGHT, VIEWER] };
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("searchPeopleForInvite", () => {
  it("picks its 10 by name, leaving out the caller", async () => {
    const hits = await run(searchPeopleForInvite, makeCtx(tables, VIEWER.userId), { q: "ma" });
    expect(names(hits)).toEqual(names(MAS));
  });

  it("leaves out who's excluded before picking, so they can't crowd out the one sought", async () => {
    const exclude = MAS.map((p) => p._id);
    const hits = await run(searchPeopleForInvite, makeCtx(tables, VIEWER.userId), { q: "ma", exclude });
    expect(names(hits)).toEqual(["Ma Zed"]);
  });

  it("is empty signed out", async () => {
    expect(await run(searchPeopleForInvite, makeCtx(tables, null), { q: "ma" })).toEqual([]);
  });
});
