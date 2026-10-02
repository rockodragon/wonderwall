// The accent dot on the Shortlist's link in the nav (the phone's bottom bar,
// the sidebar's account row) when something needs you
// (docs/handoff/favorites-redesign/README.md, "Palette": "a yellow dot ...
// The number chip stays for messages"). A dot, not a number, so a count on
// the nav still only means messages. Its words, "4 need you", are what a
// screen reader hears: point the link's aria-describedby at `id`.
//
// Sits in the corner of whatever wraps it, which must be `relative`. The
// accent ink is the app's citron on dark and a readable olive on light.

import { needYouText } from "./copy";

export function NeedsYouDot({ id, count }: { id: string; count: number }) {
  return (
    <>
      <span
        aria-hidden
        className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: "var(--app-accent-ink)", boxShadow: "0 0 0 2px var(--app-surface-raised)" }}
      />
      <span id={id} className="sr-only">
        {needYouText(count)}
      </span>
    </>
  );
}
