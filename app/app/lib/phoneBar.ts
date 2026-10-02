// The phone bottom bar (routes/_app.tsx) is a fixed 4rem tall. A page that
// fills the window and places its own bottom edge, like an open message
// thread, stops above it on a phone so the bar never covers its last row.

/** The bar's own height. */
export const PHONE_BAR_HEIGHT = "h-16";

/** A full-window page: the window less the bar on a phone, all of it from md. */
export const FULL_HEIGHT = "h-[calc(100dvh-4rem)] md:h-screen";
