import { afterEach, describe, expect, it } from "vitest";
import { inviteFromSearch, rememberInvite, rememberedInvite, withInvite } from "./carriedInvite";
import { justPublished } from "./justPublished";

describe("withInvite", () => {
  it("puts the code on a page's address", () => {
    expect(withInvite("https://x.test/events/abc", "K7M4QD")).toBe("https://x.test/events/abc?invite=K7M4QD");
  });
  it("keeps a query and a hash", () => {
    expect(withInvite("/events/abc?tab=going#top", "K7M4QD")).toBe("/events/abc?tab=going&invite=K7M4QD#top");
  });
});

describe("inviteFromSearch", () => {
  it("reads the code a link carries", () => {
    expect(inviteFromSearch("?invite=K7M4QD")).toBe("K7M4QD");
    expect(inviteFromSearch("?tab=going&invite=k7m4qd")).toBe("K7M4QD");
  });
  it("is null with no code", () => {
    expect(inviteFromSearch("")).toBeNull();
    expect(inviteFromSearch("?invite=")).toBeNull();
  });
});

describe("rememberInvite", () => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  afterEach(() => store.clear());

  it("keeps the newest code a link brought", () => {
    expect(rememberedInvite()).toBeNull();
    rememberInvite("k7m4qd");
    expect(rememberedInvite()).toBe("K7M4QD");
    rememberInvite("ABC234");
    expect(rememberedInvite()).toBe("ABC234");
  });
  it("ignores an empty code", () => {
    rememberInvite("  ");
    expect(rememberedInvite()).toBeNull();
  });
});

describe("justPublished", () => {
  it("marks a new page", () => {
    expect(justPublished("/events/abc")).toBe("/events/abc?new=1");
    expect(justPublished("/projects/abc?tab=team")).toBe("/projects/abc?tab=team&new=1");
  });
});
