// The desk's header (docs/features/desktop-desk-palette.md, "Round 2").
//
//   Home         the greeting, as it has always been
//   Any other    a mono community line, then the view's name at 30px with a
//                muted count ("13 people")
//   Browse views the filter row under that, on the same 48px left edge, with
//                the view's one create verb at the row's right end. The title
//                scrolls away; the row pins to the top on a 92% band.
//   Shortlist    its own crumb, title and count, and in an area its chips as
//                the row that pins (ShortlistView.tsx hands them in as parts)
//   Today        Needs you's rows under the title, so the card row starts
//                below them
//
// It renders two siblings, not a wrapper: the filter row is `position:
// sticky`, and a sticky row stays pinned only while its parent is as tall as
// the page. Both go straight into the page's scroll content; Desk owns that.
//
// Hooks stay above every return.

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router";
import { canCopyInvite, inviteRowLabel } from "../components/InviteCTA";
import { useInviteLink } from "../lib/useInviteLink";
import { DeskFilterBar, isBrowseView, type BrowseView } from "./deskBrowse";
import { countLabel } from "./deskGreeting";
import { GRID_SIDE } from "./deskLayout";
import { COMMUNITY_LABEL, DESK_VIEW_LABEL, deskHref, useDeskSpacing, type DeskCommunity, type DeskView } from "./deskState";
import { DESK, FOCUS_RING_CLASS, monoLabel } from "./tokens";

/** The header's left edge, shared with the grid's first column. */
export const HEADER_SIDE = GRID_SIDE;
/** Over the cards that scroll beneath it, under the dim layer (deskLayout Z_DIM). */
const Z_HEADER = 15;
const BAND = "rgba(21,21,21,.92)";

export type HeaderSize = {
  /** The title block alone: the filter row pins once this has scrolled away. */
  title: number;
  /** Title block plus filter row, as they sit before any scrolling. */
  total: number;
};

/** A view that brings its own header parts. Each one left out keeps the
 *  view's usual. */
export type HeaderParts = {
  /** After the community in the mono line: "THE GARDEN · SHORTLIST". */
  crumb?: ReactNode;
  /** In place of the view's name. */
  title?: string;
  /** In place of countLabel(view, count); null for none. */
  count?: string | null;
  /** Under the title, scrolling away with it. */
  below?: ReactNode;
  /** The row that pins, in place of a browse view's filter row. */
  row?: ReactNode;
};

export function DeskHeader({
  view,
  community,
  greeting,
  greetingReady,
  count,
  stuck,
  inert,
  onMeasure,
  parts,
}: {
  view: DeskView;
  community: DeskCommunity;
  /** "Good evening, Rick." Home only. */
  greeting: string;
  /** False until the profile has arrived, so the name doesn't pop in. */
  greetingReady: boolean;
  /** Cards shown, once known. */
  count: number | null;
  /** The filter row has reached the top and is riding on its band. */
  stuck: boolean;
  /** A card is open: nothing here can be reached. */
  inert: boolean;
  onMeasure: (size: HeaderSize) => void;
  parts?: HeaderParts;
}) {
  const titleRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // The header's left edge is the grid's: both follow the spacing dial.
  const side = HEADER_SIDE * useDeskSpacing();
  const report = useRef(onMeasure);
  report.current = onMeasure;

  const home = view === "all";
  const browse = isBrowseView(view);
  const pinned = browse || !!parts?.row;
  const countText = parts?.count !== undefined ? parts.count : count !== null ? countLabel(view, count) : null;

  // Measured before paint, then kept current: a filter row that wraps at a
  // narrow window is taller, and the grid starts below whatever it is.
  useLayoutEffect(() => {
    const title = titleRef.current;
    const row = rowRef.current;
    const measure = () => {
      const t = home ? 0 : (title?.offsetHeight ?? 0);
      report.current({ title: t, total: t + (row?.offsetHeight ?? 0) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (title) ro.observe(title);
    if (row) ro.observe(row);
    return () => ro.disconnect();
  }, [home, pinned]);

  const mono = { ...monoLabel(12, "0.24em"), margin: 0, color: DESK.muted } as const;

  return (
    <>
      {home ? (
        <div ref={titleRef} inert={inert} style={{ position: "absolute", left: side, top: 44, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={mono}>
            {COMMUNITY_LABEL[community]} · {DESK_VIEW_LABEL[view]}
          </p>
          <h1 style={{ ...titleStyle, visibility: greetingReady ? "visible" : "hidden" }}>{greeting}</h1>
        </div>
      ) : (
        <div
          ref={titleRef}
          inert={inert}
          style={{ position: "relative", padding: `44px ${side}px ${pinned ? 14 : 24}px`, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <p style={mono}>
            {COMMUNITY_LABEL[community]}
            {parts?.crumb && <> · {parts.crumb}</>}
          </p>
          <h1 style={{ ...titleStyle, display: "flex", alignItems: "baseline", gap: 14 }}>
            <span>{parts?.title ?? DESK_VIEW_LABEL[view]}</span>
            {countText !== null && (
              <span role="status" style={{ fontSize: 16, fontWeight: 400, letterSpacing: 0, color: DESK.muted }}>
                {countText}
              </span>
            )}
          </h1>
          {parts?.below}
        </div>
      )}

      {pinned && (
        <div
          ref={rowRef}
          inert={inert}
          style={{
            position: "sticky",
            top: 0,
            zIndex: Z_HEADER,
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
            padding: `10px ${side}px 14px`,
            background: stuck ? BAND : "transparent",
            backdropFilter: stuck ? "blur(14px)" : undefined,
            WebkitBackdropFilter: stuck ? "blur(14px)" : undefined,
            borderBottom: `1px solid ${stuck ? DESK.line : "transparent"}`,
            transition: "background-color 200ms ease, border-color 200ms ease",
          }}
        >
          {browse ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <DeskFilterBar view={view} />
              </div>
              <CreateVerb view={view} />
            </>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>{parts?.row}</div>
          )}
        </div>
      )}
    </>
  );
}

const titleStyle = {
  margin: 0,
  fontSize: 30,
  fontWeight: 500,
  letterSpacing: "-0.02em",
  lineHeight: 1.2,
  color: DESK.text,
} as const;

// ——————————————————————————————————————————————————————————————
// The view's one create verb
// ——————————————————————————————————————————————————————————————

// An outline, not a fill: solid yellow is kept for the opened card's one action.
const VERB_CLASS = `inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-lg border border-[#333333] bg-transparent px-4 text-[14px] font-medium text-[#F4F4F2] no-underline transition-colors hover:border-[#FFE066] hover:text-[#FFE066] ${FOCUS_RING_CLASS}`;

function CreateVerb({ view }: { view: BrowseView }) {
  if (view === "projects") {
    return (
      <Link to={deskHref("projects", null, "project")} className={VERB_CLASS}>
        Start a project
      </Link>
    );
  }
  if (view === "events") {
    return (
      <Link to={deskHref("events", null, "event")} className={VERB_CLASS}>
        Host an event
      </Link>
    );
  }
  return <InviteVerb />;
}

/** "Invite someone": one click copies your invite link, as the palette's row
 *  does. With no link to copy (still being made, none left, no clipboard) it
 *  goes to Settings → Network, which says why. Its own component so the
 *  invite-link query runs on the People view only. */
function InviteVerb() {
  const invite = useInviteLink("palette");
  if (!canCopyInvite(invite)) {
    return (
      <Link to="/settings?tab=network" className={VERB_CLASS}>
        {inviteRowLabel(false)}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={invite.copy}
      title={`Copy ${invite.url}`}
      aria-live="polite"
      className={VERB_CLASS}
      style={invite.copied ? { borderColor: DESK.accent, color: DESK.accent } : undefined}
    >
      {inviteRowLabel(invite.copied)}
    </button>
  );
}
