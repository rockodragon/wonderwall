import { describe, expect, it } from "vitest";
import { formatMoney } from "../../garden/ui";
import {
  NOW,
  PROPOSALS,
  VOLUNTEER,
  amount,
  day,
  event,
  eventRequest,
  follow,
  on,
  project,
  projectRequest,
  range,
  role,
} from "../../lib/shortlist/fixtures";
import type { ClosedReason } from "../../lib/shortlist/types";
import type { ShortlistItem } from "./items";
import { KIND_LABEL, addressName, eventWhen, rowModel, whenLabel, type RowContext } from "./rowModel";

// Fri Oct 2, noon: the clock the day words are told from.
const CALM: RowContext = { hot: false, withArea: false, now: NOW, money: formatMoney };
const HOT: RowContext = { ...CALM, hot: true };

const row = (item: ShortlistItem, ctx: RowContext = CALM) => rowModel(item, ctx);
const p = (r: ReturnType<typeof project>): ShortlistItem => ({ type: "project", row: r });

describe("a role row", () => {
  const invite = project("invited", "Hollow Creek Field Recordings", {
    kind: "paid",
    role: role("Sound Mixer"),
    lead: { name: "Mara Lin", profileId: "mara-lin" },
    pay: amount(1200),
    since: on(9, 30),
  });

  it("reads the role, who invited you to which project, what to do, and its pay", () => {
    expect(row(p(invite), HOT)).toEqual({
      id: "role:sound-mixer",
      title: "Sound Mixer",
      sub: "Mara invited you · Hollow Creek Field Recordings",
      meta: "$1,200",
      status: "Reply to invite",
      thumb: { kind: "cover", url: null, seed: "hollow-creek-field-recordings" },
      action: "Reply",
      hot: true,
      past: false,
    });
  });

  it("names the lead by first name, and doesn't say the project twice when the invite has no role", () => {
    const bare = project("invited", "Hollow Creek Field Recordings", { lead: { name: "Mara Lin", profileId: "mara-lin" } });
    expect(row(p(bare), HOT)).toMatchObject({ title: "Hollow Creek Field Recordings", sub: "Mara invited you", status: "Reply to invite" });
    const unnamed = project("invited", "Hollow Creek", { role: role("Sound Mixer"), lead: { name: "New User", profileId: null } });
    expect(row(p(unnamed), HOT).sub).toBe("New User invited you · Hollow Creek");
  });

  it("offers its action only in Needs you", () => {
    expect(row(p(invite)).action).toBeNull();
    expect(row(p(invite)).hot).toBe(false);
  });

  it("says Apply on a saved role that closes soon: the project and pay, then when to apply by", () => {
    const saved = project("saved", "Psalms Zine", { role: role("Copy Editor", on(10, 7)), pay: amount(300) });
    expect(row(p(saved), HOT)).toMatchObject({
      title: "Copy Editor",
      sub: "Psalms Zine · $300",
      status: "Apply by Oct 7",
      meta: null,
      action: "Apply",
    });
  });

  it("says only when a saved role closes while it's not in Needs you, with its pay in the meta", () => {
    const saved = project("saved", "Psalms Zine", { role: role("Copy Editor", on(10, 20)), pay: amount(300), lead: { name: "Jo Alvarez", profileId: "j" } });
    expect(row(p(saved))).toMatchObject({ sub: "Paid · Psalms Zine · Jo Alvarez", status: "Closes Oct 20", meta: "$300", action: null });
  });

  it("reads the closing date as the calendar date it's stored as, west of UTC too", () => {
    // neededBy is that day's UTC midnight: the evening before in Los Angeles.
    const zone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const saved = project("saved", "Psalms Zine", { role: role("Copy Editor", day(10, 7)) });
      expect(row(p(saved)).status).toBe("Closes Oct 7");
      expect(row(p(saved), HOT).status).toBe("Apply by Oct 7");
    } finally {
      process.env.TZ = zone;
    }
  });

  it("writes pay in budgetLabel's words", () => {
    const pays = [range(1500, 2000), VOLUNTEER, PROPOSALS, { budgetType: "confidential" }];
    expect(pays.map((pay) => row(p(project("team", "X", { role: role("R"), pay }))).meta)).toEqual([
      "$1,500–2,000",
      "Volunteer",
      "Open to proposals",
      "Confidential",
    ]);
  });
});

describe("a project row", () => {
  it("says You lead, and how many requests wait", () => {
    expect(row(p(project("leading", "Hymns", { pendingRequests: 1 })))).toMatchObject({
      id: "project:hymns",
      title: "Hymns",
      sub: "Passion · You lead",
      status: "1 request waiting",
    });
    expect(row(p(project("leading", "Hymns", { pendingRequests: 3 }))).status).toBe("3 requests waiting");
    expect(row(p(project("leading", "Hymns"))).status).toBe("No requests waiting");
  });

  it("shows the stage where there's no pay", () => {
    expect(row(p(project("saved", "Icons", { stage: "raising" }))).meta).toBe("Raising");
    expect(row(p(project("saved", "Icons"))).meta).toBeNull();
  });

  it("names who runs a project you back or saved", () => {
    expect(row(p(project("backing", "Long Table", { lead: { name: "Esther Park", profileId: null } }))).sub).toBe("Passion · by Esther Park");
  });

  it("says what you back, in the app's money", () => {
    const backed = (backing: { amountCents: number | null; recurring: boolean }) => row(p(project("backing", "X", { backing }))).status;
    expect(backed({ amountCents: 1500, recurring: true })).toBe("Backing $15 recurring");
    expect(backed({ amountCents: 5000, recurring: false })).toBe("Backed $50");
    expect(backed({ amountCents: null, recurring: false })).toBe("Backing");
  });

  it("says who you're waiting on, by first name", () => {
    const waiting = project("waiting", "Films", { role: role("Motion Designer"), lead: { name: "Theo Okafor", profileId: "t" }, since: on(9, 27) });
    expect(row(p(waiting)).status).toBe("Waiting on Theo since Sep 27");
  });

  it("says when a saved project was saved, with no date to close by", () => {
    expect(row(p(project("saved", "Quiet Hours", { since: on(9, 24) }))).status).toBe("Saved Sep 24");
  });

  it("says why something closed, folded quiet", () => {
    const reasons: ClosedReason[] = ["declined", "withdrawn", "left", "removed", "finished", "filled"];
    expect(reasons.map((closedReason) => row(p(project("closed", "X", { closedReason })), { ...CALM, past: true }).status)).toEqual([
      "Declined",
      "Withdrawn",
      "You left",
      "Removed",
      "Finished",
      "Filled",
    ]);
    expect(row(p(project("closed", "X")), { ...CALM, past: true }).past).toBe(true);
  });

  it("wears its cover, or the project's abstract one", () => {
    expect(row(p(project("team", "X", { coverUrl: "https://img/x.jpg" }))).thumb).toEqual({ kind: "cover", url: "https://img/x.jpg", seed: "x" });
  });
});

describe("a request row", () => {
  it("names who's asking, to join what as what, the choice to make, and when they asked", () => {
    const request = projectRequest("Hana Cho", "Hymns for the Commons", { roleTitle: "Cellist", pay: VOLUNTEER, at: on(9, 30) });
    expect(row({ type: "request", request }, HOT)).toEqual({
      id: "request:hana-cho-hymns-for-the-commons",
      title: "Hana Cho",
      sub: "Wants to join Hymns for the Commons as Cellist",
      meta: "asked Sep 30",
      status: "Approve or decline",
      thumb: { kind: "face", name: "Hana Cho", url: null },
      action: "Review",
      hot: true,
      past: false,
    });
  });

  it("asks to come to an event you host: which event and when it is, then when they asked", () => {
    // Rick's case: a request asked Sep 28 about an event on Nov 6.
    const request = eventRequest("Sam Ito", "Winter Open Mic", on(11, 6, 19), on(9, 28));
    expect(row({ type: "request", request }, { ...HOT, withArea: true })).toMatchObject({
      sub: "Wants to attend Winter Open Mic · Nov 6",
      status: "Approve or decline",
      meta: "asked Sep 28",
      action: "Review",
    });
  });

  it("tells the event's day in words when it's near, so the two dates never read alike", () => {
    const ask = (datetime: number) => row({ type: "request", request: eventRequest("Sam Ito", "Zine", datetime, on(9, 28)) }, HOT).sub;
    expect(ask(on(10, 2, 19))).toBe("Wants to attend Zine · Today");
    expect(ask(on(10, 3, 19))).toBe("Wants to attend Zine · Tomorrow");
    expect(ask(on(10, 6, 19))).toBe("Wants to attend Zine · Tue");
  });

  it("is the same in a calm list: a request is always the member's to decide", () => {
    const request = projectRequest("Hana Cho", "Hymns", { roleTitle: "Cellist", at: on(9, 30) });
    expect(row({ type: "request", request })).toMatchObject({ status: "Approve or decline", meta: "asked Sep 30", action: null, hot: false });
  });
});

describe("an event row", () => {
  const studio = event("going", "Open Studio Night", on(10, 3, 19), { location: "Light Church, 123 Main St", goingCount: 24 });

  it("reads its date block, how you're in and the venue, when, and how many are going", () => {
    expect(row({ type: "event", event: studio })).toEqual({
      id: "event:open-studio-night",
      title: "Open Studio Night",
      sub: "Going · Light Church",
      meta: "24 going",
      status: "Tomorrow · 7PM",
      thumb: { kind: "date", month: "OCT", day: "3" },
      action: null,
      hot: false,
      past: false,
    });
  });

  it("says it to you in Needs you: you're going, the venue, then when to show up", () => {
    expect(row({ type: "event", event: studio }, { ...HOT, withArea: true })).toMatchObject({
      sub: "You're going · Light Church",
      status: "Tomorrow · 7PM",
      meta: "24 going",
      action: null,
    });
    const hosting = event("hosting", "Songwriters Circle", on(10, 2, 19), { location: "The Press Room, 22 Elm St", goingCount: 12 });
    expect(row({ type: "event", event: hosting }, HOT)).toMatchObject({
      sub: "You're hosting · The Press Room",
      status: "Today · 7PM",
      meta: "12 going",
    });
  });

  it("says the date once, in the block, and the time once, in the status", () => {
    const { title, sub, meta, status, thumb } = row({ type: "event", event: studio }, HOT);
    expect(thumb).toEqual({ kind: "date", month: "OCT", day: "3" });
    expect([title, sub, meta].join(" ")).not.toMatch(/Oct|7PM/);
    expect(status).not.toMatch(/Oct/);
    expect(`${sub} ${status}`.match(/7PM/g)).toHaveLength(1);
  });

  it("names the weekday inside the week, and leaves the date to the block beyond it", () => {
    const when = (datetime: number) => row({ type: "event", event: event("going", "Salon", datetime) }).status;
    expect(when(on(10, 2, 19))).toBe("Today · 7PM");
    expect(when(on(10, 3, 19))).toBe("Tomorrow · 7PM");
    expect(when(on(10, 8, 18))).toBe("Thu · 6PM");
    expect(when(on(10, 15, 18))).toBe("6PM");
    expect(when(on(11, 8, 20))).toBe("8PM");
  });

  it("gives the same line outside Needs you: the relation, the venue, then the day word and time", () => {
    const at = (relation: "hosting" | "going" | "requested" | "saved") =>
      row({ type: "event", event: event(relation, "Salon", on(10, 22, 19), { location: "Light Church, 123 Main St" }) });
    expect(["hosting", "going", "requested", "saved"].map((r) => at(r as "saved").sub)).toEqual([
      "Hosting · Light Church",
      "Going · Light Church",
      "Requested · Light Church",
      "Saved · Light Church",
    ]);
    expect(at("saved").status).toBe("7PM");
    expect(at("saved").meta).toBeNull();
  });

  it("leaves out the venue it hasn't got, rather than a dangling dot", () => {
    expect(row({ type: "event", event: event("saved", "Film Night", on(10, 24, 19)) }).sub).toBe("Saved");
  });

  it("says nothing about a going count of zero", () => {
    expect(row({ type: "event", event: event("saved", "Quiet", on(10, 24)) }).meta).toBeNull();
  });

  it("shows a past event, sent with no count and no cover, as a date block and nothing about who went", () => {
    const over = event("going", "Potluck", on(9, 19, 18), { goingCount: 0, coverUrl: null });
    expect(row({ type: "event", event: over }, { ...CALM, past: true })).toMatchObject({
      meta: null,
      thumb: { kind: "date", month: "SEP", day: "19" },
      status: "Past",
    });
  });

  it("leaves a host's waiting requests to the request rows, which say who and decide", () => {
    const hosting = event("hosting", "Zine", on(10, 15, 18), { pendingRequests: 2 });
    expect(row({ type: "event", event: hosting })).toMatchObject({ sub: "Hosting", status: "6PM" });
  });

  it("says Past, or Cancelled, once it's over", () => {
    const past = { ...CALM, past: true };
    expect(row({ type: "event", event: event("going", "Potluck", on(9, 19)) }, past).status).toBe("Past");
    expect(row({ type: "event", event: event("going", "Plein Air", on(9, 26), { cancelled: true }) }, past).status).toBe("Cancelled");
  });
});

describe("a person row", () => {
  it("reads their first two interests and when you followed", () => {
    expect(row({ type: "person", person: follow("Kofi Mensah", ["Design", "other:signs", "Production", "Type"], on(9, 30)) })).toEqual({
      id: "person:kofi-mensah",
      title: "Kofi Mensah",
      sub: "Design · Production",
      meta: null,
      status: "Followed Sep 30",
      thumb: { kind: "face", name: "Kofi Mensah", url: null },
      action: null,
      hot: false,
      past: false,
    });
    expect(row({ type: "person", person: follow("Kofi Mensah", ["Design"], NOW) }, { ...CALM, withArea: true }).sub).toBe("People · Design");
  });
});

describe("helpers", () => {
  it("label the two kinds", () => {
    expect(KIND_LABEL).toEqual({ paid: "Paid", passion: "Passion" });
  });

  it("address someone by first name, or the whole name before they've set one", () => {
    expect(addressName("Mara Lin")).toBe("Mara");
    expect(addressName("New User")).toBe("New User");
  });

  it("say when an event is, with its date, for the opened card", () => {
    expect(whenLabel(on(10, 8, 18))).toBe("Oct 8 · 6PM");
  });

  it("say when an event is in a row, with no date: the day in words and the time", () => {
    expect(eventWhen(on(10, 2, 19), NOW)).toBe("Today · 7PM");
    expect(eventWhen(on(10, 3, 9), NOW)).toBe("Tomorrow · 9AM");
    expect(eventWhen(on(10, 8, 18), NOW)).toBe("Thu · 6PM");
    expect(eventWhen(on(10, 9, 18), NOW)).toBe("6PM");
    expect(eventWhen(on(12, 6, 17), NOW)).toBe("5PM");
  });
});
