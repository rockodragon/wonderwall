// With FF_TABLES off (the default until Tables has had a real run), the
// palette offers no way into Tables, signed in or out.
import { describe, expect, it } from "vitest";
import { FF_TABLES } from "../lib/featureFlags";
import { buildSignedInTools, buildSignedOutTools, type SignedInDeps } from "./paletteConfig";

const DEPS: SignedInDeps = {
  initials: "RM",
  isAdmin: false,
  badgeCount: 0,
  community: "garden",
  active: null,
  shortlist: null,
  invite: { label: "Invite someone", onSelect: () => {} },
  onSwitchCommunity: () => {},
  onSignOut: () => {},
};

describe("Tables while FF_TABLES is off", () => {
  it("is off by default", () => {
    expect(FF_TABLES).toBe(false);
  });

  it("leaves the Tables tool out of both palettes", () => {
    const signedIn = buildSignedInTools(DEPS);
    const signedOut = buildSignedOutTools({ active: null, loginTo: "/login" });
    expect(signedIn.map((t) => t.id)).not.toContain("tables");
    expect(signedOut.map((t) => t.id)).not.toContain("tables");
  });
});
