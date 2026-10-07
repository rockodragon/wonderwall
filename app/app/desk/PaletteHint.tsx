// The first-visit note beside the palette (Rick, 2026-10-03): the round
// button in the corner is the whole menu on desktop, and nothing else on the
// page says so. One short note points at it, once per browser. It goes away
// for good on "Got it" or the first time the palette opens, since either way
// they have found it. Phones get their own note, on the bottom bar
// (components/PhoneNavNote.tsx).
//
// It sits beside the palette rather than inside its root, so the palette's
// own focus and key handling never see the note's button.

import { useId } from "react";
import { useOnceNote } from "../hooks/useOnceNote";
import { PALETTE, withAlpha } from "./paletteLogic";
import { MAIN_RING, STACK_PANEL_BG, STACK_PANEL_SHADOW } from "./PaletteParts";
import { DESK, DESK_SANS, FOCUS_RING_CLASS } from "./tokens";
import { FF_TABLES } from "../lib/featureFlags";

export const HINT_KEY = "desk.paletteHint";

export const HINT_TITLE = "This is your menu";
// Names Tables only once Tables is open (FF_TABLES).
export const HINT_BODY = `Hover or click it to get to People, Projects, Events${FF_TABLES ? ", Tables" : ""} and more.`;

/**
 * @param ready    nothing is about to send this person elsewhere
 * @param fanOpen  the palette is open right now: opening it, with or without
 *                 the note, means they've found it
 */
export function usePaletteHint(ready: boolean, fanOpen: boolean) {
  return useOnceNote(HINT_KEY, ready, fanOpen);
}

const GAP = 16;
const ARROW = 10;
/** The main button's centre, up from the bottom of the window. */
const BUTTON_MID = PALETTE.inset + PALETTE.button / 2;

function hintCss(reduced: boolean): string {
  return `
@keyframes desk-pal-hint-in {
  from { opacity: 0; transform: translateX(-6px); }
  to { opacity: 1; transform: none; }
}
@keyframes desk-pal-hint-ring {
  0% { box-shadow: 0 0 0 0 ${withAlpha(DESK.accent, 0.45)}; }
  70%, 100% { box-shadow: 0 0 0 16px ${withAlpha(DESK.accent, 0)}; }
}
.desk-pal-hint { animation: ${reduced ? "none" : `desk-pal-hint-in 320ms ${DESK.ease} both`}; }
.desk-pal-hint-ring { animation: ${reduced ? "none" : "desk-pal-hint-ring 1.8s ease-out 3"}; }
.desk-pal-hint-ok:hover { background-color: ${DESK.accentHover}; }
`;
}

export function PaletteHint({ onDismiss, reduced }: { onDismiss: () => void; reduced: boolean }) {
  const titleId = useId();
  return (
    <>
      <style>{hintCss(reduced)}</style>
      {/* A ring around the main button while the note is up: the note says
          "this", the ring shows which. It never takes a click. */}
      <span
        aria-hidden
        className="desk-pal-hint-ring"
        style={{
          position: "fixed",
          left: PALETTE.inset,
          bottom: PALETTE.inset,
          width: PALETTE.button,
          height: PALETTE.button,
          borderRadius: "50%",
          outline: `2px solid ${DESK.accent}`,
          outlineOffset: 4,
          boxShadow: `0 0 0 6px ${MAIN_RING}`,
          pointerEvents: "none",
          zIndex: 41,
        }}
      />
      <section
        aria-labelledby={titleId}
        className="desk-pal-hint"
        style={{
          position: "fixed",
          left: PALETTE.inset + PALETTE.button + GAP,
          bottom: PALETTE.inset,
          width: 300,
          padding: "16px 18px",
          borderRadius: 14,
          background: STACK_PANEL_BG,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: `1px solid ${DESK.line}`,
          boxShadow: STACK_PANEL_SHADOW,
          fontFamily: DESK_SANS,
          // Above the desk and its opened card, below page modals (z-50), as the palette is.
          zIndex: 40,
        }}
      >
        {/* The pointer, level with the button's centre. */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: -ARROW / 2 - 1,
            bottom: BUTTON_MID - PALETTE.inset - ARROW / 2,
            width: ARROW,
            height: ARROW,
            background: STACK_PANEL_BG,
            borderLeft: `1px solid ${DESK.line}`,
            borderBottom: `1px solid ${DESK.line}`,
            transform: "rotate(45deg)",
          }}
        />
        <p id={titleId} style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: DESK.text }}>
          {HINT_TITLE}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.45, color: DESK.textSoft }}>{HINT_BODY}</p>
        <button
          type="button"
          onClick={onDismiss}
          className={`desk-pal-hint-ok ${FOCUS_RING_CLASS}`}
          style={{
            marginTop: 14,
            height: 36,
            padding: "0 16px",
            borderRadius: 8,
            border: 0,
            background: DESK.accent,
            color: DESK.accentInk,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Got it
        </button>
      </section>
    </>
  );
}
