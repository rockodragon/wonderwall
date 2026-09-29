import { describe, expect, it } from "vitest";
import { findCommunityForHost, normalizeHost } from "./communityDomains";

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
