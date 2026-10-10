// Pure-logic tests for "the first cheer a member ever receives"
// (engagement/firstCheer.ts). No Convex, no network.

import { describe, expect, it } from "vitest";
import { isFirstCheer } from "./firstCheer";

const OWNER = "u-owner";
const DANA = "u-dana";
const row = (id: string, extra: Partial<{ type: string; supporterUserId: string }> = {}) => ({
  _id: id,
  type: "encouragement",
  supporterUserId: DANA,
  ...extra,
});

describe("isFirstCheer", () => {
  it("is the first when the cheer just posted is the only one", () => {
    expect(isFirstCheer([row("new")], OWNER, "new")).toBe(true);
    expect(isFirstCheer([], OWNER, "new")).toBe(true);
  });

  it("is not the first when the member has had a cheer before", () => {
    expect(isFirstCheer([row("old"), row("new")], OWNER, "new")).toBe(false);
  });

  it("counts a cheer on any of their projects, since the caller passes all of them", () => {
    expect(isFirstCheer([row("on-another-project"), row("new", { supporterUserId: "u-jo" })], OWNER, "new")).toBe(false);
  });

  it("ignores offers of help, backings and the member's own cheers on their own project", () => {
    const rows = [
      row("help", { type: "resource" }),
      row("money", { type: "financial_one_time" }),
      row("self", { supporterUserId: OWNER }),
      row("new"),
    ];
    expect(isFirstCheer(rows, OWNER, "new")).toBe(true);
  });

  it("counts an anonymous (guest) cheer as received", () => {
    expect(isFirstCheer([row("guest", { supporterUserId: undefined }), row("new")], OWNER, "new")).toBe(false);
  });
});
