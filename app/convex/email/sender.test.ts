// Pure-logic tests for which name an email is sent under: community email
// (invite accepted, messages, updates...) comes from The Garden, account
// email (sign-in codes, receipts) keeps the platform name, and the sending
// address never changes.

import { describe, expect, it } from "vitest";
import {
  chooseFromName,
  cleanDisplayName,
  defaultSenderFor,
  PLATFORM_NAME,
  withDisplayName,
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
