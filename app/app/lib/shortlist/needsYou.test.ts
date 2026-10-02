import { describe, expect, it } from "vitest";
import { calendarDayEnd } from "../dates";
import {
  DAY,
  NOW,
  amount,
  day,
  event,
  eventRequest,
  on,
  project,
  projectRequest,
  role,
  sampleShortlist,
  shortlist,
} from "./fixtures";
import {
  NEEDS_YOU_WINDOW_MS,
  closesAt,
  hasEnded,
  inNeedsYouWindow,
  isAppearance,
  needsYou,
  needsYouArea,
  needsYouKey,
  type NeedsYouItem,
} from "./needsYou";

/** "rule:title" per row, so an order reads at a glance. */
function summarize(items: NeedsYouItem[]): string[] {
  return items.map((item) => {
    switch (item.type) {
      case "project":
        return `${item.rule}:${item.row.role?.title ?? item.row.title}`;
      case "request":
        return `${item.rule}:${item.request.person.name} → ${item.request.on.title}`;
      case "event":
        return `${item.rule}:${item.event.title}`;
    }
  });
}

const END = NOW + NEEDS_YOU_WINDOW_MS;
const HOUR = 60 * 60 * 1000;

// Just before, at, and just after both ends of the window.
const EDGES = [
  { at: NOW - 1, inside: false, name: "a millisecond before now" },
  { at: NOW, inside: true, name: "exactly now" },
  { at: NOW + 1, inside: true, name: "a millisecond after now" },
  { at: END - 1, inside: true, name: "a millisecond before 7 days" },
  { at: END, inside: true, name: "exactly 7 days" },
  { at: END + 1, inside: false, name: "a millisecond after 7 days" },
];

describe("needsYou — the spec's sample member", () => {
  it("lists replies, then this week's events, then roles closing, each in order", () => {
    expect(summarize(needsYou(sampleShortlist(), NOW))).toEqual([
      "1:Sound Mixer",
      "1:Hana Cho → Hymns for the Commons",
      "2:Open Studio Night",
      "2:Printmaking Workshop",
      "3:Copy Editor",
    ]);
  });

  it("nothing qualifies on an empty shortlist", () => {
    expect(needsYou(shortlist(), NOW)).toEqual([]);
  });

  it("does not mutate the input", () => {
    const data = sampleShortlist();
    const before = JSON.stringify(data);
    needsYou(data, NOW);
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("needsYou — rule 1, someone waiting on your reply", () => {
  it("takes every invite and every request, project or event, and nothing else", () => {
    const data = shortlist({
      projects: [
        project("invited", "A", { role: role("Mixer") }),
        project("waiting", "B", { role: role("Editor") }),
        project("leading", "C", { pendingRequests: 2 }),
        project("team", "D"),
      ],
      requests: [projectRequest("Hana Cho", "C"), eventRequest("Ike Obi", "Zine Workshop", NOW + 30 * DAY)],
    });
    expect(summarize(needsYou(data, NOW))).toEqual(["1:Mixer", "1:Hana Cho → C", "1:Ike Obi → Zine Workshop"]);
  });

  it("puts paid invites first, then other invites, then requests, oldest first within each", () => {
    const data = shortlist({
      projects: [
        project("invited", "Passion old", { since: NOW - 9 * DAY }),
        project("invited", "Paid new", { kind: "paid", since: NOW - 1 * DAY }),
        project("invited", "Paid old", { kind: "paid", since: NOW - 5 * DAY }),
        project("invited", "Passion new", { since: NOW - 2 * DAY }),
      ],
      requests: [
        projectRequest("New Asker", "Mine", { kind: "paid", at: NOW - 1 * DAY }),
        eventRequest("Old Asker", "My Event", NOW + DAY, NOW - 20 * DAY),
      ],
    });
    expect(summarize(needsYou(data, NOW))).toEqual([
      "1:Paid old",
      "1:Paid new",
      "1:Passion old",
      "1:Passion new",
      "1:Old Asker → My Event",
      "1:New Asker → Mine",
    ]);
  });

  it("an invite needs you however long ago it came", () => {
    const data = shortlist({ projects: [project("invited", "Old", { since: NOW - 400 * DAY })] });
    expect(needsYou(data, NOW)).toHaveLength(1);
  });

  it("a request to attend an event that has ended drops; one on now, or a project's, stays", () => {
    const data = shortlist({
      requests: [
        eventRequest("Gone", "Last night", NOW - 2 * DAY),
        eventRequest("Late", "Ended an hour ago", NOW - 3 * HOUR, NOW - DAY, NOW - HOUR),
        eventRequest("Now", "On now", NOW - HOUR, NOW - DAY, NOW + HOUR),
        projectRequest("Old Asker", "Mine", { at: NOW - 400 * DAY }),
      ],
    });
    expect(summarize(needsYou(data, NOW))).toEqual(["1:Old Asker → Mine", "1:Now → On now"]);
  });
});

describe("needsYou — rule 2, an event you're going to or hosting this week", () => {
  it("takes going and hosting, not requested or saved", () => {
    const data = shortlist({
      events: [
        event("going", "Going", NOW + DAY),
        event("hosting", "Hosting", NOW + 2 * DAY),
        event("requested", "Requested", NOW + DAY),
        event("saved", "Saved", NOW + DAY),
      ],
    });
    expect(summarize(needsYou(data, NOW))).toEqual(["2:Going", "2:Hosting"]);
  });

  it("skips a cancelled event", () => {
    const data = shortlist({ events: [event("going", "Off", NOW + DAY, { cancelled: true })] });
    expect(needsYou(data, NOW)).toEqual([]);
  });

  it("orders soonest first", () => {
    const data = shortlist({
      events: [
        event("going", "Sat", NOW + 6 * DAY),
        event("hosting", "Tue", NOW + 3 * DAY),
        event("going", "Sun", NOW + 2 * DAY),
      ],
    });
    expect(summarize(needsYou(data, NOW))).toEqual(["2:Sun", "2:Tue", "2:Sat"]);
  });

  it.each(EDGES)("an event $name is in: $inside", ({ at, inside }) => {
    const data = shortlist({ events: [event("going", "Edge", at)] });
    expect(needsYou(data, NOW)).toHaveLength(inside ? 1 : 0);
  });

  it("an event that's on now is in until it ends", () => {
    const started = (endTime: number) => shortlist({ events: [event("hosting", "Open house", NOW - 2 * HOUR, { endTime })] });
    expect(needsYou(started(NOW + HOUR), NOW)).toHaveLength(1);
    expect(needsYou(started(NOW), NOW)).toHaveLength(1);
    expect(needsYou(started(NOW - 1), NOW)).toEqual([]);
  });

  it("an end time doesn't stretch the window: it's the start that has to come within the week", () => {
    const data = shortlist({ events: [event("going", "Retreat", END + 1, { endTime: END + 3 * DAY })] });
    expect(needsYou(data, NOW)).toEqual([]);
  });
});

describe("needsYou — rule 3, a saved role closing this week", () => {
  it("takes saved role rows only", () => {
    const soon = NOW + 2 * DAY;
    const data = shortlist({
      projects: [
        project("saved", "Zine", { role: role("Copy Editor", soon) }),
        project("saved", "Saved project, no role"),
        project("waiting", "Applied", { role: role("Illustrator", soon) }),
        project("team", "Joined", { role: role("Painter", soon) }),
        project("saved", "No date", { role: role("Open-ended") }),
      ],
    });
    expect(summarize(needsYou(data, NOW))).toEqual(["3:Copy Editor"]);
  });

  it("orders soonest to close first", () => {
    const data = shortlist({
      projects: [
        project("saved", "A", { role: role("Late", NOW + 6 * DAY) }),
        project("saved", "B", { role: role("Early", NOW + DAY) }),
      ],
    });
    expect(summarize(needsYou(data, NOW))).toEqual(["3:Early", "3:Late"]);
  });

  // neededBy is a calendar date: the role is open all that day, so the window
  // is measured to the day's end (calendarDayEnd).
  const OCT_7 = day(10, 7);
  const closesOct7 = shortlist({ projects: [project("saved", "Edge", { role: role("Edge", OCT_7) })] });
  const DAY_EDGES = [
    { now: calendarDayEnd(OCT_7) + 1, inside: false, name: "a millisecond after its day ends" },
    { now: calendarDayEnd(OCT_7), inside: true, name: "the last millisecond of its day" },
    { now: OCT_7 + 12 * HOUR, inside: true, name: "midday on its day" },
    { now: calendarDayEnd(OCT_7) - NEEDS_YOU_WINDOW_MS, inside: true, name: "exactly 7 days before its day ends" },
    { now: calendarDayEnd(OCT_7) - NEEDS_YOU_WINDOW_MS - 1, inside: false, name: "a millisecond more than 7 days before" },
  ];

  it.each(DAY_EDGES)("a role due Oct 7, $name: $inside", ({ now, inside }) => {
    expect(needsYou(closesOct7, now)).toHaveLength(inside ? 1 : 0);
  });
});

describe("needsYou — rule order", () => {
  it("keeps rules 1, 2, 3 apart even when a later rule's date comes first", () => {
    const data = shortlist({
      projects: [
        project("saved", "Zine", { role: role("Closing now", NOW) }),
        project("invited", "Gig", { kind: "paid", role: role("Invite"), pay: amount(500), since: NOW }),
      ],
      events: [event("hosting", "Party", NOW + 5 * DAY)],
    });
    expect(needsYou(data, NOW).map((item) => item.rule)).toEqual([1, 2, 3]);
  });
});

describe("hasEnded — the one rule for over", () => {
  it.each([
    { at: NOW - 1, ended: true, name: "started a millisecond ago, no end time" },
    { at: NOW, ended: false, name: "starts now, no end time" },
    { at: NOW + 1, ended: false, name: "starts in a millisecond" },
  ])("$name: $ended", ({ at, ended }) => {
    expect(hasEnded(event("going", "E", at), NOW)).toBe(ended);
  });

  it.each([
    { endTime: NOW - 1, ended: true },
    { endTime: NOW, ended: false },
    { endTime: NOW + 1, ended: false },
  ])("started an hour ago, ending at now$endTime: $ended", ({ endTime, ended }) => {
    expect(hasEnded(event("going", "E", NOW - HOUR, { endTime }), NOW)).toBe(ended);
  });

  it("reads a request's event the same way", () => {
    const request = eventRequest("A", "E", NOW - HOUR, NOW - DAY, NOW + HOUR);
    expect(request.on.type === "event" && hasEnded(request.on, NOW)).toBe(false);
  });
});

describe("inNeedsYouWindow", () => {
  it("is a week long", () => {
    expect(NEEDS_YOU_WINDOW_MS).toBe(7 * DAY);
  });

  it.each(EDGES)("$name: $inside", ({ at, inside }) => {
    expect(inNeedsYouWindow(at, NOW)).toBe(inside);
  });
});

describe("helpers", () => {
  it("isAppearance: going or hosting, and not cancelled", () => {
    expect(isAppearance(event("going", "A", NOW))).toBe(true);
    expect(isAppearance(event("hosting", "A", NOW))).toBe(true);
    expect(isAppearance(event("requested", "A", NOW))).toBe(false);
    expect(isAppearance(event("saved", "A", NOW))).toBe(false);
    expect(isAppearance(event("going", "A", NOW, { cancelled: true }))).toBe(false);
  });

  it("closesAt: a saved role's neededBy, else null", () => {
    expect(closesAt(project("saved", "A", { role: role("R", on(10, 7)) }))).toBe(on(10, 7));
    expect(closesAt(project("saved", "A"))).toBeNull();
    expect(closesAt(project("waiting", "A", { role: role("R", on(10, 7)) }))).toBeNull();
  });

  it("needsYouArea: a request sits with what it's on", () => {
    const [invite, projectAsk, eventAsk, show] = needsYou(
      shortlist({
        projects: [project("invited", "A")],
        requests: [projectRequest("P", "Mine", { at: NOW - 2 * DAY }), eventRequest("E", "Party", NOW + DAY)],
        events: [event("going", "Show", NOW + DAY)],
      }),
      NOW,
    );
    expect([invite, projectAsk, eventAsk, show].map(needsYouArea)).toEqual([
      "projects",
      "projects",
      "events",
      "events",
    ]);
  });

  it("needsYouKey: the row's own key", () => {
    const data = sampleShortlist();
    expect(needsYou(data, NOW).map(needsYouKey)).toEqual([
      "invited:hollow-creek-field-recordings:sound-mixer",
      "request:project:hana-cho-hymns-for-the-commons",
      "going:open-studio-night",
      "going:printmaking-workshop",
      "saved:psalms-zine-vol-3:copy-editor",
    ]);
  });
});
