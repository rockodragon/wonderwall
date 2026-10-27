// The backdrop for create flows (start a project, host an event, hire for
// set dates). The form is one card on the desk's own dotted surface, with
// nothing from the page behind it (docs/features/desktop-desk-palette.md,
// "Create flows"). It replaces the old 60% black overlay, which let the
// list show through.
//
// It only draws the surface and centres the card; the card keeps its own
// dialog role, labels and close button. A card taller than the window
// scrolls the backdrop. z-50 puts it above the palette (z-40).

import type { ReactNode } from "react";
import { deskSurfaceStyle, useDeskTint } from "../desk/tokens";

export function FocusBackdrop({
  children,
  phoneFullScreen = true,
}: {
  children: ReactNode;
  /** True (the default): on a phone the card fills the screen edge to edge.
   *  False: the card keeps a gutter and centres, as it does on a larger window. */
  phoneFullScreen?: boolean;
}) {
  // The desk of the community the member is on, so a form opens on the same
  // surface it was started from.
  const tint = useDeskTint();
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
      style={deskSurfaceStyle(tint)}
    >
      {/* On a phone the row is exactly the screen (the backdrop is fixed to
          it), so a card that fills it keeps its own footer in view under the
          browser's bar; a taller card still scrolls the backdrop. */}
      <div
        className={`flex justify-center ${
          phoneFullScreen ? "h-full items-stretch sm:h-auto sm:min-h-full sm:items-center sm:p-4" : "min-h-full items-center p-4"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
