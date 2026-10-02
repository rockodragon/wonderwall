// An admin's dial for the desk's negative space (Rick, 2026-10-01: "an admin
// setting that sets a variable for the negative space ... so that we can
// experiment"). Lower right of the desk, admins only, saved in this browser.
// Once a value feels right it becomes the layout's default and this goes.

import { useState } from "react";
import { DESK, DESK_MONO, FOCUS_RING_CLASS } from "./tokens";
import { DESK_SPACING, setDeskSpacing, useDeskSpacing } from "./deskState";

export function SpacingControl() {
  const space = useDeskSpacing();
  const [open, setOpen] = useState(false);
  const value = `${space.toFixed(2)}×`;

  return (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 40, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {open && (
        <div
          role="group"
          aria-label="Desk spacing"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderRadius: 12,
            border: `1px solid ${DESK.line}`,
            background: "rgba(26,26,26,.94)",
            backdropFilter: "blur(14px)",
            color: DESK.text,
            fontSize: 13.5,
          }}
        >
          <input
            type="range"
            aria-label="Spacing"
            min={DESK_SPACING.min}
            max={DESK_SPACING.max}
            step={DESK_SPACING.step}
            value={space}
            onChange={(e) => setDeskSpacing(Number(e.target.value))}
            style={{ width: 180, accentColor: DESK.accent }}
          />
          <span style={{ fontFamily: DESK_MONO, fontSize: 13, minWidth: 48, textAlign: "right" }}>{value}</span>
          <button
            type="button"
            onClick={() => setDeskSpacing(DESK_SPACING.initial)}
            className={FOCUS_RING_CLASS}
            style={{ background: "transparent", border: 0, padding: 0, color: DESK.muted, fontSize: 13.5, cursor: "pointer" }}
          >
            Reset
          </button>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={FOCUS_RING_CLASS}
        style={{
          height: 32,
          padding: "0 12px",
          borderRadius: 16,
          border: `1px solid ${DESK.lineStrong}`,
          background: "rgba(21,21,21,.85)",
          color: DESK.muted,
          fontFamily: DESK_MONO,
          fontSize: 12,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Spacing {value}
      </button>
    </div>
  );
}
