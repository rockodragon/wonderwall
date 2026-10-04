// The phone bar's first-visit note (Rick, 2026-10-04): the bar is icons only,
// so once per browser each icon gets its name above it, on a short line down
// to the icon, with "This is your menu" and Got it above them. Gone for good
// on Got it or the first tap on the bar. The desktop's note is
// desk/PaletteHint.tsx; both remember themselves through hooks/useOnceNote.ts.
//
// The names render inside the bar's own links, so each one sits over its
// icon whatever the bar's width. Neighbouring names alternate between rows so
// they never touch: eight icons on a 320px phone leave about 40px each.

import { useId, type CSSProperties } from "react";
import { useOnceNote } from "../hooks/useOnceNote";

export const PHONE_NOTE_KEY = "nav.phoneNote";
export const PHONE_NOTE_TITLE = "This is your menu";
export const PHONE_NOTE_BODY = "Tap an icon to go there.";

/** The bar's links are 40px (a 24px icon in 8px of padding), centred in the
 *  64px bar, so their top edge is 12px under the bar's. */
const LINK = 40;
const LINK_TOP = 12;
const PILL = 24;
const ROW = 30;
const ROW_GAP = 10;

export function usePhoneNavNote(ready: boolean) {
  return useOnceNote(PHONE_NOTE_KEY, ready);
}

/** How many rows the names need: one when there's room, three when the bar is full. */
export function nameRows(count: number): number {
  if (count <= 5) return 1;
  if (count <= 6) return 2;
  return 3;
}

/** Row 0 sits nearest the bar. */
export function nameRow(index: number, count: number): number {
  return index % nameRows(count);
}

/** How far the top row of names reaches above the bar's top edge. */
export function namesReach(count: number): number {
  return ROW_GAP + (nameRows(count) - 1) * ROW + PILL - LINK_TOP;
}

/** One icon's name, drawn inside its link. The first and last hug the
 *  screen's edges instead of centring, so they never run off it. */
export function PhoneNavName({ label, index, count }: { label: string; index: number; count: number }) {
  const lift = ROW_GAP + nameRow(index, count) * ROW;
  const first = index === 0;
  const last = index === count - 1;
  const place: CSSProperties = first
    ? { left: 0 }
    : last
      ? { right: 0 }
      : { left: "50%", transform: "translateX(-50%)" };
  const line: CSSProperties = first
    ? { left: LINK / 2 - 1 }
    : last
      ? { right: LINK / 2 - 1 }
      : { left: "calc(50% - 1px)" };
  return (
    <span
      aria-hidden
      className="phone-nav-name"
      style={{
        position: "absolute",
        // From the link's top edge, which is 12px under the bar's.
        bottom: `calc(100% + ${lift}px)`,
        ...place,
        height: PILL,
        padding: "0 8px",
        display: "flex",
        alignItems: "center",
        borderRadius: 999,
        background: "var(--app-accent)",
        color: "var(--garden-ink)",
        fontSize: 13.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        boxShadow: "0 4px 12px rgba(0,0,0,.35)",
      }}
    >
      {label}
      {/* The line down to the icon's top edge, 8px inside the link. */}
      <span
        style={{
          position: "absolute",
          top: "100%",
          ...line,
          width: 2,
          height: lift + 8 - 2,
          background: "var(--app-accent)",
          borderRadius: 1,
        }}
      />
    </span>
  );
}

/** The title and Got it, above the names. Inside the bar, so it hides with it on desktop. */
export function PhoneNavNoteCard({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="phone-nav-note absolute left-4 right-4 flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
      style={{
        bottom: `calc(100% + ${namesReach(count) + 10}px)`,
        backgroundColor: "var(--app-surface-raised)",
        borderColor: "var(--app-hairline-raised)",
        boxShadow: "0 12px 32px rgba(0,0,0,.4)",
      }}
    >
      <div>
        <p id={titleId} className="text-[15px] font-semibold leading-snug" style={{ color: "var(--app-text)" }}>
          {PHONE_NOTE_TITLE}
        </p>
        <p className="mt-0.5 text-[15px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
          {PHONE_NOTE_BODY}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 h-9 px-4 rounded-lg text-[13.5px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }}
      >
        Got it
      </button>
    </section>
  );
}
