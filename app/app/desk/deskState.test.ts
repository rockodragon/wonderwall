import { describe, expect, it } from "vitest";
import { DESK_CREATE_KINDS, deskCreateHref, deskHref, parseDeskCreate } from "./deskState";

describe("desk create kinds", () => {
  it("are start a project, hire someone and host an event", () => {
    expect([...DESK_CREATE_KINDS]).toEqual(["project", "hire", "event"]);
  });
  it("parse the three, and nothing else", () => {
    expect(parseDeskCreate("project")).toBe("project");
    expect(parseDeskCreate("hire")).toBe("hire");
    expect(parseDeskCreate("event")).toBe("event");
    expect(parseDeskCreate("job")).toBeNull();
    expect(parseDeskCreate("")).toBeNull();
    expect(parseDeskCreate(null)).toBeNull();
    expect(parseDeskCreate(undefined)).toBeNull();
  });
});

describe("deskHref", () => {
  it("opens a create flow on a view", () => {
    expect(deskHref("projects", null, "hire")).toBe("/today?view=projects&create=hire");
    expect(deskHref("projects", null, "project")).toBe("/today?view=projects&create=project");
    expect(deskHref("events", null, "event")).toBe("/today?view=events&create=event");
  });
  it("is the bare desk with nothing asked", () => {
    expect(deskHref()).toBe("/today");
  });
});

describe("deskCreateHref", () => {
  it("opens the flow over the list as it is, filters and all", () => {
    const now = new URLSearchParams("view=projects&show=work&q=band");
    expect(deskCreateHref(now, "hire")).toBe("/today?view=projects&show=work&q=band&create=hire");
  });
  it("swaps a flow that is open, and closes an open card", () => {
    const now = new URLSearchParams("view=projects&card=project:x&create=project");
    expect(deskCreateHref(now, "hire")).toBe("/today?view=projects&create=hire");
  });
  it("does not touch the params it was given", () => {
    const now = new URLSearchParams("view=projects");
    deskCreateHref(now, "project");
    expect(now.toString()).toBe("view=projects");
  });
});
