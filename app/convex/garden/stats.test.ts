// publicCounts (garden/stats.ts), the numbers on the public landing page:
// someone who signed in but never named themselves (convex/names.ts) isn't a
// member yet, so isn't a creative in the count or in a city.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../../test-support/convexContext";
import { publicCounts } from "./stats";

const sandiego = { city: "San Diego", stateCode: "CA" };
const austin = { city: "Austin", stateCode: "TX" };

const profile = (key: string, name: string, extra: Record<string, unknown> = {}) => ({
  _id: `profiles:${key}`,
  userId: `users:${key}`,
  name,
  ...extra,
});

const counts = async (profiles: ReturnType<typeof profile>[]) =>
  await run(publicCounts, makeCtx({ profiles, users: profiles.map((p) => ({ _id: p.userId })) }, null));

describe("publicCounts — unnamed accounts", () => {
  it("counts a named creative and not an unnamed one", async () => {
    const got = await counts([
      profile("dana", "Dana Reyes"),
      profile("ghost", "New User"),
      profile("padded", "  new user "),
      profile("blank", ""),
    ]);
    expect(got.creatives).toBe(1);
  });

  it("leaves them out of the cities and the no-location tally", async () => {
    const got = await counts([
      profile("a", "Ann Lee", { address: sandiego }),
      profile("b", "Bo Chen", { address: sandiego }),
      profile("c", "Cy Diaz"),
      profile("ghost1", "New User", { address: sandiego }),
      profile("ghost2", "New User"),
    ]);
    expect(got.creatives).toBe(3);
    expect(got.cities).toEqual([{ label: "San Diego, CA", creatives: 2, projects: 0 }]);
    expect(got.withoutLocation).toEqual({ creatives: 1, projects: 0 });
  });

  it("doesn't let an unnamed account push a city over the publishing floor", async () => {
    // One named member plus one unnamed would make a two-person Austin.
    const got = await counts([
      profile("a", "Ann Lee", { address: austin }),
      profile("ghost", "New User", { address: austin }),
    ]);
    expect(got.creatives).toBe(1);
    expect(got.cities).toEqual([]);
  });
});
