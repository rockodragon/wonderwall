import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPendingIntent, takePendingIntent } from "./pendingIntent";
import { isStage } from "./stage";
import {
  SHARE_PROJECT_PATH,
  START_STAGES,
  dropShareProjectIntent,
  ownsAProject,
  readStartStage,
  spendStartLink,
  withFinishedStage,
  hasNameIfNeeded,
  isShareProjectIntent,
  keepProfileFields,
  roleForExit,
  shareProjectHref,
  stashProjectTitle,
  takeStashedProjectTitle,
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

describe("roleForExit", () => {
  it("records a partner for the space-or-resources door", () => {
    expect(roleForExit("partner")).toBe("partner");
  });
  it("records a creative for sharing and for Not yet", () => {
    expect(roleForExit("shared")).toBe("creative");
    expect(roleForExit("not_yet")).toBe("creative");
  });

  it("records a patron for someone here to back creatives", () => {
    expect(roleForExit("backer")).toBe("patron");
  });
});

describe("hasNameIfNeeded", () => {
  it("asks for nothing when the account has a name", () => {
    expect(hasNameIfNeeded(false, "")).toBe(true);
  });

  it("asks for a real name when it has none", () => {
    expect(hasNameIfNeeded(true, "")).toBe(false);
    expect(hasNameIfNeeded(true, "  ")).toBe(false);
    expect(hasNameIfNeeded(true, "Ana")).toBe(true);
  });
});

describe("keepProfileFields", () => {
  it("passes back what the screen doesn't ask about, so saving can't blank it", () => {
    const address = { city: "San Diego", stateCode: "CA" };
    const coordinates = { lat: 32.7, lng: -117.1 };
    const profile = {
      name: "Not passed back",
      bio: "Painter",
      location: "San Diego, CA",
      locationType: "city",
      address,
      coordinates,
      placeId: "abc",
    };
    expect(keepProfileFields(profile)).toEqual({
      bio: "Painter",
      location: "San Diego, CA",
      locationType: "city",
      address,
      coordinates,
      placeId: "abc",
    });
  });

  it("passes back nothing for a profile with none of it", () => {
    expect(keepProfileFields({})).toEqual({
      bio: undefined,
      location: undefined,
      locationType: undefined,
      address: undefined,
      coordinates: undefined,
      placeId: undefined,
    });
  });
});

describe("stashed project title", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
  });

  it("carries a typed title through the stash, once", () => {
    expect(stashProjectTitle("  Mural on 5th & Main ")).toBe(true);
    expect(isShareProjectIntent(localStorage.getItem("pendingIntent"))).toBe(true);
    expect(takeStashedProjectTitle()).toBe("Mural on 5th & Main");
    expect(takeStashedProjectTitle()).toBeNull();
  });

  it("stashes nothing for an empty title", () => {
    expect(stashProjectTitle("   ")).toBe(false);
    expect(localStorage.getItem("pendingIntent")).toBeNull();
  });

  it("puts back a stashed visit that has no title", () => {
    setPendingIntent("/events/abc");
    expect(takeStashedProjectTitle()).toBeNull();
    expect(takePendingIntent()).toBe("/events/abc");
    expect(hasStashedProjectTitle(SHARE_PROJECT_PATH)).toBe(false);
    expect(hasStashedProjectTitle(`${SHARE_PROJECT_PATH}&title=x`)).toBe(true);
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

describe("spendStartLink", () => {
  const spend = (query: string) => {
    const { stage, rest } = spendStartLink(new URLSearchParams(query));
    return { stage, rest: rest.toString() };
  };

  it("hands the form the start stage and leaves neither ?new nor ?stage in the URL", () => {
    expect(spend("new=project&stage=completed")).toEqual({ stage: "completed", rest: "" });
    expect(spend("new=project&stage=working")).toEqual({ stage: "working", rest: "" });
  });

  it("keeps every other param, such as the chip and a typed title", () => {
    expect(spend("show=people&new=project&stage=completed&title=Zine")).toEqual({
      stage: "completed",
      rest: "show=people&title=Zine",
    });
  });

  it("has no start stage when the link names none, or one a project can't be in", () => {
    expect(spend("new=project")).toEqual({ stage: undefined, rest: "" });
    expect(spend("new=project&stage=finished")).toEqual({ stage: undefined, rest: "" });
  });

  it("leaves a ?stage= with no start link alone: that is the Stage menu's own choice", () => {
    expect(spend("stage=completed")).toEqual({ stage: undefined, rest: "stage=completed" });
    expect(spend("show=funding&stage=working")).toEqual({ stage: undefined, rest: "show=funding&stage=working" });
  });

  it("does not change the params it was given", () => {
    const params = new URLSearchParams("new=project&stage=completed");
    spendStartLink(params);
    expect(params.toString()).toBe("new=project&stage=completed");
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
