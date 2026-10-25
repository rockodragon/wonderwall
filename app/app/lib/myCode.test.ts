import { describe, expect, it } from "vitest";
import { inviteFromSearch } from "./carriedInvite";
import { F2F_REF, isF2fScan, myCodeUrl, scanCardState, scanReturnPath } from "./myCode";
import { shareSite } from "./profileShare";

describe("myCodeUrl", () => {
  it("from a Garden domain, opens The Garden's address", () => {
    expect(myCodeUrl({ handle: "ana", profileId: "p1" }, "K7M4QD", shareSite("garden"))).toBe(
      "https://createthegarden.com/@ana?invite=K7M4QD&ref=f2f",
    );
    expect(myCodeUrl({ profileId: "k57abc" }, "K7M4QD", shareSite("garden"))).toBe(
      "https://createthegarden.com/profile/k57abc?invite=K7M4QD&ref=f2f",
    );
  });

  it("opens the public address with the invite, then ref=f2f", () => {
    expect(myCodeUrl({ handle: "ana", profileId: "p1" }, "K7M4QD")).toBe(
      "https://thecreative.exchange/@ana?invite=K7M4QD&ref=f2f",
    );
  });

  it("keeps periods and underscores in the address as they are", () => {
    expect(myCodeUrl({ handle: "ana.reyes_", profileId: "p1" }, "K7M4QD")).toBe(
      "https://thecreative.exchange/@ana.reyes_?invite=K7M4QD&ref=f2f",
    );
  });

  it("without an address, opens /profile/<id> with the same two", () => {
    expect(myCodeUrl({ handle: null, profileId: "k57abc" }, "K7M4QD")).toBe(
      "https://thecreative.exchange/profile/k57abc?invite=K7M4QD&ref=f2f",
    );
    expect(myCodeUrl({ profileId: "k57abc" }, "K7M4QD")).toBe(
      "https://thecreative.exchange/profile/k57abc?invite=K7M4QD&ref=f2f",
    );
  });

  it("reads back as the invite and a scan on the page it opens", () => {
    const search = new URL(myCodeUrl({ handle: "ana", profileId: "p1" }, "k7m4qd")).search;
    expect(inviteFromSearch(search)).toBe("K7M4QD");
    expect(isF2fScan(search)).toBe(true);
  });
});

describe("isF2fScan", () => {
  it("is true only for ref=f2f", () => {
    expect(isF2fScan("?ref=f2f")).toBe(true);
    expect(isF2fScan("?invite=K7M4QD&ref=f2f")).toBe(true);
    expect(isF2fScan("")).toBe(false);
    expect(isF2fScan("?ref=qr")).toBe(false);
    expect(isF2fScan("?ref=F2F")).toBe(false);
  });
});

describe("scanReturnPath", () => {
  it("is the same page, still a scan, without the invite", () => {
    expect(scanReturnPath("/@ana")).toBe(`/@ana?ref=${F2F_REF}`);
    expect(isF2fScan(new URL(scanReturnPath("/@ana"), "https://x.test").search)).toBe(true);
  });
});

describe("scanCardState", () => {
  const scan = {
    search: "?invite=K7M4QD&ref=f2f",
    authLoading: false,
    signedIn: true,
    isOwner: false as boolean | undefined,
    following: false as boolean | undefined,
  };

  it("shows nothing on a page that wasn't scanned", () => {
    expect(scanCardState({ ...scan, search: "" })).toBe("hidden");
    expect(scanCardState({ ...scan, search: "?ref=qr", signedIn: false })).toBe("hidden");
  });

  it("waits while sign-in is still being checked", () => {
    expect(scanCardState({ ...scan, authLoading: true, signedIn: false })).toBe("hidden");
  });

  it("invites someone signed out", () => {
    expect(scanCardState({ ...scan, signedIn: false, isOwner: false, following: undefined })).toBe("invited");
  });

  it("offers Follow to a member who isn't following yet", () => {
    expect(scanCardState(scan)).toBe("scanned");
  });

  it("says so once they follow", () => {
    expect(scanCardState({ ...scan, following: true })).toBe("following");
  });

  it("shows the owner nothing, and nothing while it's unclear who's looking", () => {
    expect(scanCardState({ ...scan, isOwner: true })).toBe("hidden");
    expect(scanCardState({ ...scan, isOwner: undefined })).toBe("hidden");
    expect(scanCardState({ ...scan, following: undefined })).toBe("hidden");
  });
});
