// The Shortlist on a phone (docs/handoff/favorites-redesign/README.md, "Three
// levels"), the page /favorites shows. The same three levels as the desk, one
// column:
//
//   /favorites                    the overview: Needs you, three tiles, and
//                                 every item as a row when there are few
//   /favorites?area=projects      one area: chips, then rows grouped by the
//   &kind=paid                    member's relationship
//
// It reads the one useShortlist() the route holds, so its counts and Needs
// you are the desk's and the nav dot's. A row is a link to the item's page
// (href.ts); nothing opens over the list.

import { useId, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { countLabel } from "../../desk/deskGreeting";
import { areaCount, type AreaSummary, type ShortlistSummary } from "../../lib/shortlist/model";
import type { ProjectKind } from "../../lib/shortlist/types";
import { SHORTLIST_AREAS, favoritesHref, type ShortlistArea } from "../../lib/shortlist/url";
import type { ShortlistState } from "../../lib/shortlist/useShortlist";
import { BROWSE_LABEL, EMPTY_AREA, FOLD_NOUN, WELCOME, emptyKind, needYouText } from "./copy";
import { AREA_LABEL, LIST_ALL_UNDER, areaGroups, cardIdOf, everything, type ListGroup, type ShortlistItem } from "./items";
import { Kicker, MORE_CLASS, MORE_STYLE, PhoneNeedsYou, PhoneRows } from "./PhoneParts";
import { KIND_LABEL } from "./rowModel";

type Ready = Extract<ShortlistState, { status: "ready" }>;

/** Where an area sends someone who has nothing in it yet. */
const BROWSE: Record<ShortlistArea, string> = { projects: "/projects", events: "/events", people: "/people" };

const MONO = { fontFamily: "var(--garden-font-mono)" } as const;
const SMALL_CAPS = "text-xs uppercase tracking-[0.16em]";
const RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent-ink)]";

export function PhoneShortlist({
  state,
  area,
  kind,
  money,
}: {
  state: Ready;
  area: ShortlistArea | null;
  kind: ProjectKind | null;
  money: (cents: number) => string;
}) {
  const { summary } = state;
  return (
    <>
      {area ? (
        <>
          <Header
            crumb={
              <Link to={favoritesHref()} className={`mb-1 inline-block py-1 text-sm hover:underline ${RING}`} style={{ color: "var(--app-text-muted)" }}>
                ← Shortlist
              </Link>
            }
            title={AREA_LABEL[area]}
            count={String(areaCount(summary, area, kind))}
          />
          <Chips summary={summary} area={area} kind={kind} />
          <AreaRows key={`${area}:${kind ?? ""}`} state={state} area={area} kind={kind} money={money} />
        </>
      ) : (
        <>
          <Header title="Shortlist" count={summary.total > 0 ? countLabel("shortlist", summary.total) : null} />
          <Overview state={state} money={money} />
        </>
      )}
    </>
  );
}

function Header({ crumb, title, count }: { crumb?: ReactNode; title: string; count: string | null }) {
  return (
    <header className="mb-6">
      {crumb}
      <h1 className="flex items-baseline gap-3 text-2xl font-semibold sm:text-3xl" style={{ color: "var(--app-text)", fontFamily: "var(--garden-font-display)" }}>
        {title}
        {count && (
          <span className="text-base font-normal" style={{ color: "var(--app-text-dim)" }}>
            {count}
          </span>
        )}
      </h1>
    </header>
  );
}

// ——— Level 1: the overview ———

function Overview({ state, money }: { state: Ready; money: (cents: number) => string }) {
  const { data, needs, summary, now } = state;
  if (summary.total === 0 && needs.length === 0) return <Welcome />;
  const listed = everything(data, now);
  const hot = new Set(needs.map(cardIdOf));
  return (
    <div className="space-y-8">
      <PhoneNeedsYou needs={needs} money={money} more="expand" />
      <div className="space-y-3">
        {SHORTLIST_AREAS.map((area) => (
          <Tile key={area} area={area} summary={summary} />
        ))}
      </div>
      {listed.length > 0 && listed.length <= LIST_ALL_UNDER && (
        <section>
          <Kicker>Everything on your shortlist · {listed.length}</Kicker>
          <PhoneRows items={listed} hot={hot} withArea money={money} />
        </section>
      )}
    </div>
  );
}

const TILE = "block rounded-xl border p-4 no-underline";

/** One area: its count, what it's made of, and the next thing to do in it. */
function Tile({ area, summary }: { area: ShortlistArea; summary: ShortlistSummary }) {
  const s: AreaSummary = summary[area];
  const name = AREA_LABEL[area];
  if (s.count === 0) {
    // Dashed, never hidden: the three areas keep their places.
    return (
      <div className="rounded-xl border border-dashed p-4" style={{ borderColor: "var(--app-hairline-raised)" }}>
        <span className={SMALL_CAPS} style={{ ...MONO, color: "var(--app-text-dim)" }}>
          {name}
        </span>
        <p className="mt-3 text-[15px]" style={{ color: "var(--app-text-muted)" }}>
          Nothing saved yet
        </p>
        <Link to={BROWSE[area]} className={`${MORE_CLASS} ${RING}`} style={MORE_STYLE}>
          {BROWSE_LABEL[area]}
        </Link>
      </div>
    );
  }
  const kinds =
    area === "projects"
      ? (["paid", "passion"] as const).flatMap((k) => (summary.projects.kinds[k] ? [`${summary.projects.kinds[k]} ${KIND_LABEL[k].toLowerCase()}`] : []))
      : [];
  return (
    <Link
      to={favoritesHref(area)}
      aria-label={`${name}, ${s.count}${s.needsYou ? `, ${needYouText(s.needsYou)}` : ""}`}
      className={`${TILE} transition-colors active:bg-[var(--app-hairline)] ${RING}`}
      style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)", color: "var(--app-text)" }}
    >
      <span className="flex min-h-[18px] items-center justify-between gap-2">
        <span className={SMALL_CAPS} style={{ ...MONO, color: "var(--app-text-dim)" }}>
          {name}
        </span>
        {s.needsYou > 0 && (
          <span className={`${SMALL_CAPS} inline-flex items-center gap-1.5 whitespace-nowrap`} style={{ ...MONO, color: "var(--app-accent-ink)" }}>
            <span aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--app-accent-ink)" }} />
            {needYouText(s.needsYou)}
          </span>
        )}
      </span>
      <span className="mt-3 flex items-start gap-4">
        <span className="text-[44px] font-medium leading-none tracking-[-0.03em] tabular-nums">{s.count}</span>
        <span className="min-w-0 flex-1 pt-0.5 text-[13px] leading-[1.45]" style={{ color: "var(--app-text-muted)" }}>
          {s.parts.join(" · ")}
          {kinds.length > 0 && <span className="block">{kinds.join(" · ")}</span>}
        </span>
      </span>
      {s.next && (
        <span className="mt-3 block truncate border-t pt-3 text-[13px]" style={{ borderColor: "var(--app-hairline)" }}>
          {s.next}
        </span>
      )}
    </Link>
  );
}

/** A brand-new member: one note and three ways in. */
function Welcome() {
  return (
    <div className="rounded-xl border p-5" style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}>
      <h2 className="mb-2 text-xl font-medium" style={{ color: "var(--app-text)", fontFamily: "var(--garden-font-display)" }}>
        {WELCOME.title}
      </h2>
      <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
        {WELCOME.body}
      </p>
      <ul className="mt-4 list-none border-t p-0 pt-2" style={{ borderColor: "var(--app-hairline)" }}>
        {SHORTLIST_AREAS.map((area) => (
          <li key={area}>
            <Link to={BROWSE[area]} className={`${MORE_CLASS} ${RING}`} style={MORE_STYLE}>
              {BROWSE_LABEL[area]}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ——— Level 2: one area ———

const RING_CHIP = `transition-colors no-underline ${RING}`;
// Four across: a phone has no room for "All", "Projects", "Events" and
// "People" with their counts on one line of pills, and wrapped they take three.
const AREA_CHIP = `flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-[13px] font-medium leading-tight ${RING_CHIP}`;
const KIND_CHIP = `inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${RING_CHIP}`;

function chipStyle(on: boolean) {
  return on
    ? { backgroundColor: "var(--app-accent-wash)", borderColor: "var(--app-accent-ink)", color: "var(--app-accent-ink)" }
    : { backgroundColor: "transparent", borderColor: "var(--app-hairline-raised)", color: "var(--app-text-muted)" };
}

function Count({ n }: { n: number }) {
  return (
    <span className="text-xs" style={MONO}>
      {n}
    </span>
  );
}

/** All · Projects · Events · People, then Paid · Passion on Projects. An
 *  area chip is a link (the open one goes back to the overview); a kind chip
 *  filters in place and clears on a second press. */
function Chips({ summary, area, kind }: { summary: ShortlistSummary; area: ShortlistArea; kind: ProjectKind | null }) {
  const navigate = useNavigate();
  return (
    <div className="mb-6 space-y-2">
      <nav aria-label="Shortlist areas" className="grid grid-cols-4 gap-2">
        <Link to={favoritesHref()} className={AREA_CHIP} style={chipStyle(false)}>
          All
          <Count n={summary.total} />
        </Link>
        {SHORTLIST_AREAS.map((a) => {
          const on = a === area;
          const needs = summary[a].needsYou;
          return (
            <Link
              key={a}
              to={on ? favoritesHref() : favoritesHref(a)}
              aria-current={on ? "page" : undefined}
              aria-label={`${AREA_LABEL[a]}, ${summary[a].count}${needs > 0 ? `, ${needYouText(needs)}` : ""}`}
              className={AREA_CHIP}
              style={chipStyle(on)}
            >
              <span className="inline-flex max-w-full items-center gap-1.5">
                {needs > 0 && <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: "var(--app-accent-ink)" }} />}
                <span className="truncate">{AREA_LABEL[a]}</span>
              </span>
              <Count n={summary[a].count} />
            </Link>
          );
        })}
      </nav>
      {area === "projects" && (
        <div role="group" aria-label="Kind of work" className="flex flex-wrap gap-2">
          {(["paid", "passion"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => navigate(favoritesHref("projects", kind === k ? null : k), { replace: true })}
              className={KIND_CHIP}
              style={chipStyle(kind === k)}
            >
              {KIND_LABEL[k]}
              <Count n={summary.projects.kinds[k]} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AreaRows({
  state,
  area,
  kind,
  money,
}: {
  state: Ready;
  area: ShortlistArea;
  kind: ProjectKind | null;
  money: (cents: number) => string;
}) {
  const groups = areaGroups(state.data, state.now, area, kind);
  if (groups.length === 0) {
    return (
      <div className="border-y py-5 text-[15px]" style={{ borderColor: "var(--app-hairline)", color: "var(--app-text-muted)" }}>
        <p>{kind ? emptyKind(kind) : EMPTY_AREA[area]}</p>
        <Link to={BROWSE[area]} className={`${MORE_CLASS} ${RING}`} style={MORE_STYLE}>
          {BROWSE_LABEL[area]}
        </Link>
      </div>
    );
  }
  return (
    <div>
      {groups.map((group) => (
        <Group key={group.key} group={group} money={money} />
      ))}
    </div>
  );
}

function Group({ group, money }: { group: ListGroup; money: (cents: number) => string }) {
  const [open, setOpen] = useState(false);
  const rowsId = useId();
  const n = group.items.length;
  const noun = FOLD_NOUN[group.key] ?? group.label.toLowerCase();
  const rows = (items: ShortlistItem[]) => <PhoneRows items={items} hot={group.hot} past={group.folded} money={money} />;
  let body: ReactNode;
  if (group.folded && !open) {
    body = null;
  } else if (group.months) {
    body = group.months.map((month) => (
      <div key={month.key}>
        <p className={`${SMALL_CAPS} mb-1 mt-4`} style={{ ...MONO, color: "var(--app-text-dim)" }}>
          {month.label} · {month.items.length}
        </p>
        {rows(month.items)}
      </div>
    ));
  } else {
    body = rows(group.items);
  }
  return (
    <section aria-label={group.label || undefined} className={group.label ? "mt-8 first:mt-0" : "mt-3"}>
      {group.label && (
        <Kicker hot={group.hot}>
          {group.label} <span style={{ color: "var(--app-text-dim)" }}>{n}</span>
        </Kicker>
      )}
      {group.folded ? (
        <>
          {/* One toggle that stays put, so focus and aria-expanded stay with it. */}
          <button
            type="button"
            data-fold={group.key}
            aria-expanded={open}
            aria-controls={rowsId}
            onClick={() => setOpen((v) => !v)}
            className={`min-h-11 cursor-pointer border-0 bg-transparent px-0 py-3 text-sm ${RING}`}
            style={{ color: "var(--app-text-muted)" }}
          >
            {open ? `Hide ${noun}` : `Show ${n} ${noun}`}
          </button>
          <div id={rowsId}>{body}</div>
        </>
      ) : (
        body
      )}
    </section>
  );
}
