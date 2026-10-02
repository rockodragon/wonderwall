// The palette's pieces: a tool's stack of rows, the count chip, the dot, the
// profile avatar, and the stylesheet for the states inline styles can't
// reach. The fan, the state machine and the composition live in Palette.tsx
// and usePaletteController.ts.

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Link } from "react-router";
import type { PaletteItem, PaletteTool } from "./paletteConfig";
import { PALETTE, withAlpha } from "./paletteLogic";
import { DESK, DESK_MONO, FOCUS_RING_CLASS, monoLabel, motion, useDeskTint } from "./tokens";

// Colors the handoff gives that the DESK tokens don't hold: the stack panel's
// #1a1a1a (a step lighter than DESK.panel) and the black of its shadow.
export const STACK_PANEL_BG = "rgba(26,26,26,.94)";
export const STACK_PANEL_SHADOW = "0 24px 60px rgba(0,0,0,.55)";

/** Tool fill: the panel color at .92, so the page shows through a little. */
export const TOOL_FILL = withAlpha(DESK.panel, 0.92);
/** The main button's wash and ring: the accent, faint. */
export const MAIN_WASH = withAlpha(DESK.accent, 0.08);
export const MAIN_RING = withAlpha(DESK.accent, 0.05);

/** Hover and active looks live in a stylesheet rather than inline so :hover
 *  and :focus-visible can reach them. `reduced` (the visitor asked for less
 *  motion) drops every transition and animation in the palette. */
export function paletteCss(reduced: boolean): string {
  const toolTransition = motion(["background-color", "border-color", "color", "scale"], reduced, 150);
  const itemTransition = motion(["background-color", "color"], reduced, 120);
  const stackAnimation = reduced
    ? "none"
    : `desk-pal-stack-in ${PALETTE.stackMs}ms ${DESK.ease} both`;
  return `
@keyframes desk-pal-stack-in {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: none; }
}
.desk-pal-stack { animation: ${stackAnimation}; }
.desk-pal-tool {
  background-color: ${TOOL_FILL};
  transition: ${toolTransition};
}
.desk-pal-tool:hover { background-color: ${DESK.hover}; scale: 1.12; }
.desk-pal-item { transition: ${itemTransition}; }
.desk-pal-item:hover, .desk-pal-item:focus-visible { background-color: ${DESK.hover}; color: ${DESK.accent}; }
`;
}

export function StackPanel({
  tool,
  onSelect,
  onItemKeyDown,
  onNavigate,
}: {
  tool: PaletteTool;
  onSelect: (item: PaletteItem) => void;
  onItemKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  onNavigate: () => void;
}) {
  const headerId = `desk-pal-h-${tool.id}`;
  return (
    <div
      style={{
        minWidth: 220,
        maxWidth: 320,
        padding: 8,
        borderRadius: 14,
        background: STACK_PANEL_BG,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: `1px solid ${DESK.line}`,
        boxShadow: STACK_PANEL_SHADOW,
      }}
    >
      <div
        id={headerId}
        style={{
          ...monoLabel(12, "0.22em"),
          color: DESK.muted,
          padding: "6px 12px 8px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {tool.header}
      </div>
      <div role="menu" aria-labelledby={headerId}>
        {tool.items.map((item, i) => (
          <StackRow
            key={item.id}
            item={item}
            first={i === 0}
            onSelect={onSelect}
            onKeyDown={onItemKeyDown}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

const ROW_STYLE = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 15,
  lineHeight: 1.3,
  color: DESK.text,
  textAlign: "left",
  textDecoration: "none",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  whiteSpace: "nowrap",
} as const;

function StackRow({
  item,
  first,
  onSelect,
  onKeyDown,
  onNavigate,
}: {
  item: PaletteItem;
  first: boolean;
  onSelect: (item: PaletteItem) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  onNavigate: () => void;
}) {
  const content = (
    <>
      <span>{item.label}</span>
      {item.trailing && (
        <span
          style={{
            fontFamily: DESK_MONO,
            fontSize: 13.5,
            color: item.trailingAccent ? DESK.accent : DESK.muted,
          }}
        >
          {item.trailing}
        </span>
      )}
    </>
  );
  const common = {
    role: "menuitem",
    tabIndex: first ? 0 : -1,
    className: `desk-pal-item ${FOCUS_RING_CLASS}`,
    style: ROW_STYLE,
    onKeyDown,
  };
  if (item.to) {
    return (
      <Link to={item.to} {...common} onClick={onNavigate}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" {...common} onClick={() => onSelect(item)}>
      {content}
    </button>
  );
}

/** The accent count chip: accent with ink on it, 12px, never narrower than it is tall. */
export function CountChip({ text, offset }: { text: string; offset: number }): ReactNode {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: offset,
        right: offset,
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 9,
        background: DESK.accent,
        color: DESK.accentInk,
        fontFamily: DESK_MONO,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: "18px",
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      {text}
    </span>
  );
}

/** The Shortlist's "something needs you": a 9px accent dot in the tool's
 *  corner, ringed in the community's desk surface (the main button's base)
 *  so it reads off the tool's border. */
export function Dot(): ReactNode {
  const tint = useDeskTint();
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: DESK.accent,
        boxShadow: `0 0 0 2px ${tint.surface}`,
        pointerEvents: "none",
      }}
    />
  );
}

/** The Profile tool's face: the member's photo, or their initials. */
export function Avatar({ imageUrl, initials }: { imageUrl?: string | null; initials: string }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
      />
    );
  }
  return <span style={{ fontFamily: DESK_MONO, fontSize: 13 }}>{initials}</span>;
}
