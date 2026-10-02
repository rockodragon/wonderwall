import { describe, expect, it } from "vitest";
import { CLAIMS } from "../constants/claims";
import {
  buildDeskCards,
  cardsInView,
  dateKicker,
  inCommunity,
  plainText,
  tailLabel,
  timeLabel,
  toneFor,
  venueName,
  type DeskCard,
  type DeskEventInput,
  type DeskInput,
  type DeskProjectInput,
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

function input(extra: Partial<DeskInput> = {}): DeskInput {
  return {
    now: NOW,
    events: [event(1), event(2), event(3), event(4), event(5)],
    favoriteEventIds: [],
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

  it("add Favorites for a hearted event, from an array or a set", () => {
    for (const hearted of [["e2"], new Set(["e2"])]) {
      const cards = buildDeskCards(input({ favoriteEventIds: hearted }), "garden");
      expect(byId(cards, "event:e2").sections).toContain("fav");
      expect(byId(cards, "event:e1").sections).not.toContain("fav");
    }
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

  it("read the stage, or PAID WORK, and the owner", () => {
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
    expect(byId(cards, "project:b").face.kicker).toBe("PAID WORK");
    expect(byId(cards, "project:b").detail.aside).toBe("$400");
    expect(byId(cards, "project:b").image).toBeNull();
  });

  it("show what a passion project has raised, exactly", () => {
    const cards = buildDeskCards(
      input({ projects: [project("a", { goal: 1000, raisedCents: 12_550, resolvedPhotoUrl: "https://img/a.jpg" })] }),
      "garden",
    );
    expect(byId(cards, "project:a").detail.aside).toBe("$125.50 of $1,000 raised");
  });

  it("open to the blurb and a link to the project", () => {
    const card = byId(buildDeskCards(input(), "garden"), "project:p2");
    expect(card.detail.description).toBe("Making a thing.");
    expect(card.detail.action).toEqual({ kind: "link", label: "See project", href: "/projects/p2" });
  });
});

describe("person cards", () => {
  it("belong to People and Favorites", () => {
    const cards = buildDeskCards(input({ people: [{ _id: "u1", name: "Ann Cole", imageUrl: "https://img/ann.jpg", interests: ["other:x", "Painter"] }] }), "garden");
    const card = byId(cards, "person:u1");
    expect(card.sections).toEqual(["people", "fav"]);
    expect(card.face).toEqual({ kicker: "FOLLOWING", title: "Ann Cole", foot: "Painter" });
    expect(card.image).toBe("https://img/ann.jpg");
    expect(card.detail.action).toEqual({ kind: "link", label: "See profile", href: "/profile/u1" });
    expect(card.profileId).toBe("u1");
  });

  it("make the Favorites view out of hearted events and followed people", () => {
    const cards = buildDeskCards(input({ favoriteEventIds: ["e2"], people: [{ _id: "u1", name: "Ann" }] }), "garden");
    expect(ids(cardsInView(cards, "fav"))).toEqual(["event:e2", "person:u1"]);
    expect(ids(cardsInView(cards, "people"))).toEqual(["person:u1"]);
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
      input({ people: [{ _id: "u1", name: "Ann" }], favoriteEventIds: ["e1"] }),
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

  it("tailLabel reads 'All N things →'", () => {
    expect(tailLabel("events", 12)).toBe("All 12 events →");
    expect(tailLabel("projects", 5)).toBe("All 5 projects →");
    expect(tailLabel("people", 7)).toBe("All 7 people →");
    expect(tailLabel("fav", 9)).toBe("All 9 favorites →");
  });
});
