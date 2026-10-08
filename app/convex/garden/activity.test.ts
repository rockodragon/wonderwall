// Pure-logic tests for the operator activity feed. No Convex — plain
// fixtures, mirroring reports.test.ts's style.

import { describe, expect, it } from "vitest";
import {
  buildActivityFeed,
  classCreatedDescription,
  eventCreatedDescription,
  memberJoinedDescription,
  projectCreatedDescription,
  tableCreatedDescription,
  type ActivityItem,
} from "./activity";

function item(at: number, description = "did a thing"): ActivityItem {
  return { at, source: "project_created", actorName: "Someone", description };
}

describe("buildActivityFeed", () => {
  it("sorts newest first", () => {
    const feed = buildActivityFeed([item(100), item(300), item(200)]);
    expect(feed.map((i) => i.at)).toEqual([300, 200, 100]);
  });

  it("caps the feed, keeping the newest", () => {
    const feed = buildActivityFeed([item(1), item(2), item(3), item(4)], 2);
    expect(feed.map((i) => i.at)).toEqual([4, 3]);
  });

  it("leaves the caller's array untouched", () => {
    const input = [item(1), item(2)];
    buildActivityFeed(input);
    expect(input.map((i) => i.at)).toEqual([1, 2]);
  });

  it("renders an empty feed, not a throw — the page must work pre-launch", () => {
    expect(buildActivityFeed([])).toEqual([]);
  });
});

describe("descriptions", () => {
  it("separates a join from a request to join", () => {
    expect(memberJoinedDescription("active", "The Garden")).toBe("Joined The Garden");
    expect(memberJoinedDescription("pending", "The Garden")).toBe(
      "Requested to join The Garden",
    );
  });

  it("names what was made", () => {
    expect(projectCreatedDescription("Mural")).toBe("Started a project — Mural");
    expect(classCreatedDescription("Life Drawing")).toBe("Posted a class — Life Drawing");
    expect(tableCreatedDescription("Songwriters")).toBe("Started a Table — Songwriters");
    expect(eventCreatedDescription("Open Mic")).toBe("Hosting an event — Open Mic");
  });
});
