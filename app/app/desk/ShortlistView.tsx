// The Shortlist on the desk (docs/handoff/favorites-redesign/README.md,
// "Three levels"), and Needs you on Today. Everything the member put their
// hand up for, set aside, leads or hosts, in three areas that open up:
//
//   /today?view=shortlist                  the overview: Needs you, three tiles,
//                                          and every item as a row when few
//   /today?view=shortlist&area=projects    one area: chips, then rows grouped
//                                          by the member's relationship
//   …&card=role:<id>                       the opened card (Desk.tsx opens it)
//
// The header's parts (crumb, title, count, the chips that pin) go to
// DeskHeader; the rows sit in the page under it. All of it reads the one
// useShortlist() the Desk holds, so the counts, the dots and Needs you can't
// disagree with the palette's.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { Link, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { BROWSE_LABEL, EMPTY_AREA, FOLD_NOUN, WELCOME, emptyKind, needYouText } from "../components/shortlist/copy";
import {
  AREA_LABEL,
  LIST_ALL_UNDER,
  NEEDS_SHOWN,
  areaGroups,
  cardIdOf,
  everything,
  pastSaveIds,
  type ListGroup,
  type ShortlistItem,
} from "../components/shortlist/items";
import { KIND_LABEL, rowModel, type RowModel } from "../components/shortlist/rowModel";
import { ShortlistRows } from "../components/shortlist/ShortlistRow";
import { TilePreview } from "../components/shortlist/TilePreview";
import { errorMessage } from "../lib/convexError";
import type { NeedsYouItem } from "../lib/shortlist/needsYou";
import { areaCount, type AreaSummary, type ShortlistSummary } from "../lib/shortlist/model";
import type { ShortlistState } from "../lib/shortlist/useShortlist";
import type { ProjectKind } from "../lib/shortlist/types";
import { pillClass } from "./deskBrowse";
import { countLabel } from "./deskGreeting";
import { showDeskToast } from "./DeskToast";
import type { HeaderParts } from "./DeskHeader";
import { GRID_SIDE } from "./deskLayout";
import { SHORTLIST_AREAS, deskHref, shortlistHref, useDeskSpacing, type ShortlistArea } from "./deskState";
import { DESK, DESK_MONO, FOCUS_RING_CLASS, monoLabel } from "./tokens";

type Ready = Extract<ShortlistState, { status: "ready" }>;

/** Rows read best at this measure; past it the status drifts from the title. */
const ROWS_MAX_W = 920;

/** Where an area sends someone who has nothing in it yet; the words are
 *  components/shortlist/copy's, the phone's too. */
const BROWSE_HREF: Record<ShortlistArea, string> = {
  projects: deskHref("projects"),
  events: deskHref("events"),
  people: deskHref("people"),
};

const LINK = `text-[14px] text-[#D6D6D6] no-underline transition-colors hover:text-[#FFE066] ${FOCUS_RING_CLASS}`;
const QUIET_BUTTON = `cursor-pointer border-0 bg-transparent px-0 py-1 text-[14px] text-[#ACACA4] transition-colors hover:text-[#FFE066] ${FOCUS_RING_CLASS}`;

function kicker(hot = false) {
  return { ...monoLabel(12, "0.2em"), margin: "0 0 10px", color: hot ? DESK.accent : DESK.muted, display: "flex", alignItems: "center", gap: 10 } as const;
}
const kickerCount = { color: DESK.muted, letterSpacing: "0.12em" } as const;

/** A section's heading. Focus can land on it (tabIndex -1): Desk.tsx sends it
 *  here when a card closes and the row it was opened from has gone, with no
 *  row left beside it. `id` names it on the page. */
function Heading({ id, hot = false, children }: { id: string; hot?: boolean; children: ReactNode }) {
  return (
    <p tabIndex={-1} data-shortlist-heading={id} className={FOCUS_RING_CLASS} style={kicker(hot)}>
      {children}
    </p>
  );
}

/** A row for a Needs you item. */
function needsRow(item: NeedsYouItem, withArea: boolean, money: (cents: number) => string, now: number): RowModel {
  return rowModel(item, { hot: true, withArea, now, money });
}

// ——————————————————————————————————————————————————————————————
// The header's parts
// ——————————————————————————————————————————————————————————————

/** What the Shortlist puts in the desk's header. The overview: "Shortlist ·
 *  39 things". An area: "THE GARDEN · SHORTLIST" (the crumb goes back),
 *  "Projects 15", and the chips that pin. */
export function shortlistHeader(state: ShortlistState, area: ShortlistArea | null, kind: ProjectKind | null): HeaderParts {
  const ready = state.status === "ready" ? state : null;
  if (!area) {
    const total = ready?.summary.total ?? 0;
    return { count: total > 0 ? countLabel("shortlist", total) : null };
  }
  return {
    crumb: (
      <Link to={shortlistHref()} className={`text-[#ACACA4] no-underline transition-colors hover:text-[#FFE066] ${FOCUS_RING_CLASS}`}>
        Shortlist
      </Link>
    ),
    title: AREA_LABEL[area],
    count: ready ? String(areaCount(ready.summary, area, kind)) : null,
    row: ready ? <ShortlistChips state={ready} area={area} kind={kind} /> : null,
  };
}

function Chip({ on, dot, label, n }: { on: boolean; dot?: boolean; label: string; n: number }) {
  return (
    <>
      {dot && <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: DESK.accent }} />}
      {label}
      <span style={{ fontFamily: DESK_MONO, fontSize: 12, color: on ? DESK.accent : DESK.muted }}>{n}</span>
    </>
  );
}

/** All · Projects · Events · People, a divider, then Paid · Passion on
 *  Projects. An area chip is a link (the active one goes back to the
 *  overview); a kind chip filters in place and clears on a second click. */
function ShortlistChips({ state, area, kind }: { state: Ready; area: ShortlistArea; kind: ProjectKind | null }) {
  const [, setSearchParams] = useSearchParams();
  const { summary } = state;
  const setKind = (next: ProjectKind) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (kind === next) params.delete("kind");
        else params.set("kind", next);
        return params;
      },
      { replace: true },
    );
  return (
    <div role="group" aria-label="Shortlist areas" className="flex flex-wrap items-center gap-2">
      <Link to={shortlistHref()} className={pillClass(false)}>
        <Chip on={false} label="All" n={summary.total} />
      </Link>
      {SHORTLIST_AREAS.map((a) => {
        const on = a === area;
        const needs = summary[a].needsYou > 0;
        return (
          <Link
            key={a}
            to={on ? shortlistHref() : shortlistHref(a)}
            aria-current={on ? "page" : undefined}
            aria-label={`${AREA_LABEL[a]}, ${summary[a].count}${needs ? `, ${summary[a].needsYou} need you` : ""}`}
            className={pillClass(on)}
          >
            <Chip on={on} dot={needs} label={AREA_LABEL[a]} n={summary[a].count} />
          </Link>
        );
      })}
      {area === "projects" && (
        <>
          <span aria-hidden style={{ width: 1, height: 20, margin: "0 6px", background: DESK.lineStrong }} />
          {(["paid", "passion"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={pillClass(kind === k)}>
              <Chip on={kind === k} label={KIND_LABEL[k]} n={summary.projects.kinds[k]} />
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// The page under the header
// ——————————————————————————————————————————————————————————————

export function ShortlistBody({
  state,
  area,
  kind,
  money,
  onOpen,
  inert,
}: {
  state: ShortlistState;
  area: ShortlistArea | null;
  kind: ProjectKind | null;
  money: (cents: number) => string;
  onOpen: (row: RowModel) => void;
  /** A card is open over it. */
  inert: boolean;
}) {
  const side = GRID_SIDE * useDeskSpacing();
  if (state.status !== "ready") return null;
  return (
    // Clear of the palette's corner at the bottom of a long list.
    <div inert={inert} style={{ position: "relative", padding: `8px ${side}px 160px` }}>
      {area ? (
        <AreaRows key={`${area}:${kind ?? ""}`} state={state} area={area} kind={kind} money={money} onOpen={onOpen} />
      ) : (
        <Overview state={state} money={money} onOpen={onOpen} />
      )}
    </div>
  );
}

// ——— Level 1: the overview ———

function Overview({ state, money, onOpen }: { state: Ready; money: (cents: number) => string; onOpen: (row: RowModel) => void }) {
  const { data, needs, summary, now } = state;
  if (summary.total === 0 && needs.length === 0) return <Welcome />;
  const listed = everything(data, now);
  const hot = new Set(needs.map(cardIdOf));
  return (
    <>
      {needs.length > 0 && (
        <section aria-label="Needs you" style={{ maxWidth: ROWS_MAX_W, marginBottom: 40 }}>
          <NeedsYouList needs={needs} money={money} now={now} onOpen={onOpen} />
        </section>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 300px))", gap: 24 }}>
        {SHORTLIST_AREAS.map((area) => (
          <Tile key={area} area={area} summary={summary} />
        ))}
      </div>
      {listed.length <= LIST_ALL_UNDER && listed.length > 0 && (
        <section style={{ maxWidth: ROWS_MAX_W, marginTop: 40 }}>
          <Heading id="everything">Everything on your shortlist · {listed.length}</Heading>
          <ShortlistRows
            rows={listed.map((item) => rowModel(item, { hot: hot.has(cardIdOf(item)), withArea: true, now, money }))}
            onOpen={onOpen}
          />
        </section>
      )}
    </>
  );
}

/** Needs you's rows, NEEDS_SHOWN of them, then "N more →" to see them all. */
function NeedsYouList({ needs, money, now, onOpen }: { needs: NeedsYouItem[]; money: (cents: number) => string; now: number; onOpen: (row: RowModel) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? needs : needs.slice(0, NEEDS_SHOWN);
  return (
    <>
      <Heading id="needs" hot>
        Needs you · {needs.length}
      </Heading>
      <ShortlistRows rows={shown.map((item) => needsRow(item, true, money, now))} onOpen={onOpen} />
      {needs.length > NEEDS_SHOWN && (
        <div style={{ marginTop: 12 }}>
          <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className={`${QUIET_BUTTON} text-[#D6D6D6]`}>
            {all ? "Show fewer" : `${needs.length - NEEDS_SHOWN} more →`}
          </button>
        </div>
      )}
    </>
  );
}

const TILE = {
  position: "relative",
  minHeight: 168,
  minWidth: 0,
  borderRadius: 4,
  padding: "20px 20px 18px",
  display: "flex",
  flexDirection: "column",
  textAlign: "left",
} as const;

/** One area: what's in it, by name. */
function Tile({ area, summary }: { area: ShortlistArea; summary: ShortlistSummary }) {
  const s: AreaSummary = summary[area];
  const name = AREA_LABEL[area];
  const tileKicker = { ...monoLabel(12, "0.2em"), color: DESK.muted } as const;
  if (s.count === 0) {
    // Dashed, never hidden: the three areas keep their places.
    return (
      <div style={{ ...TILE, border: `1px dashed ${DESK.line}` }}>
        <span style={tileKicker}>{name}</span>
        <span style={{ marginTop: "auto", fontSize: 15, color: DESK.muted }}>Nothing saved yet</span>
        <Link to={BROWSE_HREF[area]} className={`${LINK} mt-1 self-start`}>
          {BROWSE_LABEL[area]}
        </Link>
      </div>
    );
  }
  return (
    <Link
      to={shortlistHref(area)}
      aria-label={`${name}, ${s.count}${s.needsYou ? `, ${needYouText(s.needsYou)}` : ""}`}
      className={`group text-[#F4F4F2] no-underline transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-2 hover:border-[#3c3c3c] hover:shadow-[0_40px_80px_rgba(0,0,0,.6)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${FOCUS_RING_CLASS}`}
      style={{ ...TILE, background: DESK.panel, border: `1px solid ${DESK.line}`, boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}
    >
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minHeight: 18 }}>
        <span style={tileKicker}>{`${name} · ${s.count}`}</span>
        {s.needsYou > 0 && (
          <span style={{ fontFamily: DESK_MONO, fontSize: 12, letterSpacing: "0.1em", color: DESK.accent, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: DESK.accent }} />
            {needYouText(s.needsYou)}
          </span>
        )}
      </span>
      <span style={{ display: "block", marginTop: 14 }}>
        <TilePreview area={area} summary={summary} variant="desk" />
      </span>
    </Link>
  );
}

/** A brand-new member: one note and three ways in. */
function Welcome() {
  return (
    <div
      style={{
        maxWidth: 560,
        marginTop: 16,
        padding: "36px 36px 30px",
        borderRadius: 4,
        background: DESK.panel,
        border: `1px solid ${DESK.line}`,
        boxShadow: "0 10px 30px rgba(0,0,0,.45)",
      }}
    >
      <h2 style={{ margin: "0 0 10px", fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>{WELCOME.title}</h2>
      <p style={{ margin: 0, color: DESK.textSoft, maxWidth: "46ch" }}>{WELCOME.body}</p>
      <ul style={{ listStyle: "none", margin: "22px 0 0", padding: "16px 0 0", borderTop: `1px solid ${DESK.line}`, display: "grid", gap: 8 }}>
        {SHORTLIST_AREAS.map((area) => (
          <li key={area}>
            <Link to={BROWSE_HREF[area]} className={LINK}>
              {BROWSE_LABEL[area]}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ——— Level 2: one area ———

function AreaRows({
  state,
  area,
  kind,
  money,
  onOpen,
}: {
  state: Ready;
  area: ShortlistArea;
  kind: ProjectKind | null;
  money: (cents: number) => string;
  onOpen: (row: RowModel) => void;
}) {
  const groups = areaGroups(state.data, state.now, area, kind);
  const rootRef = useRef<HTMLDivElement>(null);
  // Once "Remove past events" has landed and its rows have gone (the query
  // may bring that before the call returns, or after), focus goes to Past's
  // toggle, else (Past went with them) to the heading above it, rather than
  // to the page.
  const [removed, setRemoved] = useState<string[] | null>(null);
  const pastSaves = pastSaveIds(groups.find((g) => g.key === "past") ?? NO_GROUP).join(" ");
  useEffect(() => {
    if (!removed || pastSaves.split(" ").some((id) => removed.includes(id))) return;
    setRemoved(null);
    const root = rootRef.current;
    const headings = root?.querySelectorAll<HTMLElement>("[data-shortlist-heading]");
    const next = root?.querySelector<HTMLElement>('[data-fold="past"]') ?? headings?.[headings.length - 1] ?? root?.querySelector<HTMLElement>("a[href]");
    next?.focus();
  }, [removed, pastSaves]);

  if (groups.length === 0) {
    return (
      <div
        ref={rootRef}
        style={{
          maxWidth: ROWS_MAX_W,
          marginTop: 12,
          padding: "22px 0",
          borderTop: `1px solid ${DESK.line}`,
          borderBottom: `1px solid ${DESK.line}`,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "baseline",
          color: DESK.muted,
          fontSize: 15,
        }}
      >
        <span>{kind ? emptyKind(kind) : EMPTY_AREA[area]}</span>
        <Link to={BROWSE_HREF[area]} className={LINK}>
          {BROWSE_LABEL[area]}
        </Link>
      </div>
    );
  }
  return (
    <div ref={rootRef} style={{ maxWidth: ROWS_MAX_W }}>
      {groups.map((group) => (
        <Group key={group.key} group={group} money={money} now={state.now} onOpen={onOpen} onRemoved={setRemoved} />
      ))}
    </div>
  );
}

const NO_GROUP: ListGroup = { key: "", label: "", hot: false, folded: false, items: [], months: null };

function Group({
  group,
  money,
  now,
  onOpen,
  onRemoved,
}: {
  group: ListGroup;
  money: (cents: number) => string;
  now: number;
  onOpen: (row: RowModel) => void;
  onRemoved: (eventIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rowsId = useId();
  const rows = (items: ShortlistItem[]) => items.map((item) => rowModel(item, { hot: group.hot, withArea: false, past: group.folded, now, money }));
  const n = group.items.length;
  const noun = FOLD_NOUN[group.key] ?? group.label.toLowerCase();
  let body: ReactNode;
  if (group.folded && !open) {
    body = null;
  } else if (group.months) {
    body = group.months.map((month) => (
      <div key={month.key}>
        <p style={{ fontFamily: DESK_MONO, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: DESK.textQuiet, margin: "18px 0 6px" }}>
          {month.label} · {month.items.length}
        </p>
        <ShortlistRows rows={rows(month.items)} onOpen={onOpen} />
      </div>
    ));
  } else {
    body = <ShortlistRows rows={rows(group.items)} onOpen={onOpen} />;
  }
  return (
    <section aria-label={group.label || undefined} style={{ marginTop: group.label ? 32 : 12 }}>
      {group.label && (
        <Heading id={group.key} hot={group.hot}>
          {group.label} <span style={kickerCount}>{n}</span>
        </Heading>
      )}
      {group.folded ? (
        <>
          {/* One toggle that stays put, so focus and aria-expanded stay with it. */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 24px", marginBottom: open ? 12 : 0 }}>
            <button
              type="button"
              data-fold={group.key}
              aria-expanded={open}
              aria-controls={rowsId}
              onClick={() => setOpen((v) => !v)}
              className={QUIET_BUTTON}
            >
              {open ? `Hide ${noun}` : `Show ${n} ${noun}`}
            </button>
            <RemovePast eventIds={pastSaveIds(group)} onRemoved={onRemoved} />
          </div>
          <div id={rowsId}>{body}</div>
        </>
      ) : (
        body
      )}
    </section>
  );
}

function pastEvents(n: number): string {
  return `${n} past ${n === 1 ? "event" : "events"}`;
}

/** "Remove past events", beside Past: lets go, in one call, of the member's
 *  saves on events that are over. Only saves: going, hosting and requested
 *  are history, and stay. It asks first, on the page (the desk never shows
 *  confirm()): "Remove 12 past events? · Remove · Cancel". */
function RemovePast({ eventIds, onRemoved }: { eventIds: string[]; onRemoved: (eventIds: string[]) => void }) {
  const [asking, setAsking] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  // Cancel hands focus back to the button that asked.
  const back = useRef(false);
  useEffect(() => {
    if (asking || !back.current) return;
    back.current = false;
    askRef.current?.focus();
  }, [asking]);
  if (eventIds.length === 0) return null;
  if (asking) {
    return (
      <ConfirmRemovePast
        eventIds={eventIds}
        onCancel={() => {
          back.current = true;
          setAsking(false);
        }}
        onRemoved={(ids) => {
          setAsking(false);
          onRemoved(ids);
        }}
      />
    );
  }
  return (
    <button ref={askRef} type="button" onClick={() => setAsking(true)} className={QUIET_BUTTON}>
      Remove past events
    </button>
  );
}

/** The question, and the call. Its own component, so the mutation is only
 *  bound once someone asks. */
function ConfirmRemovePast({
  eventIds,
  onCancel,
  onRemoved,
}: {
  eventIds: string[];
  onCancel: () => void;
  onRemoved: (eventIds: string[]) => void;
}) {
  const removeMany = useMutation(api.favorites.removeMany);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Focus starts on Cancel: the safe answer, and the question is read with it.
  useEffect(() => cancelRef.current?.focus(), []);
  const what = pastEvents(eventIds.length);

  async function remove() {
    if (running) return;
    setRunning(true);
    setError(null);
    const ids = eventIds;
    try {
      await removeMany({ targets: ids.map((targetId) => ({ targetType: "event" as const, targetId })) });
      showDeskToast(`Removed ${pastEvents(ids.length)}.`);
      onRemoved(ids);
    } catch (err) {
      setError(errorMessage(err));
      setRunning(false);
    }
  }

  return (
    <span role="group" aria-label={`Remove ${what}?`} style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px", fontSize: 14, color: DESK.textSoft }}>
      <span>Remove {what}?</span>
      <span aria-hidden style={{ color: DESK.textQuiet }}>
        ·
      </span>
      <button type="button" onClick={remove} aria-disabled={running || undefined} className={`${QUIET_BUTTON} text-[#FFE066]`}>
        {running ? "Removing…" : "Remove"}
      </button>
      <span aria-hidden style={{ color: DESK.textQuiet }}>
        ·
      </span>
      <button ref={cancelRef} type="button" onClick={() => !running && onCancel()} aria-disabled={running || undefined} className={QUIET_BUTTON}>
        Cancel
      </button>
      <span role="status" aria-live="polite" style={{ color: "#FF9B8F", flexBasis: error ? "100%" : undefined }}>
        {error}
      </span>
    </span>
  );
}

// ——————————————————————————————————————————————————————————————
// Needs you on Today
// ——————————————————————————————————————————————————————————————

/** Up to three Needs you rows above Today's cards, the Shortlist's own, then
 *  "N more on your Shortlist →". Nothing at all when nothing needs you:
 *  Today still has its cards, and an empty note would only add noise. */
export function TodayNeedsYou({
  state,
  money,
  onOpen,
}: {
  state: ShortlistState;
  money: (cents: number) => string;
  onOpen: (row: RowModel) => void;
}) {
  if (state.status !== "ready" || state.needs.length === 0) return null;
  const { needs, now } = state;
  const more = needs.length - NEEDS_SHOWN;
  return (
    <section aria-label="Needs you" style={{ maxWidth: ROWS_MAX_W, marginTop: 18 }}>
      <Heading id="needs" hot>
        Needs you · {needs.length}
      </Heading>
      <ShortlistRows rows={needs.slice(0, NEEDS_SHOWN).map((item) => needsRow(item, true, money, now))} onOpen={onOpen} />
      {more > 0 && (
        <div style={{ marginTop: 12 }}>
          <Link to={shortlistHref()} className={LINK}>
            {more} more on your Shortlist →
          </Link>
        </div>
      )}
    </section>
  );
}
