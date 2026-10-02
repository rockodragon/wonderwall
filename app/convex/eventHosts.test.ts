import { describe, it, expect } from "vitest";
import { isEventHost, planAddCoHost, planRemoveCoHost, MAX_CO_HOSTS, planDisplayHosts } from "./eventHosts";

describe("isEventHost", () => {
  const event = { organizerId: "org", coHostIds: ["a", "b"] };
  it("accepts the organizer", () => expect(isEventHost(event, "org")).toBe(true));
  it("accepts a co-host", () => expect(isEventHost(event, "b")).toBe(true));
  it("rejects others and signed-out", () => {
    expect(isEventHost(event, "zzz")).toBe(false);
    expect(isEventHost(event, null)).toBe(false);
    expect(isEventHost(event, undefined)).toBe(false);
  });
  it("works with no coHostIds", () => {
    expect(isEventHost({ organizerId: "org" }, "org")).toBe(true);
    expect(isEventHost({ organizerId: "org" }, "a")).toBe(false);
  });
});

describe("planAddCoHost / planRemoveCoHost", () => {
  it("adds", () => {
    expect(planAddCoHost({ organizerId: "o", coHostIds: ["a"] }, "b")).toEqual({ ok: true, coHostIds: ["a", "b"] });
  });
  it("refuses the organizer, duplicates, and an 11th", () => {
    expect(planAddCoHost({ organizerId: "o" }, "o")).toEqual({ ok: false, reason: "is_organizer" });
    expect(planAddCoHost({ organizerId: "o", coHostIds: ["a"] }, "a")).toEqual({ ok: false, reason: "duplicate" });
    const full = Array.from({ length: MAX_CO_HOSTS }, (_, i) => `u${i}`);
    expect(planAddCoHost({ organizerId: "o", coHostIds: full }, "new")).toEqual({ ok: false, reason: "full" });
  });
  it("removes", () => {
    expect(planRemoveCoHost({ coHostIds: ["a", "b"] }, "a")).toEqual({ ok: true, coHostIds: ["b"] });
    expect(planRemoveCoHost({ coHostIds: ["a"] }, "x")).toEqual({ ok: false, reason: "not_a_co_host" });
  });
});

describe("planDisplayHosts", () => {
  it("keeps order", () => {
    const refs = [{ kind: "org" as const, id: "o" }, { kind: "user" as const, id: "u" }];
    expect(planDisplayHosts(refs)).toEqual({ ok: true, refs });
  });
  it("refuses repeats and more than 10", () => {
    expect(planDisplayHosts([{ kind: "user", id: "u" }, { kind: "user", id: "u" }])).toEqual({ ok: false, reason: "duplicate" });
    const many = Array.from({ length: 11 }, (_, i) => ({ kind: "user" as const, id: String(i) }));
    expect(planDisplayHosts(many)).toEqual({ ok: false, reason: "full" });
  });
  it("same id as user and org is fine", () => {
    expect(planDisplayHosts([{ kind: "user", id: "x" }, { kind: "org", id: "x" }]).ok).toBe(true);
  });
});
