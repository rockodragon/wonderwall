import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../../test-support/convexContext";
import { findCommunityForHost, normalizeHost, renameCommunity } from "./communityDomains";

describe("normalizeHost", () => {
  it("strips case, www, port, scheme and path", () => {
    expect(normalizeHost("WWW.CreateSD.org:443")).toBe("createsd.org");
    expect(normalizeHost("https://thegardensd.org/join")).toBe("thegardensd.org");
    expect(normalizeHost("")).toBe("");
    expect(normalizeHost(undefined)).toBe("");
  });
});

describe("findCommunityForHost", () => {
  const garden = { slug: "the-garden", domains: ["thegardensd.org"] };
  const createSd = { slug: "create-sd", domains: ["createsd.org", "createsd.com"] };
  const all: { slug: string; domains?: string[] }[] = [garden, createSd, { slug: "no-domains" }];

  it("maps each domain to its community", () => {
    expect(findCommunityForHost("thegardensd.org", all)).toBe(garden);
    expect(findCommunityForHost("www.createsd.com", all)).toBe(createSd);
  });

  it("the neutral hub and unknown hosts map to no community", () => {
    expect(findCommunityForHost("creatives.exchange", all)).toBeNull();
    expect(findCommunityForHost("localhost", all)).toBeNull();
  });

  it("a lookalike subdomain doesn't match", () => {
    expect(findCommunityForHost("evil-createsd.org", all)).toBeNull();
  });
});

describe("renameCommunity", () => {
  const NOW = Date.now();
  const world = () => ({
    hostOrgs: [
      { _id: "hostOrgs:csd", slug: "create-sd", name: "Create SD", kind: "community", createdAt: 1 },
      { _id: "hostOrgs:garden", slug: "the-garden", name: "The Garden", kind: "community", createdAt: 1 },
    ],
    profiles: [{ _id: "profiles:ana", userId: "users:ana", name: "Ana", handle: "anareyes", createdAt: 1, updatedAt: 1 }],
    handleForwards: [{ _id: "handleForwards:1", handle: "anar", profileId: "profiles:ana", expiresAt: NOW + 60_000 }],
  });

  it("moves a community to a free slug, a held city name included", async () => {
    const ctx = makeCtx(world(), null);
    expect(await run(renameCommunity, ctx, { slug: "create-sd", newSlug: "sandiego" })).toMatchObject({ slug: "sandiego" });
    expect(ctx.store.hostOrgs[0].slug).toBe("sandiego");
  });

  it("refuses a slug a person holds as their address, or their old one while it forwards", async () => {
    const ctx = makeCtx(world(), null);
    await expect(run(renameCommunity, ctx, { slug: "create-sd", newSlug: "anareyes" })).rejects.toThrow(
      "a person's address (@anareyes)",
    );
    await expect(run(renameCommunity, ctx, { slug: "create-sd", newSlug: "anar" })).rejects.toThrow(
      "a person's address (@anareyes)",
    );
    expect(ctx.store.hostOrgs[0].slug).toBe("create-sd");
  });

  it("still refuses a site page and another community's slug", async () => {
    const ctx = makeCtx(world(), null);
    await expect(run(renameCommunity, ctx, { slug: "create-sd", newSlug: "settings" })).rejects.toThrow("already a page");
    await expect(run(renameCommunity, ctx, { slug: "create-sd", newSlug: "the-garden" })).rejects.toThrow(
      "taken by The Garden",
    );
  });
});
