// Pure-logic tests for communities.ts: defaults for legacy rows, the
// directory listing rule, application validation, and the join decision.
// No Convex, no network — same shape as tables.test.ts / operator.test.ts.

import { describe, expect, it } from "vitest";
import {
  canManageCommunity,
  isListedCommunity,
  normalizeCommunity,
  resolveCommunityJoin,
  validateApplication,
} from "./communities";

const garden = { kind: "community", status: "active", visibility: "public", joinPolicy: "open" };

describe("normalizeCommunity — legacy rows read as active/public/open", () => {
  it("fills every missing field with the documented default", () => {
    expect(normalizeCommunity({ kind: "community" })).toMatchObject({
      status: "active",
      visibility: "public",
      joinPolicy: "open",
    });
  });
  it("never overrides a value that is set", () => {
    expect(normalizeCommunity({ kind: "community", status: "pending", joinPolicy: "apply" })).toMatchObject({
      status: "pending",
      visibility: "public",
      joinPolicy: "apply",
    });
  });
});

describe("isListedCommunity — the directory rule", () => {
  it("lists an approved public community", () => {
    expect(isListedCommunity(garden)).toBe(true);
  });
  it("never lists the platform row, a sponsor org, or a church", () => {
    for (const kind of ["platform", "org", "church"]) {
      expect(isListedCommunity({ kind, status: "active" })).toBe(false);
    }
  });
  it("hides pending, declined, archived, and unlisted communities", () => {
    expect(isListedCommunity({ ...garden, status: "pending" })).toBe(false);
    expect(isListedCommunity({ ...garden, status: "declined" })).toBe(false);
    expect(isListedCommunity({ ...garden, status: "archived" })).toBe(false);
    expect(isListedCommunity({ ...garden, visibility: "unlisted" })).toBe(false);
  });
  it("a legacy community row with no status is listed (defaults)", () => {
    expect(isListedCommunity({ kind: "community" })).toBe(true);
  });
});

describe("validateApplication", () => {
  it("accepts a plain, complete application", () => {
    expect(
      validateApplication({
        name: "The Garden",
        tagline: "Kingdom creatives in San Diego",
        description: "A weekly table and a yearly show.",
        websiteUrl: "https://example.org",
        joinPolicy: "open",
      }),
    ).toBeNull();
  });
  it("needs a name with at least one letter or number", () => {
    expect(validateApplication({ name: "   " })?.code).toBe("invalid_name");
    expect(validateApplication({ name: "!!!" })?.code).toBe("invalid_name");
  });
  it("caps the name, tagline, and description", () => {
    expect(validateApplication({ name: "x".repeat(61) })?.code).toBe("invalid_name");
    expect(validateApplication({ name: "ok", tagline: "x".repeat(121) })?.code).toBe("invalid_tagline");
    expect(validateApplication({ name: "ok", description: "x".repeat(2001) })?.code).toBe(
      "invalid_description",
    );
  });
  it("rejects a website that isn't an http(s) URL", () => {
    expect(validateApplication({ name: "ok", websiteUrl: "not a url" })?.code).toBe("invalid_website");
    expect(validateApplication({ name: "ok", websiteUrl: "ftp://x.org" })?.code).toBe("invalid_website");
    expect(validateApplication({ name: "ok", websiteUrl: "  " })).toBeNull();
  });
  it("only knows two join policies", () => {
    expect(validateApplication({ name: "ok", joinPolicy: "invite" })?.code).toBe("invalid_join_policy");
    expect(validateApplication({ name: "ok", joinPolicy: "apply" })).toBeNull();
  });
});

describe("resolveCommunityJoin", () => {
  it("open community: joins as active", () => {
    expect(resolveCommunityJoin({ community: garden, existing: null })).toEqual({
      allowed: true,
      newStatus: "active",
    });
  });
  it("apply community: joins as pending, for a host to approve", () => {
    expect(
      resolveCommunityJoin({ community: { ...garden, joinPolicy: "apply" }, existing: null }),
    ).toEqual({ allowed: true, newStatus: "pending" });
  });
  it("already a member (active or pending) is an idempotent yes", () => {
    for (const status of ["active", "pending"]) {
      const d = resolveCommunityJoin({ community: garden, existing: { status } });
      expect(d.allowed).toBe(true);
      expect(d.alreadyMember).toBe(true);
    }
  });
  it("a removed member may rejoin through the normal policy", () => {
    expect(resolveCommunityJoin({ community: garden, existing: { status: "removed" } })).toEqual({
      allowed: true,
      newStatus: "active",
    });
  });
  it("a pending community can't be joined yet, and says why", () => {
    const d = resolveCommunityJoin({ community: { ...garden, status: "pending" }, existing: null });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/approved/);
  });
  it("declined and archived communities are closed", () => {
    for (const status of ["declined", "archived"]) {
      expect(resolveCommunityJoin({ community: { ...garden, status }, existing: null }).allowed).toBe(false);
    }
  });
  it("the platform row and sponsor orgs are never joinable", () => {
    expect(resolveCommunityJoin({ community: { kind: "platform" }, existing: null }).allowed).toBe(false);
    expect(resolveCommunityJoin({ community: { kind: "org" }, existing: null }).allowed).toBe(false);
  });
});

describe("canManageCommunity", () => {
  it("hosts and moderators manage; members and nobody don't", () => {
    expect(canManageCommunity("host")).toBe(true);
    expect(canManageCommunity("moderator")).toBe(true);
    expect(canManageCommunity("member")).toBe(false);
    expect(canManageCommunity(undefined)).toBe(false);
  });
});
