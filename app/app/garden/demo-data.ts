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
  marcus: "Host · Third Thursday Songwriters · charging host, $0 base",
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
}

export const PROJECTS: DemoProject[] = [
  {
    id: "psalms",
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
    kind: "paid",
    title: "Back-room mural",
    byId: "foldednote",
    byLine: "Folded Note Records · partner",
    blurb: "One wall, 14 feet, your take on 'the neon wall'. Paint on us.",
    budget: 1200,
  },
  {
    id: "wedding-films",
    kind: "paid",
    title: "Two wedding films, spring",
    byId: "diane",
    byLine: "Diane Okafor · patron",
    blurb: "My niece's and one more. Looking for a filmmaker who shoots like memory feels.",
    budget: 800,
  },
  {
    id: "ap-fellowship",
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
    cadence: "3rd Thursdays · Folded Note back room",
    roster: 24,
    spawnUrl: "garden.app/t/third-thursday/spawn",
  },
  {
    id: "winter-cohort",
    name: "Winter Songwriting Cohort",
    hostId: "marcus",
    mode: "cohort",
    cadence: "8 weeks · $40 · starts Jan",
    roster: 9,
  },
  {
    id: "critique-table",
    name: "Illustrators' Critique Table",
    hostId: "marcus",
    mode: "member",
    cadence: "2nd Tuesdays · members only",
    roster: 12,
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
    { item: "Dues share · 24 members × $10 × 40%", amount: 96.0 },
    { item: "Winter cohort · 9 × $40, minus 10% platform", amount: 324.0 },
    { item: "Open tables · always free", amount: 0 },
  ],
  payout: 324.0,
  duesShareNote:
    "Dues shares accrue to your host org monthly; cohort collections pay out per term.",
};

export function getPersona(id: string): GardenUser {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}
