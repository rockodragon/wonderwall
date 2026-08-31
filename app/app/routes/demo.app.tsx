// /demo/app — The Garden, as an app. No explainer chrome: a sticky top bar,
// five sections, and a detail layer one click below every card. Affordances
// are computed live from can(persona, …) — switch personas on the bar below
// and the same cards offer different things.
// Client-only, read-only against demo-data — no loaders, no mutation.

import { useEffect, useState, type ReactNode } from "react";
import { DemoProvider, PersonaBar, useDemo } from "../garden/demo-context";
import { can } from "../garden/capabilities";
import type { CanResult, GardenUser } from "../garden/capabilities";
import {
  DASHBOARD,
  OFFERS,
  PERSONAS,
  PERSONA_TAGLINE,
  PROJECTS,
  TABLES,
  type DemoOffer,
  type DemoProject,
  type DemoTable,
} from "../garden/demo-data";
import { IconEvent, IconPeople, IconPlace } from "../garden/icons";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "The Garden — app" },
    { name: "robots", content: "noindex" },
  ];
}

// ————— Glue data: events aren't in demo-data.ts yet, so they're kept here,
// named and shaped the same way (id, when/where/cost facts, a host). —————

interface DemoEvent {
  id: string;
  title: string;
  format: string;
  when: string;
  where: string;
  cost: string;
  hostByLine: string;
  hostId?: string;
  program?: string;
  desc: string;
}

const EVENTS: DemoEvent[] = [
  {
    id: "gathering",
    title: "A table for the ones making things",
    format: "Gathering",
    when: "Thu Sep 18 · 7:00pm",
    where: "Folded Note Records · South Park",
    cost: "Free",
    hostByLine: "Hosted by The Garden",
    desc: "An open table for anyone making something right now — no pitch, no sign-up, just a room and the people already in it.",
  },
  {
    id: "workshop",
    title: "Hearing God in the Edit",
    format: "Workshop",
    when: "One evening · date TBA",
    where: "Abiding Practice",
    cost: "$15",
    hostByLine: "Hosted by Abiding Practice",
    program: "Pathfinding · Abiding Practice",
    desc: "A one-evening workshop on editing as a spiritual practice — for anyone in the middle of a piece of work and stuck on what to cut.",
  },
  {
    id: "openmic",
    title: "Songwriters' night at Grounds & Common",
    format: "Open mic",
    when: "Monthly · date TBA",
    where: "Grounds & Common · North Park · partner venue",
    cost: "Free",
    hostByLine: "Hosted by Marcus Reyes",
    hostId: "marcus",
    desc: "Walk in, sign up, play two songs. Grounds & Common opens their floor once a month for whoever's in the room.",
  },
];

const MODE_LINE: Record<DemoTable["mode"], string> = {
  open: "Anyone can join, account or not.",
  member: "A seat gets you a place at it — no walk-ins.",
  cohort: "A fixed group for a fixed term.",
};

/** Cost-aware RSVP/Register button copy — free events say "RSVP — free",
    priced events say "Register — $N" with the actual price. */
function eventCta(cost: string): { label: string; note: string } {
  const isFree = cost.trim().toLowerCase() === "free";
  return isFree
    ? { label: "RSVP — free", note: "You're RSVP'd — free." }
    : { label: `Register — ${cost}`, note: `You're registered — ${cost}.` };
}

/** Cap per cohort table — not tracked in demo-data.ts, so it lives here next
    to the label logic that reads it. */
const COHORT_CAP: Record<string, number> = {
  "winter-cohort": 10,
  "pathfinding-fall": 12,
};

function cohortJoinLabel(table: DemoTable): string {
  const price = table.cadence.match(/\$(\d+)/)?.[1] ?? "";
  const cap = COHORT_CAP[table.id] ?? table.roster;
  const seatsLeft = cap - table.roster;
  if (seatsLeft > 0 && seatsLeft <= 2) {
    const seatWord = seatsLeft === 1 ? "the last seat" : `the last ${seatsLeft} seats`;
    return `$${price} · ${table.roster} of ${cap} seated — take ${seatWord}`;
  }
  const start = table.cadence.match(/starts (\w+)/)?.[1];
  return start ? `$${price} · starts ${start}` : `$${price}`;
}

/** The one offer with a walkable owner in this cast. */
const OFFER_OWNER_ID: Record<string, string | undefined> = {
  "foldednote-backroom": "foldednote",
};

const NAV_ITEMS = ["Buzz", "People", "Projects", "Events", "Tables", "Offers"] as const;
type NavItem = (typeof NAV_ITEMS)[number];

/** creatives.exchange hosts communities; each keeps its own name and its own
    word for a gathering. Switching here changes the vocabulary on screen —
    that's the open question in the discussion brief (§5.1) made visible. */
const COMMUNITIES = [
  { id: "garden", name: "The Garden", tableWord: "Tables", blurb: "San Diego · the founding community" },
  { id: "ap", name: "Abiding Practice", tableWord: "Cohorts", blurb: "Spiritual creative formation" },
  { id: "tas", name: "Table Art Society", tableWord: "Studios", blurb: "Working creatives, around a table" },
  { id: "rabbit", name: "The Rabbit Room", tableWord: "Chapters", blurb: "Story, music, and craft" },
] as const;
type Community = (typeof COMMUNITIES)[number];

type DetailKind = "project" | "event" | "table" | "offer";
interface ViewState {
  section: NavItem;
  detail?: { kind: DetailKind; id: string };
}

const TABLE_FILTERS = ["All", "Class", "Mentorship", "Critique", "Open mic"] as const;
const PROJECT_FILTERS = ["All", "Passion", "Paid"] as const;
const EVENT_FILTERS = ["All", "Gathering", "Workshop", "Open mic"] as const;
const OFFER_FILTERS = ["All", "Space", "Goods", "Audience", "Coaching"] as const;

/** One descriptor sentence per section, verbatim — founder-approved copy. */
const SECTION_DESCRIPTOR: Record<NavItem, string> = {
  Buzz: "The week at a glance — what's coming up, and what just got posted.",
  People: "Who's here and what they've made — portfolios, and a way to reach them.",
  Projects: "Creative work seeking support, and paid work seeking creatives.",
  Events: "Shows, workshops, open mics — pick a night and show up.",
  Tables:
    "Groups you join and keep coming back to — classes, cohorts, critique nights. A roster with your name on it.",
  Offers:
    "Space to work, gear to borrow, audiences to reach, coaching to book — offered by the community.",
};

// ————— Small shared pieces —————

/** Section title + one descriptor line — the same intro treatment for all
    five sections. */
function SectionIntro({ section }: { section: NavItem }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 className="g-h" style={{ fontSize: 20 }}>
        {section}
      </h2>
      <p
        style={{
          marginTop: 6,
          fontSize: 15,
          lineHeight: 1.5,
          color: "var(--g-body)",
          maxWidth: "58ch",
        }}
      >
        {SECTION_DESCRIPTOR[section]}
      </p>
    </div>
  );
}

function KindBadge({ project }: { project: DemoProject }) {
  return project.kind === "passion" ? (
    <span className="g-badge g-badge-line">Passion</span>
  ) : (
    <span className="g-badge g-badge-citron">Paid · ${project.budget?.toLocaleString()}</span>
  );
}

function FormatBadge({ children }: { children: string }) {
  return <span className="g-badge g-badge-line">{children}</span>;
}

/** Every offer states free or priced — a price badge when there's a price,
    a "Free" badge when there isn't. */
function PriceBadge({ price }: { price?: string }) {
  return price ? (
    <span className="g-badge g-badge-line">{price}</span>
  ) : (
    <span className="g-badge g-badge-line" style={{ color: "var(--g-body)" }}>
      Free
    </span>
  );
}

function MetaLine({ children }: { children: ReactNode }) {
  return (
    <div
      className="g-mono"
      style={{
        fontSize: 10.5,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--g-dim)",
      }}
    >
      {children}
    </div>
  );
}

/** Secondary text under 14px — muted, never dim; the readable floor. */
function Small({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--g-muted)", ...style }}>
      {children}
    </p>
  );
}

function FactRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
      <span className="g-label" style={{ minWidth: 66, flexShrink: 0 }}>
        {k}
      </span>
      <span style={{ fontSize: 14.5, color: "var(--g-paper)" }}>{v}</span>
    </div>
  );
}

/** A CanResult, rendered as an invitation: what it is, then the path in. */
function GateHint({ result }: { result: CanResult }) {
  return (
    <div style={{ marginTop: 4, maxWidth: "50ch" }}>
      <p style={{ fontSize: 14, lineHeight: 1.55 }}>{result.reason}</p>
      {result.upgradePath ? (
        <button className="g-btn g-btn-citron" style={{ marginTop: 12 }}>
          {result.upgradePath}
        </button>
      ) : null}
    </div>
  );
}

function ActionNote({ children }: { children: ReactNode }) {
  return (
    <p style={{ marginTop: 14, fontSize: 13.5, color: "var(--g-citron)" }}>{children}</p>
  );
}

/** Card content that opens a detail view — a real button, keyboard reachable. */
function Clickable({
  onClick,
  children,
  style,
  className,
  ariaLabel,
}: {
  onClick: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
      style={{
        all: "unset",
        boxSizing: "border-box",
        display: "block",
        width: "100%",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** A row of pressable chips — one active at a time. Powers every browse
    filter (Projects/Events/Tables/Offers) and doubles as the kind-choice
    control inside AddAction create panels. Same chip styling everywhere. */
function FilterChips<T extends string>({
  options,
  active,
  onSelect,
}: {
  options: readonly T[];
  active: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className="g-demo-chip"
          data-active={active === opt}
          aria-pressed={active === opt}
          onClick={() => onSelect(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/** The "+" affordance every browse section gets: a toggle that expands into
    either a compact create panel (capability allows it) or a warm inline
    denial (it doesn't) — never "X-only" wording. `children` is a render prop
    so the create panel can close itself after posting. */
function AddAction({
  label,
  allowed,
  deniedContent,
  children,
}: {
  label: string;
  allowed: boolean;
  deniedContent: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        className="g-btn g-btn-ghost"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            border: "1px solid var(--g-hairline)",
            borderRadius: 8,
            maxWidth: 440,
          }}
        >
          {allowed ? children(() => setOpen(false)) : deniedContent}
        </div>
      )}
    </div>
  );
}

// ————— Browse: Buzz —————

function BuzzSection({
  onOpenDetail,
}: {
  onOpenDetail: (kind: DetailKind, id: string) => void;
}) {
  const firstEvent = EVENTS[0];
  const justPosted = PROJECTS.slice(0, 3);
  return (
    <div>
      <Clickable
        onClick={() => onOpenDetail("event", firstEvent.id)}
        ariaLabel={firstEvent.title}
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
          border: "1px solid var(--g-hairline)",
          borderRadius: 8,
          padding: "14px 16px",
        }}
      >
        <IconEvent size={16} className="g-ic" />
        <span className="g-h" style={{ fontSize: 15.5 }}>
          {firstEvent.title}
        </span>
        <MetaLine>
          {firstEvent.when.split(" · ")[0]} · {firstEvent.cost}
        </MetaLine>
      </Clickable>

      <div className="g-label" style={{ marginTop: 28 }}>
        Just posted
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        {justPosted.map((p) => (
          <Clickable
            key={p.id}
            onClick={() => onOpenDetail("project", p.id)}
            ariaLabel={p.title}
            style={{ border: "1px solid var(--g-hairline)", borderRadius: 8, padding: 12 }}
          >
            {p.photo && <img src={p.photo} alt={p.title} className="g-photo-strip" />}
            <div className="g-h" style={{ fontSize: 15, marginTop: 10 }}>
              {p.title}
            </div>
            <div className="g-credit" style={{ marginTop: 6 }}>
              {p.byLine}
            </div>
          </Clickable>
        ))}
      </div>
    </div>
  );
}

// ————— Browse: Projects —————

const PROJECT_KIND_LABEL: Record<DemoProject["kind"], "Passion" | "Paid"> = {
  passion: "Passion",
  paid: "Paid",
};

function ProjectsSection({
  persona,
  onOpenDetail,
}: {
  persona: GardenUser;
  onOpenDetail: (kind: DetailKind, id: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof PROJECT_FILTERS)[number]>("All");
  const [added, setAdded] = useState<DemoProject[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DemoProject["kind"]>("passion");

  useEffect(() => {
    setAdded([]);
    setTitle("");
    setKind("passion");
  }, [persona.id]);

  const passionGate = can(persona, "project.create.passion");
  const paidGate = can(persona, "project.create.paid");
  const allowedKinds: DemoProject["kind"][] = [
    ...(passionGate.allowed ? (["passion"] as const) : []),
    ...(paidGate.allowed ? (["paid"] as const) : []),
  ];
  const canAdd = allowedKinds.length > 0;
  const chosenKind: DemoProject["kind"] = allowedKinds.includes(kind) ? kind : allowedKinds[0] ?? "passion";

  const post = (close: () => void) => {
    if (!title.trim()) return;
    const id = `local-project-${Date.now()}`;
    const base = {
      id,
      title: title.trim(),
      byId: persona.id,
      byLine: `${persona.name} · new`,
      blurb: "",
    };
    const newProject: DemoProject =
      chosenKind === "passion" ? { ...base, kind: "passion" } : { ...base, kind: "paid", budget: 0 };
    setAdded((a) => [newProject, ...a]);
    setTitle("");
    close();
  };

  const all = [...added, ...PROJECTS];
  const shown = filter === "All" ? all : all.filter((p) => PROJECT_KIND_LABEL[p.kind] === filter);

  return (
    <div>
      <AddAction label="+ Start a project" allowed={canAdd} deniedContent={<GateHint result={passionGate} />}>
        {(close) => (
          <div>
            <input
              className="g-input"
              placeholder="Project title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {allowedKinds.length > 1 && (
              <div style={{ marginTop: 10 }}>
                <FilterChips
                  options={allowedKinds.map((k) => PROJECT_KIND_LABEL[k])}
                  active={PROJECT_KIND_LABEL[chosenKind]}
                  onSelect={(label) => setKind(label === "Passion" ? "passion" : "paid")}
                />
              </div>
            )}
            <button className="g-btn g-btn-citron" style={{ marginTop: 12 }} onClick={() => post(close)}>
              Post it
            </button>
          </div>
        )}
      </AddAction>

      <div style={{ marginBottom: 16 }}>
        <FilterChips options={PROJECT_FILTERS} active={filter} onSelect={(v) => setFilter(v)} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 14,
        }}
      >
        {shown.map((p) => {
          const isNew = added.includes(p);
          return (
            <Clickable
              key={p.id}
              onClick={isNew ? () => {} : () => onOpenDetail("project", p.id)}
              ariaLabel={p.title}
              className="g-card"
              style={{ padding: 0, overflow: "hidden" }}
            >
              {p.photo && <img src={p.photo} alt={p.title} className="g-photo" />}
              <div style={{ padding: "16px 18px 18px" }}>
                <KindBadge project={p} />
                <div className="g-h" style={{ fontSize: 17, marginTop: 10 }}>
                  {p.title}
                </div>
                <div className="g-credit" style={{ marginTop: 6 }}>
                  {p.byLine}
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 10 }}>{p.blurb}</p>
                {p.kind === "passion" && p.backers && (
                  <Small style={{ marginTop: 10 }}>Behind it: {p.backers.join(", ")}</Small>
                )}
              </div>
            </Clickable>
          );
        })}
      </div>
    </div>
  );
}

// ————— Browse: Events —————

function EventsSection({
  persona,
  onOpenDetail,
}: {
  persona: GardenUser;
  onOpenDetail: (kind: DetailKind, id: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof EVENT_FILTERS)[number]>("All");
  const [added, setAdded] = useState<DemoEvent[]>([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    setAdded([]);
    setTitle("");
  }, [persona.id]);

  const gate = can(persona, "event.create");

  const post = (close: () => void) => {
    if (!title.trim()) return;
    const id = `local-event-${Date.now()}`;
    setAdded((a) => [
      {
        id,
        title: title.trim(),
        format: "Gathering",
        when: "Date TBA",
        where: "",
        cost: "Free",
        hostByLine: `Hosted by ${persona.name}`,
        desc: "",
      },
      ...a,
    ]);
    setTitle("");
    close();
  };

  const all = [...added, ...EVENTS];
  const shown = filter === "All" ? all : all.filter((e) => e.format === filter);

  return (
    <div>
      <AddAction label="+ Add an event" allowed={gate.allowed} deniedContent={<GateHint result={gate} />}>
        {(close) => (
          <div>
            <input
              className="g-input"
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p style={{ marginTop: 10, fontSize: 13, color: "var(--g-dim)" }}>
              Date TBA — you can set the date later.
            </p>
            <button className="g-btn g-btn-citron" style={{ marginTop: 12 }} onClick={() => post(close)}>
              Post it
            </button>
          </div>
        )}
      </AddAction>

      <div style={{ marginBottom: 16 }}>
        <FilterChips options={EVENT_FILTERS} active={filter} onSelect={(v) => setFilter(v)} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 14,
        }}
      >
        {shown.map((e) => {
          const isNew = added.includes(e);
          return (
            <Clickable
              key={e.id}
              onClick={isNew ? () => {} : () => onOpenDetail("event", e.id)}
              ariaLabel={e.title}
              className="g-card"
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div className="g-h" style={{ fontSize: 16.5 }}>
                  {e.title}
                </div>
                <FormatBadge>{e.format}</FormatBadge>
              </div>
              {e.program && (
                <div className="g-credit" style={{ marginTop: 6 }}>
                  <b>{e.program}</b>
                </div>
              )}
              <MetaLine>
                {e.when} · {e.cost}
              </MetaLine>
            </Clickable>
          );
        })}
      </div>
    </div>
  );
}

// ————— Browse: Tables —————

function TableCard({
  table,
  onOpenDetail,
  noop,
}: {
  table: DemoTable;
  onOpenDetail: (kind: DetailKind, id: string) => void;
  noop?: boolean;
}) {
  return (
    <Clickable
      onClick={() => {
        if (!noop) onOpenDetail("table", table.id);
      }}
      ariaLabel={table.name}
      className="g-card"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        {table.format && <FormatBadge>{table.format}</FormatBadge>}
      </div>
      <div className="g-h" style={{ fontSize: 17, marginTop: 10 }}>
        {table.name}
      </div>
      {table.program && (
        <div className="g-credit" style={{ marginTop: 6 }}>
          <b>{table.program}</b>
        </div>
      )}
      <MetaLine>{table.cadence}</MetaLine>
      <Small style={{ marginTop: 8 }}>{table.roster} on the roster</Small>
    </Clickable>
  );
}

function TablesSection({
  persona,
  onOpenDetail,
}: {
  persona: GardenUser;
  onOpenDetail: (kind: DetailKind, id: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof TABLE_FILTERS)[number]>("All");
  const [added, setAdded] = useState<DemoTable[]>([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    setAdded([]);
    setTitle("");
  }, [persona.id]);

  const gate = can(persona, "table.create");

  const post = (close: () => void) => {
    if (!title.trim()) return;
    const id = `local-table-${Date.now()}`;
    setAdded((a) => [
      {
        id,
        name: title.trim(),
        hostId: persona.id,
        mode: "open",
        format: "Open mic",
        cadence: "Ongoing",
        roster: 0,
      },
      ...a,
    ]);
    setTitle("");
    close();
  };

  const all = [...added, ...TABLES];
  const shown = filter === "All" ? all : all.filter((t) => t.format === filter);

  return (
    <div>
      <AddAction label="+ Create a table" allowed={gate.allowed} deniedContent={<GateHint result={gate} />}>
        {(close) => (
          <div>
            <input
              className="g-input"
              placeholder="Table name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p style={{ marginTop: 10, fontSize: 13, color: "var(--g-dim)" }}>
              Open to anyone · Open mic format.
            </p>
            <button className="g-btn g-btn-citron" style={{ marginTop: 12 }} onClick={() => post(close)}>
              Post it
            </button>
          </div>
        )}
      </AddAction>

      <FilterChips options={TABLE_FILTERS} active={filter} onSelect={(v) => setFilter(v)} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 14,
          marginTop: 16,
        }}
      >
        {shown.map((t) => (
          <TableCard key={t.id} table={t} onOpenDetail={onOpenDetail} noop={added.includes(t)} />
        ))}
      </div>
    </div>
  );
}

// ————— Browse: Offers —————

function CompactOfferCard({
  offer,
  onOpenDetail,
  noop,
}: {
  offer: DemoOffer;
  onOpenDetail: (kind: DetailKind, id: string) => void;
  noop?: boolean;
}) {
  const ByIcon = offer.byKind === "person" ? IconPeople : IconPlace;
  return (
    <Clickable
      onClick={() => {
        if (!noop) onOpenDetail("offer", offer.id);
      }}
      ariaLabel={offer.by}
      className="g-card"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ByIcon size={16} className="g-ic" />
        <div className="g-h" style={{ fontSize: 15 }}>
          {offer.by}
        </div>
      </div>
      <div className="g-credit" style={{ marginTop: 6 }}>
        {offer.where}
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--g-hairline)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="g-badge g-badge-line" style={{ color: "var(--g-citron)", borderColor: "#3a3a36" }}>
            {offer.kind}
          </span>
          <PriceBadge price={offer.price} />
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8 }}>{offer.desc}</p>
        <MetaLine>{offer.cadence}</MetaLine>
      </div>
    </Clickable>
  );
}

const OFFER_KIND_OPTIONS = ["Space", "Goods", "Audience", "Coaching"] as const;

function OffersSection({
  persona,
  onOpenDetail,
}: {
  persona: GardenUser;
  onOpenDetail: (kind: DetailKind, id: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof OFFER_FILTERS)[number]>("All");
  const [added, setAdded] = useState<DemoOffer[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof OFFER_KIND_OPTIONS)[number]>("Space");

  useEffect(() => {
    setAdded([]);
    setTitle("");
    setKind("Space");
  }, [persona.id]);

  // No capability exists for offer-listing yet — the simple check the plan calls for.
  const canList = persona.partnerRole || persona.level === "host";

  const post = (close: () => void) => {
    if (!title.trim()) return;
    const id = `local-offer-${Date.now()}`;
    setAdded((a) => [
      {
        id,
        by: title.trim(),
        byKind: "place",
        where: `Listed by ${persona.name}`,
        kind,
        desc: "",
        cadence: "",
        claimed: true,
      },
      ...a,
    ]);
    setTitle("");
    close();
  };

  const all = [...added, ...OFFERS];
  const shown = filter === "All" ? all : all.filter((o) => o.kind === filter);

  return (
    <div>
      <AddAction
        label="+ List an offer"
        allowed={canList}
        deniedContent={<Small>Hosts and partners can list offers.</Small>}
      >
        {(close) => (
          <div>
            <input
              className="g-input"
              placeholder="What are you offering?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div style={{ marginTop: 10 }}>
              <FilterChips options={OFFER_KIND_OPTIONS} active={kind} onSelect={(v) => setKind(v)} />
            </div>
            <button className="g-btn g-btn-citron" style={{ marginTop: 12 }} onClick={() => post(close)}>
              Post it
            </button>
          </div>
        )}
      </AddAction>

      <div style={{ marginBottom: 16 }}>
        <FilterChips options={OFFER_FILTERS} active={filter} onSelect={(v) => setFilter(v)} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          gap: 12,
        }}
      >
        {shown.map((o) => (
          <CompactOfferCard key={o.id} offer={o} onOpenDetail={onOpenDetail} noop={added.includes(o)} />
        ))}
      </div>
    </div>
  );
}

// ————— Detail: shared frame —————

function DetailFrame({
  backLabel,
  onBack,
  children,
}: {
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="g-mono"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--g-muted)",
        }}
      >
        ← Back to {backLabel}
      </button>
      <div style={{ marginTop: 20, maxWidth: 640 }}>{children}</div>
    </div>
  );
}

// ————— Detail: Project —————

function ProjectDetail({
  project,
  persona,
  note,
  onNote,
}: {
  project: DemoProject;
  persona: GardenUser;
  note: string | null;
  onNote: (n: string) => void;
}) {
  const isOwner = persona.id === project.byId;

  return (
    <div>
      {project.photo && (
        <img
          src={project.photo}
          alt={project.title}
          style={{ width: "100%", height: 280, objectFit: "cover", borderRadius: 8, display: "block", filter: "saturate(0.85)" }}
        />
      )}
      <div style={{ marginTop: 16 }}>
        <KindBadge project={project} />
      </div>
      <h1 className="g-h" style={{ marginTop: 12, fontSize: "clamp(26px,4.5vw,36px)" }}>
        {project.title}
      </h1>
      <div className="g-credit" style={{ marginTop: 8 }}>
        {project.byLine}
      </div>
      <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6, maxWidth: "62ch" }}>
        {project.blurb}
      </p>

      {project.kind === "passion" && project.goal !== undefined && (
        <div style={{ marginTop: 22, maxWidth: 360 }}>
          <div className="g-label">Goal</div>
          <div
            style={{
              marginTop: 8,
              height: 6,
              borderRadius: 3,
              background: "var(--g-hairline)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${Math.min(100, ((project.raised ?? 0) / project.goal) * 100)}%`,
                background: "var(--g-paper)",
                borderRight: "2px solid var(--g-citron)",
              }}
            />
          </div>
          <p style={{ marginTop: 8, fontSize: 14, color: "var(--g-paper)" }}>
            ${project.raised ?? 0} of ${project.goal}
          </p>
        </div>
      )}

      {project.kind === "passion" && project.backers && project.backers.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="g-label">Backers</div>
          <p style={{ marginTop: 8, fontSize: 14.5 }}>{project.backers.join(", ")}</p>
        </div>
      )}

      {project.kind === "passion" && (
        <div style={{ marginTop: 20 }}>
          <div className="g-label">Updates</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span className="g-label" style={{ minWidth: 48, flexShrink: 0 }}>
                Day 1
              </span>
              <span style={{ fontSize: 14 }}>Tracking day one — the back room at Folded Note.</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {project.kind === "passion" ? (
          isOwner ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                className="g-btn g-btn-citron"
                onClick={() => onNote("Update posted — it lands on this page.")}
              >
                Post an update
              </button>
              <button className="g-btn g-btn-ghost" onClick={() => onNote("Marked finished.")}>
                Mark finished
              </button>
            </div>
          ) : can(persona, "project.pledge").allowed ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="g-btn g-btn-citron" onClick={() => onNote("Pledge noted — thank you.")}>
                Pledge to this project
              </button>
              <button className="g-btn g-btn-ghost" onClick={() => onNote("Following.")}>
                Follow
              </button>
            </div>
          ) : persona.level === "seat" || persona.level === "five" || persona.level === "host" ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="g-btn g-btn-citron" onClick={() => onNote("Offer sent.")}>
                Offer to help
              </button>
              <button className="g-btn g-btn-ghost" onClick={() => onNote("Following.")}>
                Follow
              </button>
            </div>
          ) : (
            <div>
              <button className="g-btn g-btn-ghost" onClick={() => onNote("Following.")}>
                Follow
              </button>
              <p style={{ marginTop: 12, fontSize: 14, maxWidth: "50ch" }}>
                Pledging is a patron act — add the patron role, free.
              </p>
            </div>
          )
        ) : isOwner ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="g-btn g-btn-citron" onClick={() => onNote("Edit — demo, no editor wired yet.")}>
              Edit
            </button>
            <button className="g-btn g-btn-ghost" onClick={() => onNote("Listing closed.")}>
              Close listing
            </button>
          </div>
        ) : can(persona, "project.applyPaid").allowed ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="g-btn g-btn-citron" onClick={() => onNote("Application sent.")}>
              Apply
            </button>
            <button className="g-btn g-btn-ghost" onClick={() => onNote("Question sent.")}>
              Ask a question
            </button>
          </div>
        ) : (
          <GateHint result={can(persona, "project.applyPaid")} />
        )}
      </div>
      {note && <ActionNote>{note}</ActionNote>}
    </div>
  );
}

// ————— Detail: Event —————

function EventDetail({
  event,
  persona,
  note,
  onNote,
}: {
  event: DemoEvent;
  persona: GardenUser;
  note: string | null;
  onNote: (n: string) => void;
}) {
  const isHostOwner = !!event.hostId && persona.id === event.hostId;
  const cta = eventCta(event.cost);

  return (
    <div>
      <FormatBadge>{event.format}</FormatBadge>
      <h1 className="g-h" style={{ marginTop: 12, fontSize: "clamp(26px,4.5vw,36px)" }}>
        {event.title}
      </h1>
      <div className="g-credit" style={{ marginTop: 8 }}>
        {event.hostByLine}
      </div>
      {event.program && (
        <div className="g-credit" style={{ marginTop: 4 }}>
          <b>{event.program}</b>
        </div>
      )}

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
        <FactRow k="When" v={event.when} />
        <FactRow k="Where" v={event.where} />
        <FactRow k="Cost" v={event.cost} />
      </div>

      <p style={{ marginTop: 18, fontSize: 15, lineHeight: 1.6, maxWidth: "62ch" }}>{event.desc}</p>

      <div style={{ marginTop: 24 }}>
        {isHostOwner ? (
          <button
            className="g-btn g-btn-ghost"
            onClick={() => onNote("Manage event — demo, no dashboard wired yet.")}
          >
            Manage event
          </button>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="g-btn g-btn-citron" onClick={() => onNote(cta.note)}>
              {cta.label}
            </button>
            <button className="g-btn g-btn-ghost" onClick={() => onNote("Noted — bring someone.")}>
              Bring someone
            </button>
          </div>
        )}
      </div>
      {note && <ActionNote>{note}</ActionNote>}
    </div>
  );
}

// ————— Detail: Table —————

function TableDetail({
  table,
  persona,
  note,
  onNote,
}: {
  table: DemoTable;
  persona: GardenUser;
  note: string | null;
  onNote: (n: string) => void;
}) {
  const isHostOwner = persona.id === table.hostId;
  const rosterNames = table.id === "third-thursday" ? DASHBOARD.people.map((p) => p.name) : null;
  const rosterExtra = rosterNames ? table.roster - rosterNames.length : 0;
  const memberGate = can(persona, "table.join.member");

  return (
    <div>
      {table.format && <FormatBadge>{table.format}</FormatBadge>}
      <h1 className="g-h" style={{ marginTop: 12, fontSize: "clamp(26px,4.5vw,36px)" }}>
        {table.name}
      </h1>
      {table.program && (
        <div className="g-credit" style={{ marginTop: 8 }}>
          <b>{table.program}</b>
        </div>
      )}

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10, maxWidth: 460 }}>
        <FactRow k="Cadence" v={table.cadence} />
        <FactRow k="Mode" v={MODE_LINE[table.mode]} />
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="g-label">Roster</div>
        <p style={{ marginTop: 8, fontSize: 14.5 }}>
          {rosterNames
            ? `${rosterNames.join(", ")}${rosterExtra > 0 ? ` — and ${rosterExtra} more` : ""}.`
            : `${table.roster} on the roster.`}
        </p>
      </div>

      <div style={{ marginTop: 24 }}>
        {isHostOwner ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              className="g-btn g-btn-citron"
              onClick={() => onNote("Manage table — demo, no dashboard wired yet.")}
            >
              Manage table
            </button>
            <button className="g-btn g-btn-ghost" onClick={() => onNote("Invite kit ready — link + QR.")}>
              Invite kit (link + QR)
            </button>
          </div>
        ) : table.mode === "open" ? (
          <button className="g-btn g-btn-citron" onClick={() => onNote("Joined — free.")}>
            Join — free
          </button>
        ) : table.mode === "member" ? (
          memberGate.allowed ? (
            <button className="g-btn g-btn-citron" onClick={() => onNote("Joined.")}>
              Join
            </button>
          ) : (
            <GateHint result={memberGate} />
          )
        ) : (
          <button className="g-btn g-btn-citron" onClick={() => onNote("Seat held — check your messages.")}>
            {cohortJoinLabel(table)}
          </button>
        )}
      </div>
      {note && <ActionNote>{note}</ActionNote>}
    </div>
  );
}

// ————— Detail: Offer —————

function OfferDetail({
  offer,
  persona,
  note,
  onNote,
}: {
  offer: DemoOffer;
  persona: GardenUser;
  note: string | null;
  onNote: (n: string) => void;
}) {
  const isOwner = OFFER_OWNER_ID[offer.id] === persona.id;
  const ByIcon = offer.byKind === "person" ? IconPeople : IconPlace;
  const messageTarget = offer.byKind === "person" ? offer.by.split(" ")[0] : offer.by;

  return (
    <div>
      {offer.photo && (
        <img
          src={offer.photo}
          alt={offer.by}
          style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 8, display: "block", filter: "saturate(0.85)" }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
        <ByIcon size={18} className="g-ic" />
        <h1 className="g-h" style={{ fontSize: "clamp(24px,4.5vw,32px)" }}>
          {offer.by}
        </h1>
      </div>
      <div className="g-credit" style={{ marginTop: 8 }}>
        {offer.where}
        {!offer.claimed && " · unclaimed"}
      </div>
      {offer.program && (
        <div className="g-credit" style={{ marginTop: 4 }}>
          <b>{offer.program}</b>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <span className="g-badge g-badge-line" style={{ color: "var(--g-citron)", borderColor: "#3a3a36" }}>
          {offer.kind}
        </span>
        <PriceBadge price={offer.price} />
      </div>

      <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6, maxWidth: "62ch" }}>{offer.desc}</p>

      <div style={{ marginTop: 18, maxWidth: 420 }}>
        <FactRow k="Cadence" v={offer.price ? `${offer.cadence} · ${offer.price}` : offer.cadence} />
      </div>

      <div style={{ marginTop: 24 }}>
        {isOwner ? (
          <button className="g-btn g-btn-ghost" onClick={() => onNote("Edit listing — demo, no editor wired yet.")}>
            Edit listing
          </button>
        ) : (
          <button className="g-btn g-btn-citron" onClick={() => onNote(`Message sent to ${messageTarget}.`)}>
            Message {messageTarget}
          </button>
        )}
      </div>
      {note && <ActionNote>{note}</ActionNote>}
    </div>
  );
}

// ————— Detail router —————

function DetailView({
  detail,
  persona,
  note,
  onNote,
  onBack,
}: {
  detail: { kind: DetailKind; id: string };
  persona: GardenUser;
  note: string | null;
  onNote: (n: string) => void;
  onBack: () => void;
}) {
  if (detail.kind === "project") {
    const project = PROJECTS.find((p) => p.id === detail.id);
    if (!project) return null;
    return (
      <DetailFrame backLabel="Projects" onBack={onBack}>
        <ProjectDetail project={project} persona={persona} note={note} onNote={onNote} />
      </DetailFrame>
    );
  }
  if (detail.kind === "event") {
    const event = EVENTS.find((e) => e.id === detail.id);
    if (!event) return null;
    return (
      <DetailFrame backLabel="Events" onBack={onBack}>
        <EventDetail event={event} persona={persona} note={note} onNote={onNote} />
      </DetailFrame>
    );
  }
  if (detail.kind === "table") {
    const table = TABLES.find((t) => t.id === detail.id);
    if (!table) return null;
    return (
      <DetailFrame backLabel="Tables" onBack={onBack}>
        <TableDetail table={table} persona={persona} note={note} onNote={onNote} />
      </DetailFrame>
    );
  }
  const offer = OFFERS.find((o) => o.id === detail.id);
  if (!offer) return null;
  return (
    <DetailFrame backLabel="Offers" onBack={onBack}>
      <OfferDetail offer={offer} persona={persona} note={note} onNote={onNote} />
    </DetailFrame>
  );
}

// ————— Top bar —————

/** Community picker. You're in ONE community at a time; the others live
    behind a dropdown rather than a strip under the nav (that read as
    clutter). Membership and portfolio travel with the person. */
function CommunityPicker({
  community,
  onSelect,
}: {
  community: Community;
  onSelect: (c: Community) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="g-mono"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "1px solid var(--g-hairline)",
          borderRadius: 3,
          padding: "6px 10px",
          cursor: "pointer",
          color: "var(--g-paper)",
          fontSize: 13,
          letterSpacing: "0.06em",
        }}
      >
        {community.name}
        <span aria-hidden="true" style={{ color: "var(--g-dim)" }}>
          {open ? "\u25B4" : "\u25BE"}
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 60,
            minWidth: 230,
            background: "#0f0f0e",
            border: "1px solid var(--g-hairline)",
            borderRadius: 6,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {COMMUNITIES.map((c) => {
            const on = c.id === community.id;
            return (
              <button
                key={c.id}
                role="option"
                aria-selected={on}
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                }}
                style={{
                  textAlign: "left",
                  background: on ? "#1c1c19" : "transparent",
                  border: "none",
                  borderLeft: `2px solid ${on ? "var(--g-citron)" : "transparent"}`,
                  borderRadius: 3,
                  padding: "9px 12px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontSize: 14.5,
                    color: on ? "var(--g-citron)" : "var(--g-paper)",
                  }}
                >
                  {c.name}
                </div>
                <div className="g-hint" style={{ marginTop: 2 }}>
                  {c.blurb}
                </div>
              </button>
            );
          })}
          <div className="g-hint" style={{ padding: "8px 12px 4px", borderTop: "1px solid var(--g-hairline)", marginTop: 4 }}>
            One account, one portfolio — you move between communities.
          </div>
        </div>
      )}
    </div>
  );
}

/** People — portfolios and reach-out. NOTE: profiles, portfolios, search and
    messaging are already built in the core app (/works, /search,
    /profile/:id, /messages); this section is the Garden-side entry to them,
    which the earlier IA omitted. */
function PeopleSection({ community }: { community: Community }) {
  const cast = PERSONAS.filter((p) => p.id !== "foldednote");
  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
          gap: 14,
        }}
      >
        {cast.map((p) => {
          const work = PROJECTS.find((w) => w.byId === p.id);
          return (
            <div key={p.id} className="g-card" style={{ padding: 0, overflow: "hidden" }}>
              {work?.photo && (
                <img src={work.photo} alt={`Work by ${p.name}`} className="g-photo" />
              )}
              <div style={{ padding: "16px 18px 18px" }}>
                <div className="g-h" style={{ fontSize: 17 }}>
                  {p.name}
                </div>
                <div className="g-credit" style={{ marginTop: 4 }}>
                  {PERSONA_TAGLINE[p.id]?.split("·")[0]?.trim()}
                </div>
                {work && (
                  <p style={{ fontSize: 14.5, color: "var(--g-body)", marginTop: 10 }}>
                    Latest: {work.title}
                  </p>
                )}
                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span className="g-btn g-btn-ghost">View portfolio</span>
                  <span className="g-btn g-btn-ghost">Message</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="g-hint" style={{ marginTop: 16 }}>
        Portfolios, search, and messaging already exist in the core app — this
        is the {community.name} entry point to them.
      </p>
    </>
  );
}

function TopBar({
  active,
  onSelect,
  persona,
  community,
  onCommunity,
}: {
  active: NavItem;
  onSelect: (n: NavItem) => void;
  persona: GardenUser;
  community: Community;
  onCommunity: (c: Community) => void;
}) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "var(--g-ink)",
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
        padding: "14px 20px",
        borderBottom: "1px solid var(--g-hairline)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          className="g-mono"
          style={{
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--g-dim)",
          }}
        >
          creatives.exchange
        </span>
      </div>
      <CommunityPicker community={community} onSelect={onCommunity} />
      <nav style={{ display: "flex", gap: 16, flexWrap: "wrap", flex: 1 }}>
        {NAV_ITEMS.map((n) => (
          <button
            key={n}
            onClick={() => onSelect(n)}
            className="g-mono"
            aria-pressed={active === n}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 15,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "4px 0",
              color: active === n ? "var(--g-citron)" : "var(--g-body)",
              borderBottom: active === n ? "2px solid var(--g-citron)" : "2px solid transparent",
            }}
          >
            {n === "Tables" ? community.tableWord : n}
          </button>
        ))}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          className="g-mono"
          title="Unread messages"
          style={{
            fontSize: 10,
            border: "1px solid var(--g-hairline)",
            borderRadius: "50%",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--g-body)",
          }}
        >
          {DASHBOARD.today.unread}
        </span>
        <span
          className="g-mono"
          title={persona.name}
          style={{
            fontSize: 10,
            border: "1px solid var(--g-hairline)",
            borderRadius: "50%",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--g-paper)",
          }}
        >
          {persona.name.charAt(0).toUpperCase()}
        </span>
      </div>
    </div>
  );
}

// ————— The app —————

function AppShell() {
  const { persona } = useDemo();
  const [view, setView] = useState<ViewState>({ section: "Buzz" });
  const [note, setNote] = useState<string | null>(null);
  const [community, setCommunity] = useState<Community>(COMMUNITIES[0]);

  useEffect(() => {
    setNote(null);
  }, [view.section, view.detail?.id, persona.id]);

  const goSection = (section: NavItem) => setView({ section });
  const openDetail = (kind: DetailKind, id: string) =>
    setView((v) => ({ ...v, detail: { kind, id } }));
  const closeDetail = () => setView((v) => ({ section: v.section }));

  return (
    <>
      <TopBar
        active={view.section}
        onSelect={goSection}
        persona={persona}
        community={community}
        onCommunity={setCommunity}
      />
      <div className="g-wrap g-wrap-wide">
        {view.detail ? (
          <DetailView detail={view.detail} persona={persona} note={note} onNote={setNote} onBack={closeDetail} />
        ) : (
          <>
            <SectionIntro section={view.section} />
            {view.section === "Buzz" && <BuzzSection onOpenDetail={openDetail} />}
            {view.section === "People" && <PeopleSection community={community} />}
            {view.section === "Projects" && <ProjectsSection persona={persona} onOpenDetail={openDetail} />}
            {view.section === "Events" && <EventsSection persona={persona} onOpenDetail={openDetail} />}
            {view.section === "Tables" && <TablesSection persona={persona} onOpenDetail={openDetail} />}
            {view.section === "Offers" && <OffersSection persona={persona} onOpenDetail={openDetail} />}
          </>
        )}
      </div>
    </>
  );
}

export default function GardenApp() {
  return (
    <div className="garden-root">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <DemoProvider>
        <AppShell />
        <PersonaBar />
      </DemoProvider>
    </div>
  );
}
