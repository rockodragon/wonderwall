import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPendingIntent, takePendingIntent } from "./pendingIntent";
import { isStage } from "./stage";
import {
  SHARE_PROJECT_PATH,
  START_STAGES,
  dropShareProjectIntent,
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
  it("offers Thinking about it and Working on it, as Planning and Working", () => {
    expect(START_STAGES.map((s) => [s.label, s.value])).toEqual([
      ["Thinking about it", "planning"],
      ["Working on it", "working"],
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
