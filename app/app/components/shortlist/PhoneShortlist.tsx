// The Shortlist on a phone (docs/handoff/favorites-redesign/README.md, "Three
// levels"), the page /favorites shows. The same three levels as the desk, one
// column:
//
//   /favorites                    the overview: Needs you, the three areas as
//                                 a row of figures, and every item as a row
//                                 when there are few
//   /favorites?area=projects      one area: tabs, then rows grouped by the
//   &kind=paid                    member's relationship
//
// It reads the one useShortlist() the route holds, so its counts and Needs
// you are the desk's and the nav dot's. A row is a link to the item's page
// (href.ts); nothing opens over the list. Drawn the way a phone draws a list
// screen (docs/features/phone-screens.md): a bar on top, tabs under it.

import { useId, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { countLabel } from "../../desk/deskGreeting";
import { areaCount, type AreaSummary, type ShortlistSummary } from "../../lib/shortlist/model";
import type { ProjectKind } from "../../lib/shortlist/types";
import { SHORTLIST_AREAS, favoritesHref, type ShortlistArea } from "../../lib/shortlist/url";
import type { ShortlistState } from "../../lib/shortlist/useShortlist";
import { PageTop } from "../phone/PageTop";
import { TabStrip } from "../phone/TabStrip";
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
          <PageTop title={AREA_LABEL[area]} count={String(areaCount(summary, area, kind))} back={{ to: favoritesHref(), label: "Shortlist" }} />
          <Chips summary={summary} area={area} kind={kind} />
          <AreaRows key={`${area}:${kind ?? ""}`} state={state} area={area} kind={kind} money={money} />
        </>
      ) : (
        <>
          <PageTop title="Shortlist" count={summary.total > 0 ? countLabel("shortlist", summary.total) : null} />
          <Overview state={state} money={money} />
        </>
      )}
    </>
  );
}

// ——— Level 1: the overview ———

function Overview({ state, money }: { state: Ready; money: (cents: number) => string }) {
  const { data, needs, summary, now } = state;
  if (summary.total === 0 && needs.length === 0) return <Welcome />;
  const listed = everything(data, now);
  const hot = new Set(needs.map(cardIdOf));
  return (
    <div className="mt-2 space-y-8">
      <Stats summary={summary} />
      <PhoneNeedsYou needs={needs} money={money} more="expand" />
      {listed.length > 0 && listed.length <= LIST_ALL_UNDER && (
        <section>
          <Kicker>Everything on your shortlist · {listed.length}</Kicker>
          <PhoneRows items={listed} hot={hot} withArea money={money} />
        </section>
      )}
    </div>
  );
}

/** The three areas as one row of figures, the way a profile counts its
 *  posts and followers: the count, the area, and under it what needs you.
 *  Each is the way into its area; an empty one goes browsing instead. The
 *  three keep their places whatever is in them. */
function Stats({ summary }: { summary: ShortlistSummary }) {
  return (
    <nav aria-label="Shortlist areas" className="grid grid-cols-3 gap-2">
      {SHORTLIST_AREAS.map((area) => (
        <Stat key={area} area={area} s={summary[area]} />
      ))}
    </nav>
  );
}

function Stat({ area, s }: { area: ShortlistArea; s: AreaSummary }) {
  const name = AREA_LABEL[area];
  const empty = s.count === 0;
  return (
    <Link
      to={empty ? BROWSE[area] : favoritesHref(area)}
      aria-label={empty ? `${name}, none yet, ${BROWSE_LABEL[area].replace(" →", "")}` : `${name}, ${s.count}${s.needsYou ? `, ${needYouText(s.needsYou)}` : ""}`}
      className={`flex min-h-[88px] flex-col items-center justify-center rounded-xl px-2 py-3 text-center no-underline transition-colors active:bg-[var(--app-hairline)] ${RING}`}
      style={{ backgroundColor: "var(--app-surface-raised)", color: "var(--app-text)" }}
    >
      <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums" style={empty ? { color: "var(--app-text-dim)" } : undefined}>
        {s.count}
      </span>
      <span className="mt-1.5 text-[13px] font-medium" style={{ color: empty ? "var(--app-text-dim)" : "var(--app-text)" }}>
        {name}
      </span>
      <span className="mt-1 flex min-h-[16px] items-center gap-1 text-xs" style={{ color: s.needsYou > 0 ? "var(--app-accent-ink)" : "var(--app-text-dim)" }}>
        {s.needsYou > 0 ? (
          <>
            <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: "var(--app-accent-ink)" }} />
            {needYouText(s.needsYou)}
          </>
        ) : empty ? (
          "Browse →"
        ) : null}
      </span>
    </Link>
  );
}

/** A brand-new member: one note and three ways in. */
function Welcome() {
  return (
    <div className="mt-2 rounded-xl border p-5" style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}>
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

const KIND_CHIP = `inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors no-underline ${RING}`;

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

/** All · Projects · Events · People as tabs across the screen, then Paid ·
 *  Passion on Projects. A tab is a link (All is the overview); a kind chip
 *  filters in place and clears on a second press. */
function Chips({ summary, area, kind }: { summary: ShortlistSummary; area: ShortlistArea; kind: ProjectKind | null }) {
  const navigate = useNavigate();
  return (
    <div className="mb-5 space-y-3">
      <TabStrip
        label="Shortlist areas"
        active={area}
        items={[
          { key: "all", label: "All", count: summary.total, to: favoritesHref() },
          ...SHORTLIST_AREAS.map((a) => {
            const needs = summary[a].needsYou;
            return {
              key: a,
              label: AREA_LABEL[a],
              count: summary[a].count,
              dot: needs > 0,
              ariaLabel: `${AREA_LABEL[a]}, ${summary[a].count}${needs > 0 ? `, ${needYouText(needs)}` : ""}`,
              to: favoritesHref(a),
            };
          }),
        ]}
      />
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
