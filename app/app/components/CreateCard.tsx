import type { CSSProperties } from "react";
import { Link } from "react-router";
import { DESK, DESK_SANS, FOCUS_RING_CLASS } from "../desk/tokens";

// The "make one" tile that sits first in a card grid — Projects ("Start a
// project", "Hire someone") and Events ("Host an event"). It is the same size
// and radius as the cards beside it (h-full stretches it to the row), drawn as
// a dashed outline so it reads as an empty slot rather than another item.
//
// Two looks, one markup:
//   page — /projects and /events. Both are permanently dark and render on the
//          fixed --garden-* tokens (events.tsx pins its --app-* aliases to
//          them), so this needs no per-page colour prop. Text stays on
//          --garden-body (≥9:1 on ink), never dimmer, and never with opacity;
//          the dashed outline is a shape, not text, so it can sit at the
//          hairline weight the neighbouring cards use.
//   desk — the desk's Projects and Events grids. The desk's own tokens
//          (desk/tokens.ts) in the same roles, the desk's 2px accent focus
//          ring, and the size of whatever cell it is put in: the grid's 3:4.
//
// It takes an `onClick` where the page opens a modal, or a `to` where it
// goes to a URL (the desk opens its create flow from ?create=).
type CreateCardProps = { label: string; look?: "page" | "desk" } & (
  | { onClick: () => void; to?: undefined }
  | { to: string; onClick?: undefined }
);

type Look = { root: string; ring: string; label: string; vars?: CSSProperties; font: string };

const PAGE: Look = {
  root: "group h-full w-full min-h-[140px] sm:min-h-[220px] rounded-2xl border-2 border-dashed border-[color:var(--garden-hairline-raised)] hover:border-[color:var(--garden-citron)] focus-visible:border-[color:var(--garden-citron)] outline-none flex flex-col items-center justify-center gap-3 p-4 transition-colors",
  ring: "w-14 h-14 rounded-full border-2 border-[color:var(--garden-dim)] text-[color:var(--garden-body)] group-hover:border-[color:var(--garden-citron)] group-hover:text-[color:var(--garden-citron)] group-focus-visible:border-[color:var(--garden-citron)] group-focus-visible:text-[color:var(--garden-citron)] flex items-center justify-center transition-colors",
  label:
    "text-[15px] font-semibold text-center text-[color:var(--garden-body)] group-hover:text-[color:var(--garden-paper)] group-focus-visible:text-[color:var(--garden-paper)] transition-colors",
  font: "var(--garden-font-body)",
};

// The page's roles, on the desk's tokens: hairline outline, dim ring, body
// text, and paper on hover. The colours ride in as custom properties so the
// classes stay static strings and the values stay in tokens.ts. The desk's
// cards are 4px-cornered, and its type is Inter at the face-title weight.
const DESK_LOOK: Look = {
  root: `group no-underline h-full w-full rounded border-2 border-dashed border-[color:var(--cc-line)] hover:border-[color:var(--cc-accent)] focus-visible:border-[color:var(--cc-accent)] flex flex-col items-center justify-center gap-3 p-4 transition-colors motion-reduce:transition-none ${FOCUS_RING_CLASS}`,
  ring: "w-14 h-14 rounded-full border-2 border-[color:var(--cc-mark)] text-[color:var(--cc-text)] group-hover:border-[color:var(--cc-accent)] group-hover:text-[color:var(--cc-accent)] group-focus-visible:border-[color:var(--cc-accent)] group-focus-visible:text-[color:var(--cc-accent)] flex items-center justify-center transition-colors motion-reduce:transition-none",
  label:
    "text-[18px] font-medium leading-tight text-center text-[color:var(--cc-text)] group-hover:text-[color:var(--cc-hi)] group-focus-visible:text-[color:var(--cc-hi)] transition-colors motion-reduce:transition-none",
  vars: {
    "--cc-line": DESK.lineStrong,
    "--cc-mark": DESK.muted,
    "--cc-text": DESK.textSoft,
    "--cc-hi": DESK.text,
    "--cc-accent": DESK.accent,
  } as CSSProperties,
  font: DESK_SANS,
};

export function CreateCard({ label, look = "page", onClick, to }: CreateCardProps) {
  const { root, ring, label: labelClass, vars, font } = look === "desk" ? DESK_LOOK : PAGE;
  const inside = (
    <>
      <span className={ring} aria-hidden="true">
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className={labelClass} style={{ fontFamily: font }}>
        {label}
      </span>
    </>
  );
  if (to !== undefined) {
    return (
      <Link to={to} className={root} style={vars}>
        {inside}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={root} style={vars}>
      {inside}
    </button>
  );
}
