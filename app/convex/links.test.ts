// links.add / links.update: a saved link is an address people will be sent to,
// so only http(s) is stored (a bare host gets https://), and anything else is
// refused with a reason a person can read.

import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { add, update } from "./links";

const ME = "users:me";
const LINK = "links:one";

function setup() {
  return makeCtx(
    {
      profiles: [{ _id: "profiles:me", userId: ME, name: "Mia", interests: [], createdAt: 0 }],
      links: [{ _id: LINK, profileId: "profiles:me", label: "Site", url: "https://old.example.com", order: 0 }],
    },
    ME,
  );
}
const urls = (ctx: any) => ctx.store.links.map((r: Row) => r.url);

describe("links.add", () => {
  it("stores a bare host as https", async () => {
    const ctx = setup();
    await run(add, ctx, { label: "Me", url: "example.com" });
    expect(urls(ctx)).toEqual(["https://old.example.com", "https://example.com"]);
  });

  it.each(["javascript:alert(1)", "ftp://x"])("refuses %s and stores nothing", async (bad) => {
    const ctx = setup();
    await expect(run(add, ctx, { label: "Me", url: bad })).rejects.toMatchObject({
      data: { code: "invalid_input", reason: "That isn't a link. Paste the address of the page." },
    });
    expect(urls(ctx)).toEqual(["https://old.example.com"]);
  });
});

describe("links.update", () => {
  it("stores a bare host as https", async () => {
    const ctx = setup();
    await run(update, ctx, { linkId: LINK, label: "Me", url: "example.com" });
    expect(urls(ctx)).toEqual(["https://example.com"]);
  });

  it.each(["javascript:alert(1)", "ftp://x"])("refuses %s and leaves the link as it was", async (bad) => {
    const ctx = setup();
    await expect(run(update, ctx, { linkId: LINK, label: "Me", url: bad })).rejects.toMatchObject({
      data: { code: "invalid_input" },
    });
    expect(urls(ctx)).toEqual(["https://old.example.com"]);
  });
});
