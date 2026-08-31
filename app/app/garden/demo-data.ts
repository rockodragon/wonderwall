// The Garden — seeded demo world. One coherent San Diego cast used by every
// /demo flow, so the walkthrough tells a single story. Read-only module:
// flows keep their own transient state (useState/localStorage), never mutate this.

import type { GardenUser } from "./capabilities";

// ————— The cast —————

export const PERSONAS: GardenUser[] = [
  {
    id: "maya",
    name: "Maya Chen",
    level: "free",
    patronRole: false,
    partnerRole: false,
    activePassionProjects: 0,
  },
  {
    id: "shua",
    name: "Shua",
    level: "seat",
    coveredBy: "Grace Fellowship",
    patronRole: false,
    partnerRole: false,
    activePassionProjects: 1,
  },
  {
    id: "tessa",
    name: "Tessa Barrio",
    level: "five",
    patronRole: false,
    partnerRole: false,
    activePassionProjects: 5,
  },
  {
    id: "marcus",
    name: "Marcus Reyes",
    level: "host",
    patronRole: false,
    partnerRole: false,
    activePassionProjects: 2,
  },
  {
    id: "diane",
    name: "Diane Okafor",
    level: "free",
    patronRole: true,
    partnerRole: false,
    activePassionProjects: 0,
  },
  {
    id: "foldednote",
    name: "Folded Note Records",
    level: "free",
    patronRole: false,
    partnerRole: true,
    activePassionProjects: 0,
  },
];

export const PERSONA_TAGLINE: Record<string, string> = {
  maya: "Illustrator · free account · hits every gate",
  shua: "Songwriter · covered seat (Grace Fellowship) · 1 passion project",
  tessa: "Zine maker · five seats · at her cap",
  marcus: "Host · Third Thursday Songwriters · keeps 90% of what he sells",
  diane: "Patron · covers Shua's seat",
  foldednote: "Partner · record shop, South Park",
};

// ————— Projects —————

export interface DemoProject {
  id: string;
  kind: "passion" | "paid";
  title: string;
  byId: string;
  byLine: string;
  blurb: string;
  budget?: number; // paid only — the declared-budget guardrail
  goal?: number; // passion only
  raised?: number;
  backers?: string[]; // names, never counts-as-metrics
  photo?: string; // verified Unsplash IDs only (reused from docs/mocks)
}

const u = (id: string, w = 640) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

/** Verified imagery, all previously curl-checked for the mock set. */
export const PHOTOS = {
  recordShop: u("photo-1508700115892-45ecd05ae2ad"),
  cafe: u("photo-1554118811-1e0d58224f24"),
  mic: u("photo-1521337581100-8ca9a73a5f79"),
  guitar: u("photo-1510915361894-db8b60106cb1"),
  vinyl: u("photo-1514320291840-2e0a9bf2a9ae"),
  stage: u("photo-1470229722913-7c0e2dbbafd3"),
  crowd: u("photo-1529156069898-49953e39b3ac"),
  writing: u("photo-1455390582262-044cdead277a"),
  concert: u("photo-1465847899084-d164df4dedc6"),
  songwriters: u("photo-1493225457124-a3eb161ffa5f"),
} as const;

export const PROJECTS: DemoProject[] = [
  {
    id: "psalms",
    photo: PHOTOS.mic,
    kind: "passion",
    title: "Psalms for the 2AM",
    byId: "shua",
    byLine: "Shua · songwriter",
    blurb:
      "Five songs for the hours nobody writes worship music about. Tracking at Folded Note's back room.",
    goal: 500,
    raised: 340,
    backers: ["Diane Okafor", "Grace Fellowship", "Marcus Reyes"],
  },
  {
    id: "hillcrest-zine",
    photo: PHOTOS.writing,
    kind: "passion",
    title: "Hillcrest, Drawn Slow",
    byId: "tessa",
    byLine: "Tessa Barrio · zine maker",
    blurb: "A 32-page risograph love letter to one neighborhood, drawn on foot.",
    goal: 350,
    raised: 350,
    backers: ["Abiding Practice"],
  },
  {
    id: "mural",
    photo: PHOTOS.recordShop,
    kind: "paid",
    title: "Back-room mural",
    byId: "foldednote",
    byLine: "Folded Note Records · partner",
    blurb: "One wall, 14 feet, in the back room. We cover materials; you keep creative control.",
    budget: 1200,
  },
  {
    id: "wedding-films",
    photo: PHOTOS.crowd,
    kind: "paid",
    title: "Two wedding films, spring",
    byId: "diane",
    byLine: "Diane Okafor · patron",
    blurb: "My niece's wedding and one other. Looking for a filmmaker with a documentary style — real moments over posed shots.",
    budget: 800,
  },
  {
    id: "ap-fellowship",
    photo: PHOTOS.stage,
    kind: "paid",
    title: "Abiding Practice Fellowship",
    byId: "ap",
    byLine: "Abiding Practice · sponsor",
    blurb: "$500/mo for a season of work you couldn't otherwise make. October showcase.",
    budget: 500,
  },
];

// ————— Tables & events —————

export interface DemoTable {
  id: string;
  name: string;
  hostId: string;
  mode: "open" | "member" | "cohort";
  /** Format tag — the human label on the card (decided 2026-08-10).
      Machinery follows mode; visitors read this. */
  format?: "Workshop" | "Class" | "Mentorship" | "Critique" | "Show" | "Open mic";
  /** Program byline for tenant brands, e.g. "Pathfinding · Abiding Practice". */
  program?: string;
  cadence: string;
  roster: number;
  spawnUrl?: string;
}

export const TABLES: DemoTable[] = [
  {
    id: "third-thursday",
    name: "Third Thursday Songwriters",
    hostId: "marcus",
    mode: "open",
    format: "Open mic",
    cadence: "3rd Thursdays · Folded Note back room",
    roster: 24,
    spawnUrl: "garden.app/t/third-thursday/spawn",
  },
  {
    id: "winter-cohort",
    name: "Winter Songwriting Cohort",
    hostId: "marcus",
    mode: "cohort",
    format: "Class",
    cadence: "8 weeks · $40 · starts Jan",
    roster: 9,
  },
  {
    id: "critique-table",
    name: "Illustrators' Critique Table",
    hostId: "marcus",
    mode: "member",
    format: "Critique",
    cadence: "2nd Tuesdays · members only",
    roster: 12,
  },
  {
    id: "mentorship-circle",
    name: "Working Creatives Mentorship Circle",
    hostId: "ap",
    mode: "member",
    format: "Mentorship",
    program: "Pathfinding · Abiding Practice",
    cadence: "Monthly · members",
    roster: 8,
  },
  {
    id: "pathfinding-fall",
    name: "Pathfinding — Fall Cohort",
    hostId: "ap",
    mode: "cohort",
    format: "Class",
    program: "Pathfinding · Abiding Practice",
    cadence: "8 weeks · $120 · starts Oct · ends at the showcase",
    roster: 12,
  },
];

// ————— Offers (partner-light, extended to people 2026-08-10) —————
// One shape for "a standing thing you can take someone up on": a shop's back
// room, a mailing list, or a person's coaching. Same directory, same card.

export interface DemoOffer {
  id: string;
  by: string; // person or place
  byKind: "person" | "place";
  where: string;
  kind: "Space" | "Goods" | "Audience" | "Coaching" | "Mentorship";
  desc: string;
  cadence: string;
  price?: string; // absent = free / relationship-priced
  program?: string; // tenant byline
  photo?: string;
  claimed: boolean;
}

export const OFFERS: DemoOffer[] = [
  {
    id: "foldednote-backroom",
    by: "Folded Note Records",
    byKind: "place",
    where: "Shop · South Park",
    kind: "Space",
    desc: "The back room",
    cadence: "3rd Thursdays",
    photo: PHOTOS.recordShop,
    claimed: true,
  },
  {
    id: "grounds-audience",
    by: "Grounds & Common",
    byKind: "place",
    where: "Café · North Park",
    kind: "Audience",
    desc: "2,400-person mailing list, one feature a month",
    cadence: "Monthly",
    photo: PHOTOS.cafe,
    claimed: true,
  },
  {
    id: "david-coaching",
    by: "David Russo",
    byKind: "person",
    where: "Host · Abiding Practice",
    kind: "Coaching",
    desc: "1:1 spiritual creative coaching — a season of sessions around your work",
    cadence: "Weekly or biweekly",
    price: "$60/session",
    program: "Pathfinding · Abiding Practice",
    claimed: true,
  },
  {
    id: "ranchroll-prints",
    by: "Ranch & Roll Print Co.",
    byKind: "place",
    where: "Print shop · Barrio Logan",
    kind: "Goods",
    desc: "10 free prints a month · zine binding at cost",
    cadence: "Recurring",
    claimed: false,
  },
];

// ————— Coverage (church codes) —————

export const COVERAGE = {
  sponsor: "Grace Fellowship",
  code: "GRACE-FALL",
  qrUrl: "garden.app/c/GRACE-FALL",
  seats: 10,
  redeemed: 6,
  redeemedBy: ["Shua", "Amara V.", "Ben C.", "Lupe R.", "Theo K.", "Naomi S."],
};

// ————— Host dashboard (Marcus) —————

export const DASHBOARD = {
  today: {
    nextEvent: "Third Thursday · tomorrow 7pm",
    rsvps: 19,
    newThisWeek: 3,
    unread: 2,
  },
  // People with provenance — how each person arrived, never a raw count wall
  people: [
    { name: "Shua", via: "Grace Fellowship code", joined: "Jun", lastSeen: "3d" },
    { name: "Amara V.", via: "brought by Shua", joined: "Jul", lastSeen: "1d" },
    { name: "Ben C.", via: "walked in — open table", joined: "Jul", lastSeen: "12d" },
    { name: "Lupe R.", via: "QR at Folded Note", joined: "Aug", lastSeen: "2d" },
    { name: "Theo K.", via: "Grace Fellowship code", joined: "Aug", lastSeen: "34d" },
  ],
  goneQuiet: ["Theo K.", "Ben C."],
  attendance: [
    { event: "May table", came: 11 },
    { event: "Jun table", came: 14 },
    { event: "Jul table", came: 18 },
    { event: "Aug table", came: 16 },
  ],
  // Money — the ledger that lands at the $324 payout
  ledger: [
    { item: "Winter cohort · 9 × $40, minus 10% platform", amount: 324.0 },
    { item: "Open tables · always free", amount: 0 },
  ],
  payout: 324.0,
  payoutNote:
    "Hosting is free — you keep 90% of what your paid tables collect; cohort collections pay out per term.",
};

export function getPersona(id: string): GardenUser {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}
