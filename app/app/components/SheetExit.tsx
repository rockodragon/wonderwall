// Escape and the browser's Back close a sheet that fills the screen.
//
// Back is the one that went wrong: opening a sheet from a button adds no
// history entry, so Back left the page and the sheet's typed text with it.
// Here Back is caught (react-router's useBlocker) and closes the sheet, and
// the visitor stays where they were. Only a Back is caught: a push or a
// replace goes through, so a sheet that drops its own ?create= param
// (desk/DeskCreate.tsx) or sends the visitor on to a new page isn't held up.
//
// A sheet that is open because of the address (the Canvas's ?create=project)
// is the exception: its Back already closes it, by going to the address
// without the param, so it asks for `inUrl` and only Escape is added.
// Catching that Back would put the page back, then close by navigating while
// the browser's own undo is still in flight, and leave the address and the
// page disagreeing.
//
// Render it inside the sheet; it draws nothing and stops with the sheet.

import { useCallback, useContext, useEffect, useRef } from "react";
import { UNSAFE_DataRouterContext, useBlocker, type BlockerFunction } from "react-router";

/** True for Back and Forward: the one kind of move that closes the sheet.
 *  A module-level function, not an inline one, so the router isn't handed a
 *  new blocker on every render. */
export const isBack: BlockerFunction = ({ historyAction }) => historyAction === "POP";

export function SheetExit({ onExit, inUrl }: { onExit: () => void; inUrl?: boolean }) {
  // Read at the moment of the key or the Back, so a sheet can refuse while
  // it is saving without this re-subscribing on every render.
  const latest = useRef(onExit);
  latest.current = onExit;
  const exit = useCallback(() => latest.current(), []);

  // Escape closes. Something inside that already used the Escape (a
  // location search closing its list) marks the event handled, and this
  // stands down, as the Canvas does (desk/Desk.tsx).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      exit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exit]);

  // useBlocker throws outside a data router (createBrowserRouter, or the
  // app itself): a plain <MemoryRouter>, as route tests render in, has none.
  // There, nothing is caught and Back is the browser's own.
  return useContext(UNSAFE_DataRouterContext) && !inUrl ? <ExitOnBack onExit={exit} /> : null;
}

function ExitOnBack({ onExit }: { onExit: () => void }) {
  const blocker = useBlocker(isBack);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    // The router is undoing the Back, so `onExit` must only change state: a
    // close that navigates would race the undo (see `inUrl`). Then clear the
    // block, so the next Back is the visitor's own.
    onExit();
    blocker.reset();
  }, [blocker, onExit]);
  return null;
}
