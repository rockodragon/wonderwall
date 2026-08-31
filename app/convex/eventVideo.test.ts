import { describe, expect, it } from "vitest";
import { normalizeVideoUrl, publicJoinTarget } from "./eventVideo";
import { eventAccessType } from "./eventAccess";

const row = { meetingUrl: "https://meet.google.com/abc-defg-hij" };

describe("publicJoinTarget — what the sessionless /j/ proxy may resolve", () => {
  it("resolves a live public event's link", () => {
    expect(publicJoinTarget({ status: "published" }, row)).toBe(row.meetingUrl);
  });

  it("treats an absent accessType as public — free events predate the field", () => {
    expect(eventAccessType({ accessType: undefined })).toBe("public");
    expect(publicJoinTarget({ status: "published" }, row)).toBe(row.meetingUrl);
  });

  it("REFUSES a paid event — the proxy has no session and cannot check entitlement", () => {
    expect(
      publicJoinTarget({ status: "published", accessType: "paid" }, row),
    ).toBeNull();
  });

  it("refuses a cancelled event", () => {
    expect(publicJoinTarget({ status: "cancelled" }, row)).toBeNull();
  });

  it("returns null rather than inventing a target when no link is set", () => {
    expect(publicJoinTarget({ status: "published" }, null)).toBeNull();
    expect(publicJoinTarget({ status: "published" }, {})).toBeNull();
  });

  it("returns null for a missing event", () => {
    expect(publicJoinTarget(null, row)).toBeNull();
  });
});

describe("normalizeVideoUrl", () => {
  it("keeps http(s) links", () => {
    expect(normalizeVideoUrl("https://zoom.us/j/123")).toBe(
      "https://zoom.us/j/123",
    );
    expect(normalizeVideoUrl("  https://zoom.us/j/123  ")).toBe(
      "https://zoom.us/j/123",
    );
  });

  it("treats empty as clearing the link", () => {
    expect(normalizeVideoUrl("")).toBeUndefined();
    expect(normalizeVideoUrl("   ")).toBeUndefined();
    expect(normalizeVideoUrl(undefined)).toBeUndefined();
  });

  it("rejects anything that isn't http(s) — this value becomes a Location header", () => {
    // eslint-disable-next-line no-script-url
    expect(() => normalizeVideoUrl("javascript:alert(1)")).toThrow();
    expect(() => normalizeVideoUrl("data:text/html,hi")).toThrow();
    expect(() => normalizeVideoUrl("not a url")).toThrow();
  });

  it("rejects an absurdly long value", () => {
    expect(() => normalizeVideoUrl("https://x.com/" + "a".repeat(3000))).toThrow();
  });
});
