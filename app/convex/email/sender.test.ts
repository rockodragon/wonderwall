// Pure-logic tests for which name an email is sent under: community email
// (invite accepted, messages, updates...) comes from The Garden, account
// email (sign-in codes, receipts) keeps the platform name, and the sending
// address never changes.

import { describe, expect, it } from "vitest";
import {
  chooseFromName,
  cleanDisplayName,
  defaultSenderFor,
  isActiveCommunity,
  pickSenderCommunity,
  PLATFORM_NAME,
  withDisplayName,
  type SenderCommunity,
} from "./sender";

const DEFAULT_FROM = "TheCreative.exchange <hello@thecreative.exchange>";

describe("defaultSenderFor", () => {
  it("sends activity, digest and announcements from the community", () => {
    expect(defaultSenderFor("activity")).toBe("community");
    expect(defaultSenderFor("digest")).toBe("community");
    expect(defaultSenderFor("announcements")).toBe("community");
  });

  it("keeps transactional and uncategorized mail on the platform sender", () => {
    expect(defaultSenderFor("transactional")).toBe("platform");
    expect(defaultSenderFor(undefined)).toBe("platform");
  });
});

describe("chooseFromName", () => {
  it("uses the community's name for a community sender", () => {
    expect(chooseFromName({ sender: "community", communityName: "The Garden" })).toBe("The Garden");
  });

  it("is unset for a platform sender, even when a community name is known", () => {
    expect(chooseFromName({ sender: "platform", communityName: "The Garden" })).toBeUndefined();
    expect(chooseFromName({ sender: "platform" })).toBeUndefined();
  });

  it("falls back to the default (unset) when the community isn't seeded or has no name", () => {
    expect(chooseFromName({ sender: "community", communityName: null })).toBeUndefined();
    expect(chooseFromName({ sender: "community" })).toBeUndefined();
    expect(chooseFromName({ sender: "community", communityName: "   " })).toBeUndefined();
  });

  it("trims the name", () => {
    expect(chooseFromName({ sender: "community", communityName: "  The Garden " })).toBe("The Garden");
  });
});

describe("cleanDisplayName", () => {
  it("removes line breaks so a name can't add header lines", () => {
    expect(cleanDisplayName("The Garden\r\nBcc: someone@example.com")).toBe(
      "The Garden Bcc: someone@example.com",
    );
  });

  it("is empty for missing input", () => {
    expect(cleanDisplayName(undefined)).toBe("");
    expect(cleanDisplayName(null)).toBe("");
  });
});

describe("withDisplayName", () => {
  it("swaps the name and keeps the address", () => {
    expect(withDisplayName(DEFAULT_FROM, "The Garden")).toBe(
      "The Garden <hello@thecreative.exchange>",
    );
  });

  it("returns the configured from untouched when no name is given", () => {
    expect(withDisplayName(DEFAULT_FROM, undefined)).toBe(DEFAULT_FROM);
    expect(withDisplayName(DEFAULT_FROM, "  ")).toBe(DEFAULT_FROM);
  });

  it("works on a bare address", () => {
    expect(withDisplayName("hello@thecreative.exchange", "The Garden")).toBe(
      "The Garden <hello@thecreative.exchange>",
    );
  });

  it("works on an EMAIL_FROM that already quotes its name", () => {
    expect(withDisplayName('"Creative, Exchange" <hello@thecreative.exchange>', "The Garden")).toBe(
      "The Garden <hello@thecreative.exchange>",
    );
  });

  it("quotes a name that has RFC 5322 special characters", () => {
    expect(withDisplayName(DEFAULT_FROM, "St. Mary's Garden")).toBe(
      `"St. Mary's Garden" <hello@thecreative.exchange>`,
    );
    expect(withDisplayName(DEFAULT_FROM, 'The "Real" Garden')).toBe(
      `"The \\"Real\\" Garden" <hello@thecreative.exchange>`,
    );
  });

  it("can't be used to smuggle a second address or header into the from line", () => {
    const out = withDisplayName(DEFAULT_FROM, "Garden <evil@example.com>\r\nBcc: x@example.com");
    expect(out).not.toMatch(/[\r\n]/);
    expect(out.endsWith("<hello@thecreative.exchange>")).toBe(true);
    // The injected address sits inside the quoted name, not as the sender.
    expect(out.startsWith('"')).toBe(true);
  });

  it("leaves the from alone when it has no address to keep", () => {
    expect(withDisplayName("not an address", "The Garden")).toBe("not an address");
    expect(withDisplayName("", "The Garden")).toBe("");
  });

  it("uses the platform name constant for the default sender", () => {
    expect(DEFAULT_FROM.startsWith(PLATFORM_NAME)).toBe(true);
  });
});

const community = (id: string, name: string, extra: Partial<SenderCommunity> = {}): SenderCommunity => ({
  _id: id,
  name,
  kind: "community",
  ...extra,
});

const GARDEN = community("garden", "The Garden");
const SD = community("sd", "The Creative Exchange San Diego", { status: "active" });
const OPEN = community("open", "Open Circle");

describe("isActiveCommunity", () => {
  it("is true for a community with no status (reads as active) or an active one", () => {
    expect(isActiveCommunity({ kind: "community" })).toBe(true);
    expect(isActiveCommunity({ kind: "community", status: "active" })).toBe(true);
  });

  it("is false for pending, declined and archived communities", () => {
    for (const status of ["pending", "declined", "archived"]) {
      expect(isActiveCommunity({ kind: "community", status })).toBe(false);
    }
  });

  it("is false for the platform row and for funds", () => {
    expect(isActiveCommunity({ kind: "platform", status: "active" })).toBe(false);
    expect(isActiveCommunity({ kind: "org" })).toBe(false);
    expect(isActiveCommunity({ kind: "church" })).toBe(false);
  });
});

describe("pickSenderCommunity", () => {
  it("1. the community the email is about wins, even over the recipient's own", () => {
    const picked = pickSenderCommunity({
      explicit: SD,
      memberships: [{ community: GARDEN, joinedAt: 1 }],
      defaultCommunity: GARDEN,
    });
    expect(picked).toBe(SD);
  });

  it("1. an explicit community that isn't active or isn't a community is skipped", () => {
    const pending = community("p", "Not Yet", { status: "pending" });
    const fund = { _id: "f", name: "Abiding Practice", kind: "org" };
    for (const explicit of [pending, fund]) {
      expect(
        pickSenderCommunity({
          explicit,
          memberships: [{ community: SD, joinedAt: 1 }],
          defaultCommunity: GARDEN,
        }),
      ).toBe(SD);
    }
  });

  it("2. a member of exactly one active community gets that one, not the default", () => {
    expect(
      pickSenderCommunity({
        memberships: [{ community: SD, joinedAt: 5 }],
        defaultCommunity: GARDEN,
      }),
    ).toBe(SD);
  });

  it("2. in several, the default community wins if they're in it", () => {
    expect(
      pickSenderCommunity({
        memberships: [
          { community: SD, joinedAt: 1 },
          { community: GARDEN, joinedAt: 9 },
        ],
        defaultCommunity: GARDEN,
      }),
    ).toBe(GARDEN);
  });

  it("2. in several without the default, the one they joined first", () => {
    expect(
      pickSenderCommunity({
        memberships: [
          { community: OPEN, joinedAt: 30 },
          { community: SD, joinedAt: 10 },
        ],
        defaultCommunity: GARDEN,
      }),
    ).toBe(SD);
  });

  it("2. memberships in communities that aren't active don't count", () => {
    const archived = community("a", "Gone", { status: "archived" });
    // Only SD is open, so it is the one community — not "several".
    expect(
      pickSenderCommunity({
        memberships: [
          { community: archived, joinedAt: 1 },
          { community: SD, joinedAt: 2 },
        ],
        defaultCommunity: GARDEN,
      }),
    ).toBe(SD);
    // None open: on to the default.
    expect(
      pickSenderCommunity({
        memberships: [{ community: archived, joinedAt: 1 }],
        defaultCommunity: GARDEN,
      }),
    ).toBe(GARDEN);
  });

  it("3. no explicit community and no memberships gives the default", () => {
    expect(pickSenderCommunity({ defaultCommunity: GARDEN })).toBe(GARDEN);
    expect(pickSenderCommunity({ explicit: null, memberships: [], defaultCommunity: GARDEN })).toBe(
      GARDEN,
    );
  });

  it("4. nothing at all gives null, so the platform sender is kept", () => {
    expect(pickSenderCommunity({})).toBeNull();
    expect(pickSenderCommunity({ defaultCommunity: null, memberships: [] })).toBeNull();
  });

  it("returns the same object it was given, so callers keep their full row", () => {
    const row = { ...GARDEN, extra: 1 };
    expect(pickSenderCommunity({ defaultCommunity: row })).toBe(row);
  });
});
