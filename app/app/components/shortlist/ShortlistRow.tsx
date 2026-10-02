// One Shortlist row (rowModel.ts says what it reads): 64px, a thumbnail or
// date block, the title and a second line, mono meta, the status, and on a
// Needs you row a 3px yellow rule, a yellow mono status and an outline
// action. Rows, not cards: status, dates and pay are what people decide on,
// and rows fit 10+ items on a screen.
//
// The whole row is one button that opens the item's card; the outline
// "Reply" or "Apply" on it is a label for where that leads, not a second
// control. Drawn in the desk's colors (desk/tokens.ts): the desk is always
// dark.

import { useState } from "react";
import { AbstractCover } from "../AbstractCover";
import { DESK, DESK_MONO, FOCUS_RING_CLASS } from "../../desk/tokens";
import { initialsOf } from "../../lib/initials";
import type { RowModel, Thumb } from "./rowModel";

const MONO = { fontFamily: DESK_MONO, fontSize: 12, textTransform: "uppercase" } as const;
const CLIP = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;

/** A list of rows: a hairline above the first, and under each. */
export function ShortlistRows({ rows, onOpen }: { rows: RowModel[]; onOpen: (row: RowModel) => void }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: `1px solid ${DESK.line}` }}>
      {rows.map((row) => (
        <li key={row.id} style={{ borderBottom: `1px solid ${DESK.line}` }}>
          <ShortlistRow row={row} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

export function ShortlistRow({ row, onOpen }: { row: RowModel; onOpen: (row: RowModel) => void }) {
  const quiet = row.past ? "#8a8a84" : undefined;
  return (
    <button
      type="button"
      data-desk-card={row.id}
      aria-haspopup="dialog"
      onClick={() => onOpen(row)}
      className={`group relative grid w-full cursor-pointer items-center border-0 bg-transparent text-left transition-colors hover:bg-[rgba(255,255,255,0.035)] ${FOCUS_RING_CLASS}`}
      style={{
        gridTemplateColumns: "44px minmax(0,1fr) 128px 200px 88px",
        gap: 16,
        minHeight: 64,
        padding: "10px 12px 10px 16px",
        color: DESK.text,
        font: "inherit",
      }}
    >
      {row.hot && (
        <span aria-hidden style={{ position: "absolute", left: 0, top: 9, bottom: 9, width: 3, borderRadius: 2, background: DESK.accent }} />
      )}
      <RowThumb thumb={row.thumb} hot={row.hot} />
      <span style={{ minWidth: 0 }}>
        <span
          className={row.past ? undefined : "transition-colors group-hover:text-[#FFE066]"}
          style={{ display: "block", fontSize: 15, fontWeight: 500, color: quiet ?? DESK.text, ...CLIP }}
        >
          {row.title}
        </span>
        <span style={{ display: "block", fontSize: 13, color: quiet ?? DESK.muted, ...CLIP }}>{row.sub}</span>
      </span>
      <span style={{ ...MONO, letterSpacing: "0.12em", color: DESK.textQuiet, textAlign: "right", ...CLIP }}>{row.meta}</span>
      <span
        style={{
          textAlign: "right",
          ...CLIP,
          ...(row.hot ? { ...MONO, letterSpacing: "0.14em", color: DESK.accent } : { fontSize: 13, color: DESK.textSoft }),
        }}
      >
        {row.status}
      </span>
      <span style={{ display: "flex", justifyContent: "flex-end" }}>
        {row.action && (
          <span
            aria-hidden
            className="transition-colors group-hover:border-[#FFE066] group-hover:text-[#FFE066]"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 32,
              padding: "0 14px",
              borderRadius: 8,
              border: `1px solid ${DESK.lineStrong}`,
              fontSize: 13.5,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {row.action}
          </span>
        )}
      </span>
    </button>
  );
}

const THUMB = { width: 44, height: 44, borderRadius: 4, overflow: "hidden", flex: "none" } as const;

function RowThumb({ thumb, hot }: { thumb: Thumb; hot: boolean }) {
  // A picture that won't load falls back to the face the row has without one.
  const [broken, setBroken] = useState<string | null>(null);
  const url = thumb.kind !== "date" && thumb.url !== broken ? thumb.url : null;
  const onError = () => setBroken(url);
  switch (thumb.kind) {
    case "cover":
      return (
        <span aria-hidden style={{ ...THUMB, display: "block", position: "relative", background: DESK.page }}>
          {url ? (
            <img src={url} alt="" decoding="async" loading="lazy" onError={onError} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <AbstractCover seed={thumb.seed} />
          )}
        </span>
      );
    case "date":
      return (
        <span
          aria-hidden
          style={{
            ...THUMB,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            background: "#1d1d1d",
            border: `1px solid ${hot ? "rgba(255,224,102,.5)" : DESK.lineStrong}`,
          }}
        >
          <span style={{ ...MONO, letterSpacing: "0.1em", color: DESK.muted }}>{thumb.month}</span>
          <span style={{ marginTop: 4, fontSize: 17, fontWeight: 500, color: DESK.text, fontVariantNumeric: "tabular-nums" }}>{thumb.day}</span>
        </span>
      );
    case "face":
      return url ? (
        <span aria-hidden style={{ ...THUMB, display: "block", borderRadius: "50%", background: DESK.page }}>
          <img src={url} alt="" decoding="async" loading="lazy" onError={onError} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </span>
      ) : (
        <span
          aria-hidden
          style={{
            ...THUMB,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: DESK.paper,
            color: DESK.paperInk,
            fontFamily: DESK_MONO,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {initialsOf(thumb.name)}
        </span>
      );
  }
}
