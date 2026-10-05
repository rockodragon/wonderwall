import { describe, expect, it } from "vitest";
import { CLAIMS } from "../constants/claims";
import {
  ALL_VIEW_MAX,
  ALL_VIEW_UPDATES,
  buildDeskCards,
  cardsInView,
  celebrationCard,
  dateKicker,
  fundingLine,
  inCommunity,
  plainText,
  opensAsSheet,
  orgCard,
  peopleLine,
  picturePage,
  projectCard,
  projectFacts,
  rolesLine,
  timeLabel,
  toneFor,
  updateCard,
  venueName,
  type DeskCard,
  type DeskCelebrationInput,
  type DeskEventInput,
  type DeskInput,
  type DeskOrgInput,
  type DeskProjectInput,
  type DeskUpdateInput,
} from "./deskCards";

const NOW = new Date(2026, 9, 1, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

const money = (cents: number) => {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2 })}`;
};

function event(n: number, extra: Partial<DeskEventInput> = {}): DeskEventInput {
  return {
    _id: `e${n}`,
    title: `Event ${n}`,
    description: "A night of songs.",
    datetime: NOW + n * DAY,
    location: "Light Church, 123 Main St, Carlsbad, CA",
    attendeeCount: 0,
    hosts: [],
    community: null,
    ...extra,
  };
}

function project(id: string, extra: Partial<DeskProjectInput> = {}): DeskProjectInput {
  return {
    _id: id,
    kind: "passion",
    status: "active",
    title: `Project ${id}`,
    blurb: "Making a thing.",
    media: [],
    creator: { name: "Dana Lee" },
    community: null,
    ...extra,
  };
}

const FUND = {
  slug: "abiding-practice",
  name: "The Sophia Fund",
  orgName: "Abiding Practice",
  availableCents: 1_002_500,
  openCall: CLAIMS.sophiaSchedule,
};

function update(n: number, extra: Partial<DeskUpdateInput> = {}): DeskUpdateInput {
  return { _id: `u${n}`, title: `Update ${n}`, body: `Body ${n}.`, imageUrl: null, actionLabel: null, actionUrl: null, ...extra };
}

function input(extra: Partial<DeskInput> = {}): DeskInput {
  return {
    now: NOW,
    celebrations: [],
    updates: [],
    events: [event(1), event(2), event(3), event(4), event(5)],
    people: [],
    projects: [project("p1", { goal: 1000, resolvedPhotoUrl: "https://img/p1.jpg" }), project("p2"), project("p3")],
    fund: FUND,
    grant: { amountCents: 500 },
    formatMoney: money,
    ...extra,
  };
}

const byId = (cards: DeskCard[], id: string) => cards.find((c) => c.id === id)!;
const ids = (cards: DeskCard[]) => cards.map((c) => c.id);

describe("event cards", () => {
  it("belong to Events, soonest first", () => {
    const cards = buildDeskCards(input({ events: [event(3), event(1), event(2)] }), "garden");
    const events = cardsInView(cards, "events");
    expect(ids(events)).toEqual(["event:e1", "event:e2", "event:e3"]);
  });

  it("give the next event Today as well", () => {
    const cards = buildDeskCards(input(), "garden");
    expect(byId(cards, "event:e1").sections).toContain("today");
    expect(byId(cards, "event:e2").sections).not.toContain("today");
  });

  it("give Today the following event when Needs you already lists the next, from an array or a set", () => {
    for (const needsYou of [["e1"], new Set(["e1"])]) {
      const cards = buildDeskCards(input({ needsYouEventIds: needsYou }), "garden");
      expect(byId(cards, "event:e1").sections).not.toContain("today");
      expect(byId(cards, "event:e2").sections).toContain("today");
    }
  });

  it("skip every event Needs you lists, and still give Today just one", () => {
    const cards = buildDeskCards(input({ needsYouEventIds: ["e1", "e2", "e4"] }), "garden");
    expect(ids(cardsInView(cards, "today")).filter((id) => id.startsWith("event:"))).toEqual(["event:e3"]);
  });

  it("give Today no event when Needs you lists them all", () => {
    const cards = buildDeskCards(input({ events: [event(1)], needsYouEventIds: ["e1"] }), "garden");
    expect(ids(cardsInView(cards, "today")).some((id) => id.startsWith("event:"))).toBe(false);
    expect(byId(cards, "event:e1").sections).toContain("events");
  });

  it("leave the default desk alone: Needs you only moves Today's card", () => {
    const cards = buildDeskCards(input({ needsYouEventIds: ["e1"] }), "garden");
    expect(ids(cardsInView(cards, "all")).slice(0, 3)).toEqual(["event:e1", "event:e2", "event:e3"]);
  });

  it("belong to no Favorites view: hearted events are the Shortlist's now", () => {
    const cards = buildDeskCards(input(), "garden");
    for (const card of cards) expect(card.sections as string[]).not.toContain("fav");
  });

  it("drop an event that already started", () => {
    const cards = buildDeskCards(input({ events: [event(-1), event(1)] }), "garden");
    expect(ids(cardsInView(cards, "events"))).toEqual(["event:e1"]);
  });

  it("read date, title and venue on the face", () => {
    const e = event(1, { datetime: new Date(2026, 9, 2, 19).getTime() });
    const card = byId(buildDeskCards(input({ events: [e] }), "garden"), "event:e1");
    expect(card.face).toEqual({ kicker: "OCT 2", title: "Event 1", foot: "Light Church" });
    expect(card.detail.meta).toBe("OCT 2 · 7PM · LIGHT CHURCH");
    expect(card.href).toBe("/events/e1");
  });

  it("say Online for an online event, and nothing for no place", () => {
    const online = byId(buildDeskCards(input({ events: [event(1, { locationType: "online", location: "https://zoom.us/x" })] }), "garden"), "event:e1");
    expect(online.face.foot).toBe("Online");
    const none = byId(buildDeskCards(input({ events: [event(1, { location: null })] }), "garden"), "event:e1");
    expect(none.face.foot).toBeNull();
    expect(none.detail.meta).toBe(`${dateKicker(NOW + DAY)} · ${timeLabel(NOW + DAY)}`);
  });

  it("use the cover, then a pasted link's still, else no picture", () => {
    const cards = buildDeskCards(
      input({
        events: [
          event(1, { coverImageUrl: "https://img/cover.jpg", mediaPreviewUrl: "https://img/still.jpg" }),
          event(2, { mediaPreviewUrl: "https://img/still.jpg" }),
          event(3),
        ],
      }),
      "garden",
    );
    expect(byId(cards, "event:e1").image).toBe("https://img/cover.jpg");
    expect(byId(cards, "event:e2").image).toBe("https://img/still.jpg");
    expect(byId(cards, "event:e3").image).toBeNull();
  });

  it("name the hosts the way event cards do", () => {
    const e = event(1, {
      hosts: [
        { name: "Dana Lee" },
        { name: "Sam Roe", orgName: "Reveal Brand" },
        { name: "Pat Kim", orgName: "Abiding Practice" },
      ],
    });
    const card = byId(buildDeskCards(input({ events: [e] }), "garden"), "event:e1");
    expect(card.detail.host).toBe("Hosted by Abiding Practice, Reveal Brand, Dana Lee");
  });

  it("show 'N going' only when N is above zero", () => {
    const cards = buildDeskCards(
      input({ events: [event(1, { attendeeCount: 0 }), event(2, { attendeeCount: undefined }), event(3, { attendeeCount: 3 })] }),
      "garden",
    );
    expect(byId(cards, "event:e1").detail.aside).toBeNull();
    expect(byId(cards, "event:e2").detail.aside).toBeNull();
    expect(byId(cards, "event:e3").detail.aside).toBe("3 going");
  });

  it("offer 'I'm going' on a free event", () => {
    const card = byId(buildDeskCards(input({ events: [event(1)] }), "garden"), "event:e1");
    expect(card.detail.action).toEqual({ kind: "rsvp", label: "I'm going", eventId: "e1" });
  });

  it("offer 'Get tickets' on a ticketed one, however it sells", () => {
    const cards = buildDeskCards(
      input({
        events: [
          event(1, { ticketTiers: [{ name: "General", priceCents: 2500 }] }),
          event(2, { externalTicketUrl: "https://buy.stripe.com/x" }),
          event(3, { accessType: "paid", priceCents: 1500 }),
        ],
      }),
      "garden",
    );
    for (const id of ["event:e1", "event:e2", "event:e3"]) {
      expect(byId(cards, id).detail.action).toEqual({ kind: "link", label: "Get tickets", href: `/events/${id.slice(6)}` });
    }
  });

  it("send an event that needs approval to its page", () => {
    const card = byId(buildDeskCards(input({ events: [event(1, { requiresApproval: true })] }), "garden"), "event:e1");
    expect(card.detail.action).toEqual({ kind: "link", label: "Apply to Attend", href: "/events/e1" });
  });

  it("strip rich text from the description", () => {
    const e = event(1, { description: "<p>Come &amp; sing.</p><p><strong>Free</strong> entry.</p>" });
    expect(byId(buildDeskCards(input({ events: [e] }), "garden"), "event:e1").detail.description).toBe("Come & sing. Free entry.");
  });
});

describe("the community filter", () => {
  const events = [
    event(1, { community: null }),
    event(2, { community: { name: "The Garden", slug: "the-garden" } }),
    event(3, { community: { name: "Table Art Society", slug: "tas" } }),
  ];
  const projects = [
    project("g", { community: null }),
    project("t", { community: { name: "Table Art Society", slug: "tas" } }),
  ];

  it("shows The Garden its own content and content with no community", () => {
    const cards = buildDeskCards(input({ events, projects }), "garden");
    expect(ids(cardsInView(cards, "events"))).toEqual(["event:e1", "event:e2"]);
    expect(ids(cardsInView(cards, "projects"))).toContain("project:g");
    expect(ids(cardsInView(cards, "projects"))).not.toContain("project:t");
  });

  it("shows The Exchange everything, and no fund", () => {
    const cards = buildDeskCards(input({ events, projects }), "exchange");
    expect(ids(cardsInView(cards, "events"))).toEqual(["event:e1", "event:e2", "event:e3"]);
    expect(ids(cardsInView(cards, "projects"))).toEqual(expect.arrayContaining(["project:g", "project:t"]));
    expect(cards.some((c) => c.kind === "fund")).toBe(false);
  });

  it("applies the same rule to anything with a community", () => {
    expect(inCommunity({ community: null }, "garden")).toBe(true);
    expect(inCommunity({}, "garden")).toBe(true);
    expect(inCommunity({ community: { slug: "the-garden" } }, "garden")).toBe(true);
    expect(inCommunity({ community: { slug: "tas" } }, "garden")).toBe(false);
    expect(inCommunity({ community: { slug: "tas" } }, "exchange")).toBe(true);
  });

  it("keeps the monthly grant and followed people in either community", () => {
    const people = [{ _id: "u1", name: "Ann" }];
    for (const community of ["garden", "exchange"] as const) {
      const cards = buildDeskCards(input({ people }), community);
      expect(cards.some((c) => c.kind === "grant")).toBe(true);
      expect(cards.some((c) => c.id === "person:u1")).toBe(true);
    }
  });
});

describe("what 'all' holds", () => {
  it("is the next 3 events, the fund, the grant and the featured project, at most 6", () => {
    const cards = buildDeskCards(input(), "garden");
    const all = cardsInView(cards, "all");
    expect(ids(all)).toEqual(["event:e1", "event:e2", "event:e3", "fund", "grant", "project:p1"]);
    expect(all.length).toBeLessThanOrEqual(6);
  });

  it("never passes 6, however much is on the desk", () => {
    const cards = buildDeskCards(
      input({
        events: Array.from({ length: 30 }, (_, i) => event(i + 1)),
        projects: Array.from({ length: 30 }, (_, i) => project(`p${i}`, { resolvedPhotoUrl: "https://img/x.jpg", goal: 100 })),
        people: Array.from({ length: 30 }, (_, i) => ({ _id: `u${i}`, name: `P${i}` })),
      }),
      "garden",
    );
    expect(cardsInView(cards, "all").length).toBe(6);
    expect(cards.length).toBeGreaterThan(6);
  });

  it("leaves out what isn't there", () => {
    const cards = buildDeskCards(input({ events: [event(1)], fund: null, grant: null, projects: [] }), "garden");
    expect(ids(cardsInView(cards, "all"))).toEqual(["event:e1"]);
  });
});

describe("the monthly grant card", () => {
  it("appears only while a grant is open", () => {
    expect(buildDeskCards(input({ grant: null }), "garden").some((c) => c.kind === "grant")).toBe(false);
    expect(buildDeskCards(input({ grant: { amountCents: 500 } }), "garden").some((c) => c.kind === "grant")).toBe(true);
  });

  it("is a note on Today, with the exact amount", () => {
    const card = byId(buildDeskCards(input({ grant: { amountCents: 550 } }), "garden"), "grant");
    expect(card.note).toBe(true);
    expect(card.sections).toEqual(["all", "today"]);
    expect(card.face).toEqual({ kicker: "YOUR MONTHLY GRANT", title: "$5.50", foot: "to give this month" });
    expect(card.detail.title).toBe("You have $5.50 to give.");
    expect(card.detail.action).toEqual({ kind: "link", label: "Choose", href: "/give" });
  });
});

describe("the fund card", () => {
  it("is a note on Projects and Today, with the fund's available amount", () => {
    const card = byId(buildDeskCards(input(), "garden"), "fund");
    expect(card.note).toBe(true);
    expect(card.sections).toEqual(["all", "projects", "today"]);
    expect(card.face).toEqual({ kicker: "THE SOPHIA FUND", title: "$10,025", foot: "available to grant" });
  });

  it("opens to its name, who runs it, the open call and Give", () => {
    const card = byId(buildDeskCards(input(), "garden"), "fund");
    expect(card.detail.title).toBe("The Sophia Fund");
    expect(card.detail.host).toBe("Run by Abiding Practice");
    expect(card.detail.description).toBe(CLAIMS.sophiaSchedule);
    expect(card.detail.aside).toBe(CLAIMS.grantFundDeductibleShort);
    expect(card.detail.aside).toBe("Tax-deductible");
    expect(card.detail.action).toEqual({ kind: "link", label: "Give", href: "/fund/abiding-practice" });
    expect(card.href).toBe("/fund/abiding-practice");
  });

  it("is missing until the fund has loaded", () => {
    expect(buildDeskCards(input({ fund: null }), "garden").some((c) => c.kind === "fund")).toBe(false);
  });
});

describe("project cards", () => {
  it("put the featured project in 'all' and the rest in Projects only", () => {
    const cards = buildDeskCards(input(), "garden");
    expect(byId(cards, "project:p1").sections).toEqual(["all", "projects"]);
    expect(byId(cards, "project:p2").sections).toEqual(["projects"]);
  });

  it("leave out completed projects and volunteer postings", () => {
    const cards = buildDeskCards(
      input({
        projects: [
          project("done", { status: "completed" }),
          project("vol", { kind: "paid", budgetType: "volunteer" }),
          project("paid", { kind: "paid", budgetType: "amount", budget: 400 }),
          project("closed", { kind: "paid", budgetType: "amount", budget: 400, gig: { status: "filled" } }),
        ],
      }),
      "garden",
    );
    expect(cards.filter((c) => c.kind === "project").map((c) => c.id)).toEqual(["project:paid"]);
  });

  it("read the stage, or JOB, and the owner", () => {
    const cards = buildDeskCards(
      input({
        projects: [
          project("a", { stage: "raising", resolvedPhotoUrl: "https://img/a.jpg", goal: 1000 }),
          project("b", { kind: "paid", budgetType: "amount", budget: 400 }),
        ],
      }),
      "garden",
    );
    expect(byId(cards, "project:a").face).toEqual({ kicker: "RAISING", title: "Project a", foot: "Dana Lee" });
    expect(byId(cards, "project:a").image).toBe("https://img/a.jpg");
    expect(byId(cards, "project:b").face.kicker).toBe("JOB");
    expect(byId(cards, "project:b").detail.facts).toEqual([{ label: "Pay", value: "$400" }]);
    expect(byId(cards, "project:b").image).toBeNull();
  });

  it("say what they are and where, in the opened card's kicker", () => {
    const cards = buildDeskCards(
      input({
        projects: [
          project("a", { community: { name: "Table Art Society", slug: "tas" } }),
          project("b"),
          project("c", { kind: "paid", budgetType: "amount", budget: 400, community: { name: "Table Art Society", slug: "tas" } }),
          project("d", { kind: "paid", budgetType: "proposals" }),
        ],
      }),
      "exchange",
    );
    expect(byId(cards, "project:a").detail.meta).toBe("PROJECT · TABLE ART SOCIETY");
    expect(byId(cards, "project:b").detail.meta).toBe("PROJECT · THE GARDEN");
    expect(byId(cards, "project:c").detail.meta).toBe("JOB · TABLE ART SOCIETY");
    expect(byId(cards, "project:d").detail.meta).toBe("JOB · THE GARDEN");
  });

  it("call a recurring gig by its schedule", () => {
    const gig = project("g", {
      kind: "paid",
      budgetType: "amount",
      budget: 150,
      gig: { status: "open", cadence: "Every Friday", timeRange: "8–10pm" },
    });
    const card = projectCard(gig, ["projects"], money);
    expect(card.face.kicker).toBe("RECURRING GIG · FRIDAYS 8–10PM");
    expect(card.detail.meta).toBe("RECURRING GIG · FRIDAYS 8–10PM · THE GARDEN");
    expect(card.detail.facts).toEqual([
      { label: "Schedule", value: "Fridays 8–10pm" },
      { label: "Pay", value: "$150/date" },
    ]);
  });

  it("call a gig by its name when the row carries no schedule", () => {
    const gig = project("g", { kind: "paid", budgetType: "amount", budget: 150, gig: { status: "open" } });
    expect(projectCard(gig, ["projects"], money).face.kicker).toBe("RECURRING GIG");
  });

  it("call an unpaid posting volunteer work, not a job", () => {
    const card = projectCard(project("v", { kind: "paid", budgetType: "volunteer" }), ["projects"], money);
    expect(card.face.kicker).toBe("VOLUNTEER");
    expect(card.detail.meta).toBe("VOLUNTEER · THE GARDEN");
    expect(card.detail.facts?.some((f) => f.label === "Pay")).toBe(false);
  });

  it("show what a passion project has raised, exactly, in the Funding row", () => {
    const cards = buildDeskCards(
      input({ projects: [project("a", { goal: 1000, raisedCents: 12_550, resolvedPhotoUrl: "https://img/a.jpg" })] }),
      "garden",
    );
    const card = byId(cards, "project:a");
    expect(card.detail.facts).toContainEqual({ label: "Funding", value: "$125.50 of $1,000 · 13%" });
    // The old line after the button is gone.
    expect(card.detail.aside).toBeNull();
  });

  it("open to the blurb and a link to the project", () => {
    const card = byId(buildDeskCards(input(), "garden"), "project:p2");
    expect(card.detail.description).toBe("Making a thing.");
    expect(card.detail.action).toEqual({ kind: "link", label: "See project", href: "/projects/p2" });
  });
});

describe("fundingLine", () => {
  const goal = (raisedCents: number | null | undefined, extra: Partial<DeskProjectInput> = {}) =>
    fundingLine(project("f", { goal: 1000, raisedCents, ...extra }), money);

  it("reads raised of goal, with the percent once something has come in", () => {
    expect(goal(37_000)).toBe("$370 of $1,000 · 37%");
  });
  it("never says 0%: nothing raised, or less than a percent, has no percent", () => {
    expect(goal(0)).toBe("$0 of $1,000");
    expect(goal(undefined)).toBe("$0 of $1,000");
    expect(goal(null)).toBe("$0 of $1,000");
    expect(goal(100)).toBe("$1 of $1,000");
  });
  it("is not 100% until the goal is met", () => {
    expect(goal(99_700)).toBe("$997 of $1,000 · 99%");
  });
  it("says the goal is reached at it, or over it", () => {
    expect(goal(100_000)).toBe("$1,000 of $1,000 · Goal reached");
    expect(goal(120_000)).toBe("$1,200 of $1,000 · Goal reached");
  });
  it("is nothing for a project with no goal, and for paid work", () => {
    expect(fundingLine(project("n"), money)).toBeNull();
    expect(fundingLine(project("z", { goal: 0 }), money)).toBeNull();
    expect(fundingLine(project("p", { kind: "paid", goal: 1000, budgetType: "amount", budget: 400 }), money)).toBeNull();
  });
});

describe("rolesLine", () => {
  const roles = (...titles: string[]) => titles.map((title) => ({ title }));
  it("counts the open roles and names two", () => {
    expect(rolesLine(roles("Writer"))).toBe("1 open: Writer");
    expect(rolesLine(roles("Writer", "Director"))).toBe("2 open: Writer, Director");
    expect(rolesLine(roles("Writer", "Director", "Editor", "Gaffer"))).toBe("4 open: Writer, Director +2");
  });
  it("is nothing when no role is open", () => {
    expect(rolesLine([])).toBeNull();
    expect(rolesLine(null)).toBeNull();
    expect(rolesLine(undefined)).toBeNull();
  });
});

describe("projectFacts", () => {
  it("lists stage, funding and roles in that order, and leaves out what isn't true", () => {
    const full = project("a", { stage: "raising", goal: 1000, raisedCents: 37_000, openRoles: [{ title: "Writer" }, { title: "Director" }] });
    expect(projectFacts(full, money)).toEqual([
      { label: "Stage", value: "Raising" },
      { label: "Funding", value: "$370 of $1,000 · 37%" },
      { label: "Roles", value: "2 open: Writer, Director" },
    ]);
    // A project with no goal and no open roles has the stage alone.
    expect(projectFacts(project("b"), money)).toEqual([{ label: "Stage", value: "Planning" }]);
  });
  it("reads the stage with the page's own words", () => {
    expect(projectFacts(project("c", { stage: "forming" }), money)[0]).toEqual({ label: "Stage", value: "Forming team" });
    expect(projectFacts(project("d", { stage: "releasing" }), money)[0]).toEqual({ label: "Stage", value: "Released" });
  });
  it("gives paid work its pay, and no stage it didn't set", () => {
    const job = project("j", { kind: "paid", budgetType: "range", budget: 300, budgetMax: 600 });
    expect(projectFacts(job, money)).toEqual([{ label: "Pay", value: "$300–600" }]);
    expect(projectFacts({ ...job, stage: "working" }, money)).toEqual([
      { label: "Stage", value: "Working" },
      { label: "Pay", value: "$300–600" },
    ]);
  });
  it("gives a gig its pay per date", () => {
    const gig = project("g", { kind: "paid", budgetType: "amount", budget: 150, gig: { status: "open" } });
    expect(projectFacts(gig, money)).toEqual([{ label: "Pay", value: "$150/date" }]);
  });
  it("says a project raising without a goal is open to backing", () => {
    // An active patron tier makes the server say raising; there is no goal to count against.
    const tiers = project("t", { raising: true });
    expect(projectFacts(tiers, money)).toEqual([
      { label: "Stage", value: "Planning" },
      { label: "Funding", value: "Open to backing" },
    ]);
    // The raising stage with no goal reads the same on an older backend.
    expect(projectFacts(project("s", { stage: "raising" }), money)).toEqual([
      { label: "Stage", value: "Raising" },
      { label: "Funding", value: "Open to backing" },
    ]);
  });
  it("keeps the amount of a goal when there is one, even when the server says raising", () => {
    const funded = project("g", { raising: true, goal: 1000, raisedCents: 37_000 });
    expect(projectFacts(funded, money).find((f) => f.label === "Funding")).toEqual({ label: "Funding", value: "$370 of $1,000 · 37%" });
  });
  it("says nothing of backing for a project that is not raising, or a gig, or paid work", () => {
    expect(projectFacts(project("n"), money).some((f) => f.label === "Funding")).toBe(false);
    expect(projectFacts(project("r", { raising: false, goal: 0 }), money).some((f) => f.label === "Funding")).toBe(false);
    const gig = project("g", { kind: "paid", budgetType: "amount", budget: 150, raising: true, gig: { status: "open" } });
    expect(projectFacts(gig, money).some((f) => f.label === "Funding")).toBe(false);
    const job = project("j", { kind: "paid", budgetType: "amount", budget: 150, raising: true });
    expect(projectFacts(job, money).some((f) => f.label === "Funding")).toBe(false);
  });
  it("leads with the paid roles on the Jobs and gigs list, and names the other roles after", () => {
    const roles = [
      { title: "Drummer", budgetType: "amount", budget: 200 },
      { title: "Singer", budgetType: "range", budget: 300, budgetMax: 600 },
      { title: "Stagehand", budgetType: "volunteer" },
    ];
    const p = project("m", { stage: "working", openRoles: roles });
    expect(projectFacts(p, money, { onJobsAndGigs: true })).toEqual([
      { label: "Paid roles", value: "Drummer · $200; Singer · $300–600" },
      { label: "Stage", value: "Working" },
      { label: "Roles", value: "1 open: Stagehand" },
    ]);
    // Anywhere else the roles are one line, as before.
    expect(projectFacts(p, money)).toEqual([
      { label: "Stage", value: "Working" },
      { label: "Roles", value: "3 open: Drummer, Singer +1" },
    ]);
  });
  it("names the single paid role in the singular, and leaves out a Roles row when it was the only one", () => {
    const p = project("m", { openRoles: [{ title: "Drummer", budgetType: "proposals" }] });
    expect(projectFacts(p, money, { onJobsAndGigs: true })).toEqual([
      { label: "Paid role", value: "Drummer · Open to proposals" },
      { label: "Stage", value: "Planning" },
    ]);
  });
  it("shows roles on paid work too, and never invents whether it is open", () => {
    const job = project("j", { kind: "paid", budgetType: "amount", budget: 400, openRoles: [{ title: "Drummer" }] });
    const facts = projectFacts(job, money);
    expect(facts).toContainEqual({ label: "Roles", value: "1 open: Drummer" });
    expect(facts.map((f) => f.value).join(" ")).not.toMatch(/hiring|open for/i);
  });
});

describe("picturePage", () => {
  const card = (over: Partial<DeskCard>) => ({ kind: "project", image: "https://img/x.jpg", note: false, href: "/projects/x", ...over }) as DeskCard;
  it("is the full page for a project, an event or a person with a picture", () => {
    expect(picturePage(card({}))).toBe("/projects/x");
    expect(picturePage(card({ kind: "event", href: "/events/e" }))).toBe("/events/e");
    expect(picturePage(card({ kind: "person", href: "/profile/u" }))).toBe("/profile/u");
    expect(picturePage(card({ kind: "org", href: "/orgs/grove" }))).toBe("/orgs/grove");
  });
  it("is nothing without a picture side, or for the other kinds", () => {
    expect(picturePage(card({ image: null }))).toBeNull();
    expect(picturePage(card({ kind: "update", href: "/today" }))).toBeNull();
    expect(picturePage(card({ kind: "fund", note: true, image: null }))).toBeNull();
    expect(picturePage(card({ kind: "grant", note: true, image: null }))).toBeNull();
  });
});

describe("person cards", () => {
  it("belong to People alone", () => {
    const cards = buildDeskCards(input({ people: [{ _id: "u1", name: "Ann Cole", imageUrl: "https://img/ann.jpg", interests: ["other:x", "Painter"] }] }), "garden");
    const card = byId(cards, "person:u1");
    expect(card.sections).toEqual(["people"]);
    expect(card.face).toEqual({ kicker: "FOLLOWING", title: "Ann Cole", foot: "Painter" });
    expect(card.image).toBe("https://img/ann.jpg");
    expect(card.detail.action).toEqual({ kind: "link", label: "See profile", href: "/profile/u1" });
    expect(card.profileId).toBe("u1");
  });

  it("stand in on People and on no other view", () => {
    const cards = buildDeskCards(input({ people: [{ _id: "u1", name: "Ann" }] }), "garden");
    expect(ids(cardsInView(cards, "people"))).toEqual(["person:u1"]);
    for (const view of ["all", "today", "projects", "events", "shortlist"] as const) {
      expect(ids(cardsInView(cards, view)), view).not.toContain("person:u1");
    }
  });
});

describe("peopleLine", () => {
  it("pluralizes", () => {
    expect(peopleLine(1)).toBe("1 person");
    expect(peopleLine(12)).toBe("12 people");
  });
});

describe("organization cards", () => {
  const org = (extra: Partial<DeskOrgInput> = {}): DeskOrgInput => ({
    _id: "o1",
    name: "Abiding Practice",
    slug: "abiding-practice",
    category: "Collective",
    tagline: "Spiritual formation for artists",
    location: "San Diego, CA",
    logoUrl: "https://img/ap.png",
    peopleCount: 3,
    ...extra,
  });

  it("belong to People alone, with their own id and kicker", () => {
    const card = orgCard(org());
    expect(card.id).toBe("org:o1");
    expect(card.kind).toBe("org");
    expect(card.sections).toEqual(["people"]);
    expect(card.face.kicker).toBe("ORGANIZATION");
    expect(card.face.title).toBe("Abiding Practice");
  });
  it("show the logo as the picture, and no picture without one", () => {
    expect(orgCard(org()).image).toBe("https://img/ap.png");
    expect(orgCard(org({ logoUrl: null })).image).toBeNull();
    expect(orgCard(org({ logoUrl: undefined })).image).toBeNull();
  });
  it("put the category and place in the foot, falling back to how many people", () => {
    expect(orgCard(org()).face.foot).toBe("Collective \u00b7 San Diego, CA");
    expect(orgCard(org({ location: null })).face.foot).toBe("Collective");
    expect(orgCard(org({ category: null, location: null })).face.foot).toBe("3 people");
    expect(orgCard(org({ category: null, location: null, peopleCount: 0 })).face.foot).toBeNull();
  });
  it("leave out the 'Other' category, which says nothing", () => {
    const card = orgCard(org({ category: "Other", location: null }));
    expect(card.face.foot).toBe("3 people");
    expect(card.detail.meta).toBe("ORGANIZATION");
  });
  it("open to the tagline, the place, the people count and a button to its page", () => {
    const { detail, href } = orgCard(org());
    expect(detail.meta).toBe("ORGANIZATION \u00b7 COLLECTIVE");
    expect(detail.title).toBe("Abiding Practice");
    expect(detail.host).toBe("San Diego, CA");
    expect(detail.description).toBe("Spiritual formation for artists");
    expect(detail.aside).toBe("3 people");
    expect(detail.action).toEqual({ kind: "link", label: "See organization", href: "/orgs/abiding-practice" });
    expect(href).toBe("/orgs/abiding-practice");
  });
  it("say nothing about people at zero, or about a tagline it doesn't have", () => {
    const card = orgCard(org({ peopleCount: 0, tagline: null, location: null }));
    expect(card.detail.aside).toBeNull();
    expect(card.detail.description).toBe("");
    expect(card.detail.host).toBeNull();
    expect(orgCard(org({ peopleCount: undefined })).detail.aside).toBeNull();
  });
  it("opens as a sheet without a logo, and with its logo's side when it has one", () => {
    expect(opensAsSheet(orgCard(org({ logoUrl: null })))).toBe(true);
    expect(opensAsSheet(orgCard(org()))).toBe(false);
  });
  it("keep their own color wherever they show", () => {
    expect(orgCard(org()).tone).toBe(toneFor("org:o1"));
  });
  it("never reach Favorites or Today", () => {
    const cards = buildDeskCards(input({}), "garden");
    expect(cards.some((c) => c.kind === "org")).toBe(false);
  });
});

describe("empty desks", () => {
  it("make no cards from nothing", () => {
    const cards = buildDeskCards(input({ events: [], projects: [], fund: null, grant: null, people: [] }), "garden");
    expect(cards).toEqual([]);
  });
});

describe("copy", () => {
  it("never says 'Be the first'", () => {
    const cards = buildDeskCards(
      input({ people: [{ _id: "u1", name: "Ann" }] }),
      "garden",
    );
    const text = JSON.stringify(cards);
    expect(text).not.toMatch(/be the first/i);
    expect(text).not.toMatch(/\b0 going\b/);
  });
});

describe("helpers", () => {
  it("gives a card the same dark tone every time", () => {
    expect(toneFor("event:abc")).toBe(toneFor("event:abc"));
    expect(toneFor("event:abc")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("plainText strips tags, entities and markdown", () => {
    expect(plainText("<p>One</p><p>Two &amp; three</p>")).toBe("One Two & three");
    expect(plainText("## Heading\n\n**Bold** and [a link](https://x.test).")).toBe("Heading Bold and a link.");
    expect(plainText("a&nbsp;b &#39;c&#39;")).toBe("a b 'c'");
    expect(plainText(null)).toBe("");
  });

  it("plainText cuts a long text at a word", () => {
    const long = "word ".repeat(200);
    const out = plainText(long, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });

  it("venueName keeps a street number with its street", () => {
    expect(venueName("Light Church, 123 Main St, Carlsbad, CA")).toBe("Light Church");
    expect(venueName("123 Main St, Carlsbad, CA")).toBe("123 Main St, Carlsbad");
    expect(venueName("")).toBe("");
    expect(venueName(null)).toBe("");
  });

  it("a card with no picture opens as a sheet; a note keeps its face", () => {
    expect(opensAsSheet({ image: null, note: false })).toBe(true);
    expect(opensAsSheet({ image: "https://x.test/a.jpg", note: false })).toBe(false);
    expect(opensAsSheet({ image: null, note: true })).toBe(false);
  });

});

describe("update cards", () => {
  it("are dark cards from the house: UPDATE, the title, no picture", () => {
    const card = updateCard(update(1), ["all", "today"]);
    expect(card.id).toBe("update:u1");
    expect(card.kind).toBe("update");
    expect(card.note).toBe(false);
    expect(card.image).toBeNull();
    expect(card.face).toEqual({ kicker: "UPDATE", title: "Update 1", foot: null });
    expect(card.tone).toBe(toneFor("update:u1"));
    expect(card.updateId).toBe("u1");
  });

  it("take the picture when there is one, and then open beside it", () => {
    const card = updateCard(update(1, { imageUrl: "https://img/u1.jpg" }), ["all"]);
    expect(card.image).toBe("https://img/u1.jpg");
    expect(opensAsSheet(card)).toBe(false);
    expect(opensAsSheet(updateCard(update(2), ["all"]))).toBe(true);
  });

  it("open to the whole body, line breaks kept, not cut like other descriptions", () => {
    const body = `${"A long line of text. ".repeat(25)}\n\nSecond paragraph.`;
    const card = updateCard(update(1, { body }), ["all"]);
    expect(card.detail.meta).toBe("UPDATE");
    expect(card.detail.title).toBe("Update 1");
    expect(card.detail.description).toBe(body);
    expect(card.detail.description.length).toBeGreaterThan(360);
  });

  it("have no button without a label and a link", () => {
    expect(updateCard(update(1), ["all"]).detail.action).toBeNull();
    expect(updateCard(update(1, { actionLabel: "Go" }), ["all"]).detail.action).toBeNull();
    expect(updateCard(update(1, { actionUrl: "/events" }), ["all"]).detail.action).toBeNull();
  });

  it("follow an in-app path in the app and open an https link in a new tab", () => {
    expect(updateCard(update(1, { actionLabel: "Meet people", actionUrl: "/today?view=people" }), ["all"]).detail.action).toEqual({
      kind: "update",
      label: "Meet people",
      href: "/today?view=people",
      external: false,
      updateId: "u1",
    });
    expect(updateCard(update(2, { actionLabel: "Read", actionUrl: "https://example.com/post" }), ["all"]).detail.action).toEqual({
      kind: "update",
      label: "Read",
      href: "https://example.com/post",
      external: true,
      updateId: "u2",
    });
  });
});

function celebration(n: number, extra: Partial<DeskCelebrationInput> = {}): DeskCelebrationInput {
  return {
    _id: `n${n}`,
    type: "encouragement",
    title: `Dana cheered on Project ${n}`,
    message: "Love where this is going.",
    linkUrl: `/projects/p${n}`,
    createdAt: NOW - n * 60_000,
    from: { userId: "user-dana", profileId: "profile-dana", name: "Dana Lee", imageUrl: null },
    ...extra,
  };
}

describe("Celebrations on the canvas", () => {
  it("come first, ahead of the Updates, and share their two resting slots", () => {
    const cards = buildDeskCards(input({ celebrations: [celebration(1)], updates: [update(1), update(2)] }), "garden");
    expect(ids(cards).slice(0, 3)).toEqual(["celebration:n1", "update:u1", "update:u2"]);
    const resting = ids(cardsInView(cards, "all"));
    expect(resting).toContain("celebration:n1");
    expect(resting).toContain("update:u1");
    expect(resting).not.toContain("update:u2");
    expect(ids(cardsInView(cards, "today")).slice(0, 3)).toEqual(["celebration:n1", "update:u1", "update:u2"]);
  });

  it("leave the default canvas's count where it was", () => {
    const without = cardsInView(buildDeskCards(input({ updates: [update(1), update(2)] }), "garden"), "all").length;
    const withThree = cardsInView(
      buildDeskCards(input({ celebrations: [celebration(1), celebration(2), celebration(3)], updates: [update(1), update(2)] }), "garden"),
      "all",
    );
    expect(withThree.length).toBe(without);
    expect(ids(withThree).filter((id) => id.startsWith("update:"))).toEqual([]);
  });

  it("lead a cheer with their words and hands clapping, and say thanks to the person", () => {
    const card = celebrationCard(celebration(1), ["all"], money);
    expect(card.kind).toBe("celebration");
    expect(card.note).toBe(false);
    expect(card.face).toEqual({ kicker: "CHEER", title: "“Love where this is going.”", foot: "Dana cheered on Project 1", icon: "clap" });
    expect(card.detail.title).toBe("Dana cheered on Project 1");
    expect(card.detail.description).toBe("Love where this is going.");
    expect(card.detail.action).toEqual({
      kind: "celebration",
      button: { kind: "thanks", label: "Say thanks", userId: "user-dana" },
      notificationId: "n1",
    });
    expect(card.href).toBe("/projects/p1");
  });

  it("link the person and the project they mention", () => {
    const card = celebrationCard(
      celebration(1, {
        title: "Dana Lee cheered on Project 1",
        from: { userId: "user-dana", profileId: "profile-dana", name: "Dana Lee", imageUrl: null },
        project: { title: "Project 1", href: "/projects/p1" },
      }),
      ["all"],
      money,
    );
    expect(card.detail.links).toEqual([
      { text: "Dana Lee", href: "/profile/profile-dana" },
      { text: "Project 1", href: "/projects/p1" },
    ]);
  });

  it("make an award a paper note: the amount, signed by the fund, with a trophy", () => {
    const card = celebrationCard(
      celebration(2, {
        type: "fund_award",
        title: "The Sophia Fund awarded you $500",
        message: "Small Acts",
        linkUrl: "/fund/abiding-practice",
        from: null,
        amountCents: 50_000,
        fund: { name: "The Sophia Fund", href: "/fund/abiding-practice" },
        project: { title: "Small Acts", href: "/projects/p2" },
      }),
      ["all"],
      money,
    );
    expect(card.note).toBe(true);
    expect(card.image).toBeNull();
    expect(card.face).toEqual({ kicker: "AWARD", title: money(50_000), foot: "The Sophia Fund", icon: "trophy", script: true });
    expect(card.detail.action).toEqual({
      kind: "celebration",
      button: { kind: "link", label: "See the fund", href: "/fund/abiding-practice" },
      notificationId: "n2",
    });
    expect(card.detail.links?.map((l) => l.text)).toEqual(["Small Acts", "The Sophia Fund"]);
    expect(card.celebrationType).toBe("fund_award");
  });

  it("keep an older award (no amount, no fund) readable", () => {
    const card = celebrationCard(
      celebration(2, { type: "fund_award", title: "The Sophia Fund awarded you $500", message: "Small Acts", linkUrl: "/fund/x", from: null }),
      ["all"],
      money,
    );
    expect(card.face).toEqual({ kicker: "AWARD", title: "Small Acts", foot: null, icon: "trophy" });
  });

  it("lead a backing with the amount and coins", () => {
    const card = celebrationCard(
      celebration(3, { type: "backing_received", title: "Dana backed Project 3", message: "$25.00 a month", amountCents: 2500 }),
      ["all"],
      money,
    );
    expect(card.face).toEqual({ kicker: "BACKING", title: money(2500), foot: "Dana backed Project 3", icon: "coins", large: true });
  });

  it("wear the person's photo when there is one, and nothing when it's someone unnamed", () => {
    const named = celebrationCard(celebration(1, { from: { userId: "u", profileId: "p", name: "Dana", imageUrl: "https://img/dana.jpg" } }), [], money);
    expect(named.image).toBe("https://img/dana.jpg");
    const hidden = celebrationCard(celebration(1, { title: "Someone cheered on Project 1", from: null }), [], money);
    expect(hidden.image).toBeNull();
    expect(hidden.detail.links).toEqual([]);
    expect(hidden.detail.action).toEqual({
      kind: "celebration",
      button: { kind: "link", label: "See the project", href: "/projects/p1" },
      notificationId: "n1",
    });
  });
});

describe("Updates on the desk", () => {
  const four = [update(1), update(2), update(3), update(4)];

  it("come first, in the order the server gave", () => {
    const cards = buildDeskCards(input({ updates: four }), "garden");
    expect(ids(cards).slice(0, 4)).toEqual(["update:u1", "update:u2", "update:u3", "update:u4"]);
    expect(cards[4].kind).toBe("event");
  });

  it("put at most two on the default desk, and all of them in Today, first", () => {
    const cards = buildDeskCards(input({ updates: four }), "garden");
    expect(ALL_VIEW_UPDATES).toBe(2);
    expect(ids(cardsInView(cards, "all")).filter((id) => id.startsWith("update:"))).toEqual(["update:u1", "update:u2"]);
    const today = ids(cardsInView(cards, "today"));
    expect(today.slice(0, 4)).toEqual(["update:u1", "update:u2", "update:u3", "update:u4"]);
    expect(today.slice(4)).toEqual(["event:e1", "fund", "grant"]);
  });

  it("stay off People, Projects, Events and the Shortlist", () => {
    const cards = buildDeskCards(input({ updates: four }), "garden");
    for (const view of ["people", "projects", "events", "shortlist"] as const) {
      expect(ids(cardsInView(cards, view)).some((id) => id.startsWith("update:")), view).toBe(false);
    }
  });

  it("keep the default desk at six: the events give way, the third first", () => {
    const one = ids(cardsInView(buildDeskCards(input({ updates: [update(1)] }), "garden"), "all"));
    expect(one).toEqual(["update:u1", "event:e1", "event:e2", "fund", "grant", "project:p1"]);
    const two = ids(cardsInView(buildDeskCards(input({ updates: [update(1), update(2)] }), "garden"), "all"));
    expect(two).toEqual(["update:u1", "update:u2", "event:e1", "fund", "grant", "project:p1"]);
    const many = ids(cardsInView(buildDeskCards(input({ updates: four }), "garden"), "all"));
    expect(many.length).toBe(ALL_VIEW_MAX);
    expect(many).toEqual(two);
  });

  it("never push out the fund, the grant or the featured project", () => {
    const cards = buildDeskCards(input({ updates: four, events: [event(1), event(2), event(3)] }), "garden");
    const all = ids(cardsInView(cards, "all"));
    expect(all).toEqual(expect.arrayContaining(["fund", "grant", "project:p1"]));
  });

  it("leave the events their three places when the desk has room", () => {
    const cards = buildDeskCards(input({ updates: [update(1), update(2)], fund: null, grant: null, projects: [] }), "garden");
    expect(ids(cardsInView(cards, "all"))).toEqual(["update:u1", "update:u2", "event:e1", "event:e2", "event:e3"]);
  });

  it("change nothing when there are none", () => {
    const cards = buildDeskCards(input(), "garden");
    expect(ids(cardsInView(cards, "all"))).toEqual(["event:e1", "event:e2", "event:e3", "fund", "grant", "project:p1"]);
    expect(cards.some((c) => c.kind === "update")).toBe(false);
  });

  it("show in either community", () => {
    for (const community of ["garden", "exchange"] as const) {
      expect(buildDeskCards(input({ updates: [update(1)] }), community)[0].id).toBe("update:u1");
    }
  });
});
