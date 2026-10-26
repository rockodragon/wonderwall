// What's inside a button for your own page (ownPageButton.ts): its icon and
// its name. The phone tile carries both names, one hidden at each width, so
// one button serves a phone and a wide screen; an icon button keeps its name
// for screen readers only.

import type { Icon } from "@phosphor-icons/react";
import type { OwnPageLook, OwnPageName } from "./ownPageButton";

// On a button, a tile's name can wrap on a narrow phone (320px): keep both
// lines centered and close together under the icon.
const TILE_NAME = "text-center leading-tight";

export function OwnPageLabel({
  look,
  label,
  tileClassName,
}: {
  look: OwnPageLook;
  label: OwnPageName;
  tileClassName?: string;
}) {
  if (look === "icon") return <span className="sr-only">{label.plain}</span>;
  if (look === "pill") return <>{label.pill}</>;
  return (
    <>
      <span className={tileClassName ? `${tileClassName} sm:hidden` : "sm:hidden"}>{label.tile}</span>
      <span className="hidden sm:inline">{label.pill}</span>
    </>
  );
}

export function OwnPageFace({ look, icon: Glyph, label }: { look: OwnPageLook; icon: Icon; label: OwnPageName }) {
  return (
    <>
      {/* A larger icon over the tile's name; the pill's size from `sm` up. */}
      <Glyph
        size={look === "pill" ? 16 : look === "icon" ? 18 : 20}
        className={look === "phoneTile" ? "sm:size-4" : undefined}
        aria-hidden
      />
      <OwnPageLabel look={look} label={label} tileClassName={TILE_NAME} />
    </>
  );
}
