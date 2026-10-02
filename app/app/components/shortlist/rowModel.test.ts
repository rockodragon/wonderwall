import { describe, expect, it } from "vitest";
import { formatMoney } from "../../garden/ui";
import {
  NOW,
  PROPOSALS,
  VOLUNTEER,
  amount,
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
import { KIND_LABEL, addressName, rowModel, whenLabel, type RowContext } from "./rowModel";

const CALM: RowContext = { hot: false, withArea: false, money: formatMoney };
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

  it("reads the role, then kind, project and lead, its pay and its status", () => {
    expect(row(p(invite), HOT)).toEqual({
      id: "role:sound-mixer",
      title: "Sound Mixer",
      sub: "Paid · Hollow Creek Field Recordings · Mara Lin",
      meta: "$1,200",
      status: "Invited · Sep 30",
      thumb: { kind: "cover", url: null, seed: "hollow-creek-field-recordings" },
      action: "Reply",
      hot: true,
      past: false,
    });
  });

  it("offers its action only in Needs you", () => {
    expect(row(p(invite)).action).toBeNull();
    expect(row(p(invite)).hot).toBe(false);
  });

  it("says Apply on a saved role that closes soon, and when it closes", () => {
    const saved = project("saved", "Psalms Zine", { role: role("Copy Editor", on(10, 7)), pay: amount(300) });
    expect(row(p(saved), HOT)).toMatchObject({ status: "Closes Oct 7", action: "Apply", meta: "$300" });
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
  it("names who's asking, on what, as what", () => {
    const request = projectRequest("Hana Cho", "Hymns for the Commons", { roleTitle: "Cellist", pay: VOLUNTEER, at: on(9, 30) });
    expect(row({ type: "request", request }, HOT)).toEqual({
      id: "request:hana-cho-hymns-for-the-commons",
      title: "Hana Cho",
      sub: "Passion · Hymns for the Commons · Wants to join as Cellist",
      meta: "Volunteer",
      status: "Request · Sep 30",
      thumb: { kind: "face", name: "Hana Cho", url: null },
      action: "Review",
      hot: true,
      past: false,
    });
  });

  it("asks to come to an event you host", () => {
    const request = eventRequest("Sam Ito", "Zine Workshop", on(10, 15, 18), on(9, 29));
    expect(row({ type: "request", request }, { ...HOT, withArea: true })).toMatchObject({
      sub: "Events · Zine Workshop · Asked to come",
      meta: "Oct 15",
      status: "Request · Sep 29",
    });
  });
});

describe("an event row", () => {
  const studio = event("going", "Open Studio Night", on(10, 3, 19), { location: "Light Church, 123 Main St", goingCount: 24 });

  it("reads its date block, venue and time, and how many are going", () => {
    expect(row({ type: "event", event: studio })).toEqual({
      id: "event:open-studio-night",
      title: "Open Studio Night",
      sub: "Light Church · 7PM",
      meta: "24 going",
      status: "You're going",
      thumb: { kind: "date", month: "OCT", day: "3" },
      action: null,
      hot: false,
      past: false,
    });
  });

  it("says when it is in This week, and names its area in a mixed list", () => {
    expect(row({ type: "event", event: studio }, { ...HOT, withArea: true })).toMatchObject({
      sub: "Events · Light Church · 7PM",
      status: "Oct 3 · 7PM",
      action: null,
    });
  });

  it("says nothing about a going count of zero", () => {
    expect(row({ type: "event", event: event("saved", "Quiet", on(10, 24)) }).meta).toBeNull();
  });

  it("says where you stand: hosting, requested, saved", () => {
    expect(row({ type: "event", event: event("hosting", "Zine", on(10, 15), { pendingRequests: 2 }) }).status).toBe("2 requests waiting");
    expect(row({ type: "event", event: event("hosting", "Zine", on(10, 15)) }).status).toBe("You're hosting");
    expect(row({ type: "event", event: event("requested", "Salon", on(10, 22)) }).status).toBe("Requested");
    expect(row({ type: "event", event: event("saved", "Film", on(10, 24), { since: on(9, 20) }) }).status).toBe("Saved Sep 20");
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

  it("say when an event is", () => {
    expect(whenLabel(on(10, 8, 18))).toBe("Oct 8 · 6PM");
  });
});
