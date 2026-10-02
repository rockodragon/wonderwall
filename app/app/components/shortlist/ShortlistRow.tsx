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
//
// The phone draws the same row (variant "phone"): a link to the item's page
// instead of a button that opens a card, on the app's --app-* tokens so it
// follows light and dark, and with the pay and status under the title where
// the desk has columns for them.

import { useState } from "react";
import { Link } from "react-router";
import { AbstractCover } from "../AbstractCover";
import { DESK, DESK_MONO, FOCUS_RING_CLASS } from "../../desk/tokens";
import { initialsOf } from "../../lib/initials";
import type { RowModel, Thumb } from "./rowModel";

const MONO = { fontFamily: DESK_MONO, fontSize: 12, textTransform: "uppercase" } as const;
const CLIP = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;

/** What pressing a row does: the desk opens its card, the phone follows a
 *  link to the item's page (itemHref). */
export type RowTarget = { variant?: "desk"; onOpen: (row: RowModel) => void } | { variant: "phone"; href: string };

// The desk is always dark; the phone sits in the app shell, whose --app-*
// tokens flip with light and dark. Accent text on the phone is the shell's
// accent ink, the one that stays readable on a light page.
const SKIN = {
  desk: {
    text: DESK.text,
    soft: DESK.textSoft,
    muted: DESK.muted,
    quiet: DESK.textQuiet,
    past: "#8a8a84",
    accent: DESK.accent,
    rule: DESK.accent,
    line: DESK.lineStrong,
    well: DESK.page,
    block: "#1d1d1d",
    blockHot: "rgba(255,224,102,.5)",
    face: DESK.paper,
    faceInk: DESK.paperInk,
  },
  phone: {
    text: "var(--app-text)",
    soft: "var(--app-text-muted)",
    muted: "var(--app-text-muted)",
    quiet: "var(--app-text-dim)",
    past: "var(--app-text-dim)",
    accent: "var(--app-accent-ink)",
    rule: "var(--app-accent)",
    line: "var(--app-hairline-raised)",
    well: "var(--app-hairline)",
    block: "var(--app-surface-raised)",
    blockHot: "var(--app-accent-ink)",
    face: "var(--app-hairline-raised)",
    faceInk: "var(--app-text)",
  },
} as const;
type Skin = (typeof SKIN)[keyof typeof SKIN];

/** A list of rows: a hairline above the first, and under each. Marked, so
 *  the desk can find a row's neighbours when focus needs a new home. */
export function ShortlistRows({ rows, onOpen }: { rows: RowModel[]; onOpen: (row: RowModel) => void }) {
  return (
    <ul data-shortlist-rows style={{ listStyle: "none", margin: 0, padding: 0, borderTop: `1px solid ${DESK.line}` }}>
      {rows.map((row) => (
        <li key={row.id} style={{ borderBottom: `1px solid ${DESK.line}` }}>
          <ShortlistRow row={row} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

export function ShortlistRow({ row, ...target }: { row: RowModel } & RowTarget) {
  const phone = target.variant === "phone";
  const skin = SKIN[phone ? "phone" : "desk"];
  const quiet = row.past ? skin.past : undefined;
  const rule = row.hot && (
    <span aria-hidden style={{ position: "absolute", left: 0, top: 9, bottom: 9, width: 3, borderRadius: 2, background: skin.rule }} />
  );
  const title = (
    <span
      className={row.past || phone ? undefined : "transition-colors group-hover:text-[#FFE066]"}
      style={{ display: "block", fontSize: 15, fontWeight: 500, color: quiet ?? skin.text, ...CLIP }}
    >
      {row.title}
    </span>
  );
  const sub = <span style={{ display: "block", fontSize: 13, color: quiet ?? skin.muted, ...CLIP }}>{row.sub}</span>;
  const meta = (
    <span style={{ ...MONO, letterSpacing: "0.12em", color: skin.quiet, ...(phone ? { flex: "none" } : { textAlign: "right" }), ...CLIP }}>
      {row.meta}
    </span>
  );
  const status = (
    <span
      style={{
        ...(phone ? null : { textAlign: "right" }),
        ...CLIP,
        ...(row.hot ? { ...MONO, letterSpacing: "0.14em", color: skin.accent } : { fontSize: 13, color: skin.soft }),
      }}
    >
      {row.status}
    </span>
  );
  const action = row.action && (
    <span
      aria-hidden
      className={phone ? undefined : "transition-colors group-hover:border-[#FFE066] group-hover:text-[#FFE066]"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: phone ? 30 : 32,
        padding: phone ? "0 12px" : "0 14px",
        borderRadius: 8,
        border: `1px solid ${skin.line}`,
        fontSize: 13.5,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {row.action}
    </span>
  );
  const thumb = <RowThumb thumb={row.thumb} hot={row.hot} skin={skin} />;

  if (target.variant === "phone") {
    return (
      <Link
        to={target.href}
        className="relative grid w-full items-center text-left no-underline transition-colors active:bg-[var(--app-hairline)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-accent-ink)]"
        style={{ gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 12, minHeight: 72, padding: "12px 8px 12px 14px", color: skin.text }}
      >
        {rule}
        {thumb}
        <span style={{ minWidth: 0 }}>
          {title}
          {sub}
          {/* Pay moves to a line of its own rather than clip the status. */}
          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 10, marginTop: 1 }}>
            {row.status && status}
            {row.meta && meta}
          </span>
        </span>
        {action}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-desk-card={row.id}
      aria-haspopup="dialog"
      onClick={() => target.onOpen(row)}
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
      {rule}
      {thumb}
      <span style={{ minWidth: 0 }}>
        {title}
        {sub}
      </span>
      {meta}
      {status}
      <span style={{ display: "flex", justifyContent: "flex-end" }}>{action}</span>
    </button>
  );
}

const THUMB = { width: 44, height: 44, borderRadius: 4, overflow: "hidden", flex: "none" } as const;

function RowThumb({ thumb, hot, skin }: { thumb: Thumb; hot: boolean; skin: Skin }) {
  // A picture that won't load falls back to the face the row has without one.
  const [broken, setBroken] = useState<string | null>(null);
  const url = thumb.kind !== "date" && thumb.url !== broken ? thumb.url : null;
  const onError = () => setBroken(url);
  switch (thumb.kind) {
    case "cover":
      return (
        <span aria-hidden style={{ ...THUMB, display: "block", position: "relative", background: skin.well }}>
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
            background: skin.block,
            border: `1px solid ${hot ? skin.blockHot : skin.line}`,
          }}
        >
          <span style={{ ...MONO, letterSpacing: "0.1em", color: skin.muted }}>{thumb.month}</span>
          <span style={{ marginTop: 4, fontSize: 17, fontWeight: 500, color: skin.text, fontVariantNumeric: "tabular-nums" }}>{thumb.day}</span>
        </span>
      );
    case "face":
      return url ? (
        <span aria-hidden style={{ ...THUMB, display: "block", borderRadius: "50%", background: skin.well }}>
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
            background: skin.face,
            color: skin.faceInk,
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
