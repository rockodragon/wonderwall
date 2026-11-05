// files.saveProfileImageUrl: a face from a pasted link. The address lands in
// every <img> that shows the person, so only a web link is stored (a bare
// host gets https://), and anything else is refused with a reason.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { saveProfileImageUrl } from "./files";

const ME = "users:me";

function setup() {
  return makeCtx(
    { profiles: [{ _id: "profiles:me", userId: ME, name: "Mia", interests: [], imageUrl: "https://old.example.com/me.jpg", createdAt: 0 }] },
    ME,
  );
}
const face = (ctx: any) => ctx.store.profiles[0].imageUrl;

describe("saveProfileImageUrl", () => {
  it("stores a web link, a bare host as https", async () => {
    const ctx = setup();
    await run(saveProfileImageUrl, ctx, { imageUrl: "pics.example.com/me.jpg" });
    expect(face(ctx)).toBe("https://pics.example.com/me.jpg");
  });

  it.each(["javascript:alert(1)", "data:image/svg+xml,<svg/>", "ftp://x/me.jpg"])(
    "refuses %s and keeps the face there",
    async (bad) => {
      const ctx = setup();
      await expect(run(saveProfileImageUrl, ctx, { imageUrl: bad })).rejects.toMatchObject({
        data: { code: "invalid_input" },
      });
      expect(face(ctx)).toBe("https://old.example.com/me.jpg");
    },
  );
});
