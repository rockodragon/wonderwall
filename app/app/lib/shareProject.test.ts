import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPendingIntent, takePendingIntent } from "./pendingIntent";
import { isStage } from "./stage";
import {
  SHARE_PROJECT_PATH,
  START_STAGES,
  dropShareProjectIntent,
  ownsAProject,
  peekStashedProjectTitle,
  readStartStage,
  withFinishedStage,
  isShareProjectIntent,
  shareProjectHref,
  stashProjectTitle,
  hasStashedProjectTitle,
} from "./shareProject";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("shareProjectHref", () => {
  it("opens the project form for someone with an account", () => {
    expect(shareProjectHref(true)).toBe("/projects?new=project");
  });

  it("asks a signed-out visitor to create an account, not sign in", () => {
    const href = shareProjectHref(false);
    expect(href.startsWith("/signup?")).toBe(true);
    expect(href).not.toContain("/login");
  });

  it("carries the project form as the visit to come back to", () => {
    const query = shareProjectHref(false).split("?").slice(1).join("?");
    expect(new URLSearchParams(query).get("redirect")).toBe(SHARE_PROJECT_PATH);
  });
});

describe("isShareProjectIntent", () => {
  it("recognises the start-a-project visit", () => {
    expect(isShareProjectIntent("/projects?new=project")).toBe(true);
    expect(isShareProjectIntent("/projects?new=project&show=work")).toBe(true);
  });

  it("leaves every other visit alone", () => {
    expect(isShareProjectIntent("/projects")).toBe(false);
    expect(isShareProjectIntent("/projects?new=hire")).toBe(false);
    expect(isShareProjectIntent("/projects/abc?new=project")).toBe(false);
    expect(isShareProjectIntent("/join?level=seat")).toBe(false);
    expect(isShareProjectIntent(null)).toBe(false);
    expect(isShareProjectIntent("")).toBe(false);
  });
});

describe("dropShareProjectIntent", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
  });

  it("drops a stashed start-a-project visit", () => {
    setPendingIntent("/projects?new=project");
    dropShareProjectIntent();
    expect(takePendingIntent()).toBeNull();
  });

  it("keeps any other stashed visit", () => {
    setPendingIntent("/join?level=seat");
    dropShareProjectIntent();
    expect(takePendingIntent()).toBe("/join?level=seat");
  });

  it("does nothing when nothing is stashed", () => {
    expect(() => dropShareProjectIntent()).not.toThrow();
    expect(takePendingIntent()).toBeNull();
  });
});

describe("START_STAGES", () => {
  it("offers Thinking about it, Working on it and Finished it, as Planning, Working and Completed", () => {
    expect(START_STAGES.map((s) => [s.label, s.value])).toEqual([
      ["Thinking about it", "planning"],
      ["Working on it", "working"],
      ["Finished it", "completed"],
    ]);
  });

  it("only offers stages a project can be in", () => {
    for (const s of START_STAGES) expect(isStage(s.value)).toBe(true);
  });
});

describe("stashed project title", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
  });

  it("carries a typed title through the stash, until the member leaves", () => {
    expect(stashProjectTitle("  Mural on 5th & Main ")).toBe(true);
    expect(isShareProjectIntent(localStorage.getItem("pendingIntent"))).toBe(true);
    // Read as often as a reload needs; nothing is used up.
    expect(peekStashedProjectTitle()).toBe("Mural on 5th & Main");
    expect(peekStashedProjectTitle()).toBe("Mural on 5th & Main");
    dropShareProjectIntent();
    expect(peekStashedProjectTitle()).toBeNull();
  });

  it("stashes nothing for an empty title", () => {
    expect(stashProjectTitle("   ")).toBe(false);
    expect(localStorage.getItem("pendingIntent")).toBeNull();
  });

  it("reads nothing, and moves nothing, when the stashed visit has no title", () => {
    setPendingIntent("/events/abc");
    expect(peekStashedProjectTitle()).toBeNull();
    expect(takePendingIntent()).toBe("/events/abc");
    setPendingIntent(SHARE_PROJECT_PATH);
    expect(peekStashedProjectTitle()).toBeNull();
    expect(takePendingIntent()).toBe(SHARE_PROJECT_PATH);
    expect(hasStashedProjectTitle(SHARE_PROJECT_PATH)).toBe(false);
    expect(hasStashedProjectTitle(`${SHARE_PROJECT_PATH}&title=x`)).toBe(true);
  });

  it("reads nothing when nothing is stashed", () => {
    expect(peekStashedProjectTitle()).toBeNull();
  });
});

describe("withFinishedStage / readStartStage", () => {
  it("puts ?stage=completed on the form's link, whatever it already carries", () => {
    expect(withFinishedStage(SHARE_PROJECT_PATH)).toBe("/projects?new=project&stage=completed");
    expect(withFinishedStage("/today?create=project")).toBe("/today?create=project&stage=completed");
    expect(withFinishedStage("/today")).toBe("/today?stage=completed");
  });

  it("reads back only a stage a project can be in", () => {
    expect(readStartStage(new URLSearchParams("new=project&stage=completed"))).toBe("completed");
    expect(readStartStage(new URLSearchParams("stage=working"))).toBe("working");
    expect(readStartStage(new URLSearchParams("stage=finished"))).toBeUndefined();
    expect(readStartStage(new URLSearchParams("new=project"))).toBeUndefined();
  });
});

describe("ownsAProject", () => {
  const me = { userId: "u-me" };
  it("is unknown while the list or the profile is loading, or signed out", () => {
    expect(ownsAProject(undefined, me)).toBeNull();
    expect(ownsAProject([], undefined)).toBeNull();
    expect(ownsAProject([], null)).toBeNull();
  });

  it("is true only for a project this member leads, finished or not", () => {
    expect(ownsAProject([], me)).toBe(false);
    expect(ownsAProject([{ userId: "u-other" }], me)).toBe(false);
    expect(ownsAProject([{ userId: "u-other" }, { userId: "u-me" }], me)).toBe(true);
  });
});
