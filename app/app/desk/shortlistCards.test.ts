import { describe, expect, it } from "vitest";
import type { ShortlistItem } from "../components/shortlist/items";
import { NOW, VOLUNTEER, amount, event, eventRequest, follow, on, project, projectRequest, role } from "../lib/shortlist/fixtures";
import type { ShortlistProject } from "../lib/shortlist/types";
import type { DeskEventInput, DeskProjectInput } from "./deskCards";
import { opensAsSheet } from "./deskCards";
import { shortlistCard, type ShortlistButton, type ShortlistCardContext } from "./shortlistCards";

const money = (cents: number) => `$${cents / 100}`;
const CTX: ShortlistCardContext = { now: NOW, money, events: [], projects: [] };

const card = (item: ShortlistItem, ctx: ShortlistCardContext = CTX) => shortlistCard(item, ctx);
const p = (row: ShortlistProject): ShortlistItem => ({ type: "project", row });

function buttons(item: ShortlistItem, ctx: ShortlistCardContext = CTX): ShortlistButton[] {
  const action = card(item, ctx).detail.action;
  if (action?.kind !== "shortlist") throw new Error("not a Shortlist card");
  return action.buttons;
}

/** "Accept*" for the solid one, "Decline" for text, "[You're going]" for a state. */
function labels(item: ShortlistItem, ctx?: ShortlistCardContext): string[] {
  return buttons(item, ctx).map((b) => (b.kind === "state" ? `[${b.label}]` : b.solid ? `${b.label}*` : b.label));
}

const mara = { name: "Mara Lin", profileId: "mara-lin" };
const invite = project("invited", "Hollow Creek Field Recordings", {
  kind: "paid",
  role: role("Sound Mixer"),
  lead: mara,
  pay: amount(1200),
  since: on(9, 30),
});

describe("the actions table", () => {
  it("Invited: Accept, with Decline as text, both answering the invite", () => {
    expect(labels(p(invite))).toEqual(["Accept*", "Decline"]);
    const [accept, decline] = buttons(p(invite));
    expect(accept).toMatchObject({ kind: "call", call: { fn: "respondToInvite", projectId: "hollow-creek-field-recordings", accept: true } });
    expect(decline).toMatchObject({ kind: "call", call: { fn: "respondToInvite", projectId: "hollow-creek-field-recordings", accept: false } });
    expect(accept).toMatchObject({ done: "You're on the team for Hollow Creek Field Recordings." });
    expect(decline).toMatchObject({ done: "Declined. Mara will see it." });
  });

  it("Join request on your project: Accept, with Decline as text, deciding the request", () => {
    const request = projectRequest("Hana Cho", "Hymns for the Commons", { roleTitle: "Cellist", pay: VOLUNTEER });
    const item: ShortlistItem = { type: "request", request };
    expect(labels(item)).toEqual(["Accept*", "Decline"]);
    expect(buttons(item)[0]).toMatchObject({
      call: { fn: "decideRequest", memberId: request.requestId, accept: true },
      done: "Hana joined Hymns for the Commons as Cellist.",
    });
    expect(buttons(item)[1]).toMatchObject({ call: { fn: "decideRequest", memberId: request.requestId, accept: false } });
  });

  it("Request to attend your event: Approve, with Decline as text, through updateApplicationStatus", () => {
    const request = eventRequest("Sam Ito", "Zine Workshop", on(10, 15, 18));
    const item: ShortlistItem = { type: "request", request };
    expect(labels(item)).toEqual(["Approve*", "Decline"]);
    expect(buttons(item).map((b) => b.kind === "call" && b.call)).toEqual([
      { fn: "updateApplicationStatus", applicationId: request.requestId, status: "accepted" },
      { fn: "updateApplicationStatus", applicationId: request.requestId, status: "declined" },
    ]);
  });

  it("Leading: Review requests, on the project's team panel", () => {
    const leading = project("leading", "Hymns", { pendingRequests: 2 });
    expect(labels(p(leading))).toEqual(["Review requests*", "Project page →"]);
    expect(buttons(p(leading))[0]).toMatchObject({ kind: "link", href: "/projects/hymns#team" });
    expect(labels(p(project("leading", "Hymns")))[0]).toBe("See team*");
  });

  it("Applied or asked to join: Withdraw request", () => {
    const waiting = project("waiting", "Films", { role: role("Motion Designer") });
    expect(labels(p(waiting))).toEqual(["Withdraw request", "Project page →"]);
    expect(buttons(p(waiting))[0]).toMatchObject({ call: { fn: "withdrawRequest", projectId: "films" }, done: "Request withdrawn." });
  });

  it("Saved role: Apply on the team panel, and it can be let go", () => {
    const saved = project("saved", "Psalms Zine", { role: role("Copy Editor", on(10, 7)) });
    expect(labels(p(saved))).toEqual(["Apply*", "Remove from shortlist"]);
    expect(buttons(p(saved))[0]).toMatchObject({ kind: "link", href: "/projects/psalms-zine#team" });
    expect(buttons(p(saved))[1]).toMatchObject({ call: { fn: "unsave", targetType: "role", targetId: "copy-editor" }, done: "Removed from your shortlist." });
  });

  it("Saved project: See project, and it can be let go", () => {
    expect(labels(p(project("saved", "Quiet Hours")))).toEqual(["See project*", "Remove from shortlist"]);
    expect(buttons(p(project("saved", "Quiet Hours")))[1]).toMatchObject({ call: { fn: "unsave", targetType: "project", targetId: "quiet-hours" } });
  });

  it("Saved event: I'm going, through events.apply, when the desk lists it as free", () => {
    const saved = event("saved", "Makers Market", on(10, 31, 10));
    const desk: DeskEventInput = { _id: "makers-market", title: "Makers Market", datetime: on(10, 31, 10), hosts: [{ name: "Alder Street" }], description: "<p>Stalls.</p>" };
    const ctx = { ...CTX, events: [desk] };
    expect(labels({ type: "event", event: saved }, ctx)).toEqual(["I'm going*", "Remove from shortlist"]);
    expect(buttons({ type: "event", event: saved }, ctx)[0]).toMatchObject({ call: { fn: "apply", eventId: "makers-market" }, done: "You're going to Makers Market." });
    expect(buttons({ type: "event", event: saved }, ctx)[1]).toMatchObject({ call: { fn: "unsave", targetType: "event", targetId: "makers-market" } });
  });

  it("Saved event: the event page's way in when it sells tickets or needs approval", () => {
    const saved = event("saved", "Salon", on(10, 22));
    const ticketed: DeskEventInput = { _id: "salon", title: "Salon", datetime: on(10, 22), externalTicketUrl: "https://tix.test" };
    expect(buttons({ type: "event", event: saved }, { ...CTX, events: [ticketed] })[0]).toEqual({ kind: "link", label: "Get tickets", solid: true, href: "/events/salon" });
    const approval: DeskEventInput = { _id: "salon", title: "Salon", datetime: on(10, 22), requiresApproval: true };
    expect(buttons({ type: "event", event: saved }, { ...CTX, events: [approval] })[0]).toEqual({ kind: "link", label: "Apply to Attend", solid: true, href: "/events/salon" });
  });

  it("Saved event the desk doesn't list: only Remove; its page is a link on the card", () => {
    expect(labels({ type: "event", event: event("saved", "Salon", on(10, 22)) })).toEqual(["Remove from shortlist"]);
  });

  it("Going: You're going, disabled. Requested: Requested", () => {
    expect(labels({ type: "event", event: event("going", "Supper", on(10, 17)) })).toEqual(["[You're going]"]);
    expect(labels({ type: "event", event: event("requested", "Salon", on(10, 22)) })).toEqual(["[Requested]"]);
  });

  it("Hosting: the host's guest list", () => {
    expect(buttons({ type: "event", event: event("hosting", "Zine", on(10, 15), { pendingRequests: 1 }) })).toEqual([
      { kind: "link", label: "Review requests", solid: true, href: "/events/zine?tab=guests" },
    ]);
    expect(labels({ type: "event", event: event("hosting", "Zine", on(10, 15)) })).toEqual(["Manage event*"]);
  });

  it("Past: nothing to do, except let go of a saved one", () => {
    expect(labels({ type: "event", event: event("going", "Potluck", on(9, 19)) })).toEqual([]);
    expect(labels({ type: "event", event: event("saved", "Darkroom", on(9, 12)) })).toEqual(["Remove from shortlist"]);
    expect(labels({ type: "event", event: event("going", "Plein Air", on(10, 26), { cancelled: true }) })).toEqual([]);
  });

  it("Person: See profile, and Unfollow", () => {
    const item: ShortlistItem = { type: "person", person: follow("Kofi Mensah", ["Design"], on(9, 30)) };
    expect(labels(item)).toEqual(["See profile*", "Unfollow"]);
    expect(buttons(item)[0]).toMatchObject({ href: "/profile/kofi-mensah" });
    expect(buttons(item)[1]).toMatchObject({ call: { fn: "unsave", targetType: "profile", targetId: "kofi-mensah" }, done: "Unfollowed Kofi Mensah." });
  });

  it("On the team or backing: See project. Closed: the project page, and a filled role can be let go", () => {
    expect(labels(p(project("team", "Mural", { role: role("Painter") })))).toEqual(["See project*"]);
    expect(labels(p(project("backing", "Long Table")))).toEqual(["See project*"]);
    expect(labels(p(project("closed", "Easter", { closedReason: "finished" })))).toEqual(["Project page →"]);
    expect(labels(p(project("closed", "Zine", { role: role("Editor"), closedReason: "filled" })))).toEqual(["Project page →", "Remove from shortlist"]);
  });

  it("has exactly one solid button at most", () => {
    const items: ShortlistItem[] = [
      p(invite),
      p(project("leading", "Hymns")),
      p(project("saved", "Quiet")),
      { type: "event", event: event("hosting", "Zine", on(10, 15)) },
      { type: "person", person: follow("Kofi Mensah", [], NOW) },
    ];
    for (const item of items) expect(buttons(item).filter((b) => b.kind !== "state" && b.solid).length).toBeLessThanOrEqual(1);
  });
});

describe("the status line", () => {
  it("says who's waiting on whom", () => {
    expect(card(p(invite)).detail.status).toBe("Mara invited you Sep 30 · Waiting on you");
    const request = projectRequest("Hana Cho", "Hymns", { at: on(9, 30) });
    expect(card({ type: "request", request }).detail.status).toBe("Hana asked Sep 30 · Waiting on you");
    const applied = project("waiting", "Films", { role: role("Motion Designer"), lead: mara, since: on(9, 27) });
    expect(card(p(applied)).detail.status).toBe("You applied Sep 27 · Waiting on Mara");
    const asked = project("waiting", "Choir", { role: { id: null, title: "Alto", neededBy: null }, lead: mara, since: on(9, 29) });
    expect(card(p(asked)).detail.status).toBe("You asked to join Sep 29 · Waiting on Mara");
  });

  it("says where the member stands", () => {
    expect(card(p(project("team", "Mural", { role: role("Painter"), since: on(7, 2) }))).detail.status).toBe("You joined Jul 2 · On the team");
    expect(card(p(project("saved", "Zine", { role: role("Copy Editor", on(10, 7)), since: on(9, 21) }))).detail.status).toBe(
      "You saved this Sep 21 · Closes Oct 7",
    );
    expect(card(p(project("leading", "Hymns", { pendingRequests: 1 }))).detail.status).toBe("You lead this · 1 request waiting");
    expect(card({ type: "event", event: event("going", "Supper", on(10, 17, 17)) }).detail.status).toBe("You're going · Oct 17 · 5PM");
    expect(card({ type: "event", event: event("requested", "Salon", on(10, 22)) }).detail.status).toBe("You requested a place · Waiting on the host");
    expect(card({ type: "event", event: event("going", "Plein Air", on(9, 26), { cancelled: true }) }).detail.status).toBe("Cancelled by the host");
    expect(card({ type: "event", event: event("going", "Potluck", on(9, 19)) }).detail.status).toBe("This event has passed");
    expect(card({ type: "person", person: follow("Kofi Mensah", [], on(9, 30)) }).detail.status).toBe("You followed Kofi Sep 30");
  });
});

describe("the card", () => {
  it("opens a role as its role, on its project's cover", () => {
    const c = card(p({ ...invite, coverUrl: "https://img/creek.jpg" }));
    expect(c).toMatchObject({
      id: "role:sound-mixer",
      kind: "project",
      sections: [],
      image: "https://img/creek.jpg",
      href: "/projects/hollow-creek-field-recordings",
      projectId: "hollow-creek-field-recordings",
    });
    expect(c.face).toEqual({ kicker: "Paid", title: "Hollow Creek Field Recordings", foot: "Led by Mara Lin" });
    expect(c.detail).toMatchObject({
      meta: "Paid · $1,200",
      title: "Sound Mixer",
      host: "Hollow Creek Field Recordings, led by Mara Lin",
      aside: "Mara is waiting on your reply",
      facts: [["Pay", "$1,200"]],
    });
  });

  it("takes a project's blurb from the desk's own list when it has it", () => {
    const known = { _id: "hollow-creek-field-recordings", kind: "paid", status: "active", title: "Hollow Creek", blurb: "Three days recording a creek.", media: [] } as DeskProjectInput;
    expect(card(p(invite), { ...CTX, projects: [known] }).detail.description).toBe("Three days recording a creek.");
    expect(card(p(invite)).detail.description).toBe("");
  });

  it("takes an event's hosts and description from the desk's own list", () => {
    const desk: DeskEventInput = { _id: "supper", title: "Supper", datetime: on(10, 17, 17), hosts: [{ name: "Ruth Benton" }], description: "<p>Bring a dish.</p>", location: "St. Brigid's Hall" };
    const c = card({ type: "event", event: event("going", "Supper", on(10, 17, 17), { goingCount: 86 }) }, { ...CTX, events: [desk] });
    expect(c.detail).toMatchObject({ host: "Hosted by Ruth Benton", description: "Bring a dish.", aside: "86 going", meta: "OCT 17 · 5PM · ST. BRIGID'S HALL" });
    expect(c).toMatchObject({ id: "event:supper", kind: "event", eventId: "supper", href: "/events/supper" });
  });

  it("builds an event the desk doesn't list from the Shortlist alone", () => {
    const c = card({ type: "event", event: event("going", "Potluck", on(9, 19, 18), { location: "Light Church, 1 Main St" }) });
    expect(c.face).toEqual({ kicker: "SEP 19", title: "Potluck", foot: "Light Church" });
    expect(c.detail.meta).toBe("SEP 19 · 6PM · LIGHT CHURCH");
    expect(c.detail.host).toBeNull();
  });

  it("opens a request as the person asking, with their note", () => {
    const request = { ...projectRequest("Hana Cho", "Hymns", { roleTitle: "Cellist", pay: VOLUNTEER }), message: "Free Tuesdays." };
    const c = card({ type: "request", request });
    expect(c).toMatchObject({ id: `request:${request.requestId}`, kind: "person", profileId: "hana-cho", href: "/profile/hana-cho" });
    expect(c.detail).toMatchObject({ meta: "Join request · Hymns", title: "Hana Cho", host: "Wants to join as Cellist · Volunteer", description: "“Free Tuesdays.”" });
    expect(opensAsSheet(c)).toBe(true);
  });

  it("sends a request from someone with no profile to the thing they asked about", () => {
    const request = projectRequest("Off Platform", "Hymns");
    const c = card({ type: "request", request: { ...request, person: { ...request.person, profileId: null } } });
    expect(c.href).toBe("/projects/hymns#team");
    expect(c.profileId).toBeUndefined();
  });

  it("opens a person with their interests, and asks for their bio", () => {
    const c = card({ type: "person", person: follow("Kofi Mensah", ["other:x", "Design", "Production"], NOW) });
    expect(c).toMatchObject({ id: "person:kofi-mensah", kind: "person", profileId: "kofi-mensah" });
    expect(c.face).toEqual({ kicker: "Following", title: "Kofi Mensah", foot: "Design" });
    expect(c.detail).toMatchObject({ meta: "Following · Design", host: "Design · Production", description: "" });
  });

  it("rests on no view: it's opened from a row", () => {
    expect(card(p(invite)).sections).toEqual([]);
    expect(card({ type: "person", person: follow("A B", [], NOW) }).sections).toEqual([]);
  });
});
