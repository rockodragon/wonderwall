// What an overview tile says of its area (docs/handoff/favorites-redesign/
// README.md, "Three levels"): what's in it, by name, not how many. Projects
// and Events name up to three, then "and N more →"; People shows the faces of
// the five followed most recently and their first names. summary() decides
// the content (lib/shortlist/model.ts); this draws it for the desk's tiles
// (variant "desk", always dark) and the phone's (variant "phone", on the
// app's --app-* tokens), so the two can't say different things.

import { useState } from "react";
import { DESK, DESK_MONO } from "../../desk/tokens";
import { initialsOf } from "../../lib/initials";
import type { FacesPreview, LinesPreview, ShortlistSummary } from "../../lib/shortlist/model";
import type { ShortlistArea } from "../../lib/shortlist/url";
import { moreText } from "./copy";

export type TileVariant = "desk" | "phone";

const SKIN = {
  desk: {
    muted: DESK.muted,
    more: DESK.textSoft,
    face: DESK.paper,
    faceInk: DESK.paperInk,
    ring: DESK.panel,
    mono: DESK_MONO,
    font: 13,
    note: 12,
    faceSize: 34,
    faceFont: 11,
    overlap: 5,
  },
  phone: {
    muted: "var(--app-text-muted)",
    more: "var(--app-text-muted)",
    face: "var(--app-hairline-raised)",
    faceInk: "var(--app-text)",
    ring: "var(--app-surface-raised)",
    mono: "var(--garden-font-mono)",
    font: 14.5,
    note: 14.5,
    faceSize: 38,
    faceFont: 12,
    overlap: 8,
  },
} as const;
type Skin = (typeof SKIN)[TileVariant];

export function TilePreview({ area, summary, variant }: { area: ShortlistArea; summary: ShortlistSummary; variant: TileVariant }) {
  const skin = SKIN[variant];
  return area === "people" ? (
    <Faces preview={summary.people.preview} skin={skin} />
  ) : (
    <Lines preview={summary[area].preview} skin={skin} />
  );
}

/** "Zine Workshop · Hosting · Today 7PM", one to a line. Only the name gives
 *  way when the line is long: what to know of the item stays whole. */
function Lines({ preview, skin }: { preview: LinesPreview; skin: Skin }) {
  return (
    <span style={{ display: "block", fontSize: skin.font, lineHeight: 1.45 }}>
      <span style={{ display: "grid", gap: 3 }}>
        {preview.items.map((line) => (
          <span key={line.key} title={`${line.name} · ${line.note}`} style={{ display: "flex", minWidth: 0, gap: 5 }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.name}</span>
            <span style={{ flex: "none", fontSize: skin.note, color: skin.muted, whiteSpace: "nowrap" }}>{`· ${line.note}`}</span>
          </span>
        ))}
      </span>
      {preview.more > 0 && <span style={{ display: "block", marginTop: 4, color: skin.more }}>{moreText(preview.more)}</span>}
    </span>
  );
}

function Faces({ preview, skin }: { preview: FacesPreview; skin: Skin }) {
  return (
    <span style={{ display: "block", fontSize: skin.font, lineHeight: 1.45 }}>
      <span aria-hidden style={{ display: "flex" }}>
        {preview.items.map((person, i) => (
          <Face key={person.profileId} person={person} skin={skin} first={i === 0} />
        ))}
      </span>
      <span style={{ display: "block", marginTop: 10 }}>{preview.line}</span>
    </span>
  );
}

/** A photo, or their initials when there's none or it won't load. */
function Face({ person, skin, first }: { person: FacesPreview["items"][number]; skin: Skin; first: boolean }) {
  const [broken, setBroken] = useState<string | null>(null);
  const url = person.imageUrl && person.imageUrl !== broken ? person.imageUrl : null;
  return (
    <span
      style={{
        width: skin.faceSize,
        height: skin.faceSize,
        flex: "none",
        marginLeft: first ? 0 : -skin.overlap,
        overflow: "hidden",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: skin.face,
        color: skin.faceInk,
        fontFamily: skin.mono,
        fontSize: skin.faceFont,
        fontWeight: 500,
        boxShadow: `0 0 0 2px ${skin.ring}`,
      }}
    >
      {url ? (
        <img src={url} alt="" decoding="async" loading="lazy" onError={() => setBroken(url)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initialsOf(person.name)
      )}
    </span>
  );
}
