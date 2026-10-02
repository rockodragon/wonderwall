import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ACTION_LABEL_MAX as SERVER_ACTION_LABEL_MAX,
  BODY_MAX as SERVER_BODY_MAX,
  NEW_FOR_DAYS_DEFAULT as SERVER_DAYS_DEFAULT,
  NEW_FOR_DAYS_MAX as SERVER_DAYS_MAX,
  NEW_FOR_DAYS_MIN as SERVER_DAYS_MIN,
  TITLE_MAX as SERVER_TITLE_MAX,
  cleanUpdateFields,
  isValidActionUrl,
} from "../../convex/updates";
import {
  ACTION_LABEL_MAX,
  BODY_MAX,
  NEW_FOR_DAYS_DEFAULT,
  NEW_FOR_DAYS_MAX,
  NEW_FOR_DAYS_MIN,
  TITLE_MAX,
  actionTarget,
  audienceLabel,
  datesLabel,
  emptyForm,
  formFrom,
  fromLocalInput,
  nextOrder,
  peopleLabel,
  saveArgs,
  sentLabel,
  statsLine,
  statusWord,
  toLocalInput,
  updateCardId,
  updateIdOf,
  type FormSource,
} from "./updates";

const HOUR = 3_600_000;
const NOW = new Date(2026, 9, 1, 9, 30).getTime();

describe("the limits", () => {
  it("match the server's", () => {
    expect(TITLE_MAX).toBe(SERVER_TITLE_MAX);
    expect(BODY_MAX).toBe(SERVER_BODY_MAX);
    expect(ACTION_LABEL_MAX).toBe(SERVER_ACTION_LABEL_MAX);
    expect(NEW_FOR_DAYS_DEFAULT).toBe(SERVER_DAYS_DEFAULT);
    expect(NEW_FOR_DAYS_MIN).toBe(SERVER_DAYS_MIN);
    expect(NEW_FOR_DAYS_MAX).toBe(SERVER_DAYS_MAX);
  });
});

describe("card ids", () => {
  it("round-trip an Update's id", () => {
    expect(updateCardId("abc123")).toBe("update:abc123");
    expect(updateIdOf("update:abc123")).toBe("abc123");
  });

  it("read no Update out of any other card", () => {
    for (const id of ["event:abc", "project:abc", "person:abc", "fund", "grant", "update:", "", null, undefined]) {
      expect(updateIdOf(id), String(id)).toBeNull();
    }
  });
});

describe("the button's target", () => {
  it("follows an in-app path in the app", () => {
    expect(actionTarget("/events/abc")).toEqual({ kind: "app", href: "/events/abc" });
    expect(actionTarget("/today?view=people")).toEqual({ kind: "app", href: "/today?view=people" });
  });

  it("opens an https link as another site", () => {
    expect(actionTarget("https://example.com/a?b=1")).toEqual({ kind: "external", href: "https://example.com/a?b=1" });
  });
});

describe("audienceLabel", () => {
  it("says who, plainly", () => {
    expect(audienceLabel({ audience: "everyone" })).toBe("Everyone");
    expect(audienceLabel({ audience: "community" }, "The Garden")).toBe("The Garden");
    expect(audienceLabel({ audience: "community" })).toBe("A community");
    expect(audienceLabel({ audience: "new", newForDays: 7 })).toBe("New members, first 7 days");
    expect(audienceLabel({ audience: "new" })).toBe("New members, first 14 days");
    expect(audienceLabel({ audience: "new", newForDays: 1 })).toBe("New members, first 1 day");
  });
});

describe("the list's lines", () => {
  it("prints the stats the way the spec does", () => {
    expect(statsLine({ opened: 12, clicked: 3, archived: 10, audienceNow: 40 })).toBe("Opened 12 · Clicked 3 · Archived 10 of 40");
  });

  it("counts people", () => {
    expect(peopleLabel(0)).toBe("0 people");
    expect(peopleLabel(1)).toBe("1 person");
    expect(peopleLabel(1280)).toBe("1,280 people");
  });

  it("says when it was sent and to how many", () => {
    expect(sentLabel(40, new Date(2026, 9, 2, 8).getTime())).toBe("Sent to 40 · Oct 2");
    expect(sentLabel(undefined, new Date(2026, 9, 2, 8).getTime())).toBe("Sent to 0 · Oct 2");
  });

  it("prints the dates with and without an end", () => {
    const starts = new Date(2026, 9, 1, 9, 0).getTime();
    const ends = new Date(2026, 9, 8, 17, 0).getTime();
    expect(datesLabel(starts)).toMatch(/^From Oct 1, 9:00\s?AM$/);
    expect(datesLabel(starts, ends)).toMatch(/^Oct 1, 9:00\s?AM → Oct 8, 5:00\s?PM$/);
    expect(datesLabel(starts, null)).toBe(datesLabel(starts));
  });
});

describe("statusWord", () => {
  it("names a draft and an archived Update by their status", () => {
    expect(statusWord({ status: "draft", startsAt: NOW - HOUR }, NOW)).toBe("Draft");
    expect(statusWord({ status: "archived", startsAt: NOW - HOUR }, NOW)).toBe("Archived");
  });

  it("calls a published Update live only inside its dates", () => {
    expect(statusWord({ status: "published", startsAt: NOW - HOUR }, NOW)).toBe("Published");
    expect(statusWord({ status: "published", startsAt: NOW - HOUR, endsAt: NOW + HOUR }, NOW)).toBe("Published");
    expect(statusWord({ status: "published", startsAt: NOW + HOUR }, NOW)).toBe("Scheduled");
    expect(statusWord({ status: "published", startsAt: NOW - 2 * HOUR, endsAt: NOW - HOUR }, NOW)).toBe("Ended");
    expect(statusWord({ status: "published", startsAt: NOW - 2 * HOUR, endsAt: NOW }, NOW)).toBe("Ended");
  });
});

describe("the date inputs", () => {
  it("write a time the input understands and read it back", () => {
    const value = toLocalInput(NOW);
    expect(value).toBe("2026-10-01T09:30");
    expect(fromLocalInput(value)).toBe(NOW);
  });

  it("read nothing from an empty or bad value", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("  ")).toBeNull();
    expect(fromLocalInput("soon")).toBeNull();
  });
});

describe("the form", () => {
  const source: FormSource = {
    title: "Welcome",
    body: "Hello.",
    imageStorageId: "storage1" as Id<"_storage">,
    imageUrl: "https://img/welcome.jpg",
    actionLabel: "Meet people",
    actionUrl: "/today?view=people",
    audience: "community",
    hostOrgId: "org1" as Id<"hostOrgs">,
    newForDays: null,
    startsAt: NOW,
    endsAt: NOW + 24 * HOUR,
    order: 3,
  };

  it("starts a new Update to everyone, from now, after the others", () => {
    const form = emptyForm(NOW, 5);
    expect(form).toMatchObject({ title: "", body: "", audience: "everyone", newForDays: "14", endsAt: "", order: "5", imageStorageId: null });
    expect(form.startsAt).toBe("2026-10-01T09:30");
  });

  it("fills from a saved Update", () => {
    const form = formFrom(source);
    expect(form).toMatchObject({
      title: "Welcome",
      imageStorageId: "storage1",
      imageUrl: "https://img/welcome.jpg",
      actionLabel: "Meet people",
      audience: "community",
      hostOrgId: "org1",
      newForDays: "14",
      endsAt: "2026-10-02T09:30",
      order: "3",
    });
  });

  it("saves what it holds, with the picture kept", () => {
    const result = saveArgs(formFrom(source), "update1" as Id<"updates">);
    expect(result).toEqual({
      ok: true,
      args: {
        updateId: "update1",
        title: "Welcome",
        body: "Hello.",
        imageStorageId: "storage1",
        actionLabel: "Meet people",
        actionUrl: "/today?view=people",
        audience: "community",
        hostOrgId: "org1",
        startsAt: NOW,
        endsAt: NOW + 24 * HOUR,
        order: 3,
      },
    });
  });

  it("leaves out what is empty, so an edit clears it", () => {
    const form = { ...emptyForm(NOW, 1), title: "T", body: "B" };
    const result = saveArgs(form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args).toEqual({
      updateId: undefined,
      title: "T",
      body: "B",
      imageStorageId: undefined,
      actionLabel: undefined,
      actionUrl: undefined,
      audience: "everyone",
      startsAt: NOW,
      endsAt: undefined,
      order: 1,
    });
  });

  it("sends the community only to a community, and the days only to 'new'", () => {
    const base = { ...emptyForm(NOW, 1), title: "T", body: "B", hostOrgId: "org1", newForDays: "7" };
    const everyone = saveArgs({ ...base, audience: "everyone" });
    const community = saveArgs({ ...base, audience: "community" });
    const fresh = saveArgs({ ...base, audience: "new" });
    if (!everyone.ok || !community.ok || !fresh.ok) throw new Error("expected all three to save");
    expect(everyone.args).not.toHaveProperty("hostOrgId");
    expect(everyone.args).not.toHaveProperty("newForDays");
    expect(community.args.hostOrgId).toBe("org1");
    expect(community.args).not.toHaveProperty("newForDays");
    expect(fresh.args.newForDays).toBe(7);
    expect(fresh.args).not.toHaveProperty("hostOrgId");
  });

  it("leaves a missing community for the server to name", () => {
    const result = saveArgs({ ...emptyForm(NOW, 1), title: "T", body: "B", audience: "community" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args).not.toHaveProperty("hostOrgId");
    expect(() => cleanUpdateFields(result.args)).toThrow();
  });

  it("stops at a date or a number it can't read", () => {
    const base = { ...emptyForm(NOW, 1), title: "T", body: "B" };
    expect(saveArgs({ ...base, startsAt: "" })).toEqual({ ok: false, message: "Pick a start." });
    expect(saveArgs({ ...base, endsAt: "later" })).toEqual({ ok: false, message: "Pick an end." });
    expect(saveArgs({ ...base, order: "" })).toEqual({ ok: false, message: "Order must be a number." });
    expect(saveArgs({ ...base, audience: "new", newForDays: "" })).toEqual({ ok: false, message: "Days must be a number." });
  });

  it("stays inside what the server accepts", () => {
    const form = { ...emptyForm(NOW, 1), title: "T".repeat(TITLE_MAX), body: "B".repeat(BODY_MAX), actionLabel: "L".repeat(ACTION_LABEL_MAX), actionUrl: "/events" };
    const result = saveArgs(form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(() => cleanUpdateFields(result.args)).not.toThrow();
    expect(isValidActionUrl("/events")).toBe(true);
  });
});

describe("nextOrder", () => {
  it("starts at 1 and then goes after the last", () => {
    expect(nextOrder([])).toBe(1);
    expect(nextOrder([{ order: 1 }, { order: 4 }, { order: 2 }])).toBe(5);
  });
});
