// /showcase — November 6 at Lightchurch, Encinitas. Every link in the
// Instagram push points here (docs/marketing/showcase-open-call.md), so it is
// public, prerendered, and readable with no account.
//
// ONE TICKET, ONE PRICE, ONE ASK (Rick, 2026-09-25). The page used to run a
// juried open call beside a two-tier ticket ($25 creative, $75 patron), six
// ways to take part and a grid of personas. All of that is gone: art is
// submitted from a member's profile in the app (the FAQ points there), not
// through a form on this page, and we are not sorting people into
// creatives and patrons. Everyone gets the same $25 ticket; generosity beyond
// it is something we ask for later, not something the ticket tries to
// extract. If this page starts growing roles, tiers or an application again,
// that is a product decision to take back to Rick, not a copy edit.
//
// The ask is the ticket, right under the poem. It goes to the event's own
// page (EVENT_PATH), which takes the RSVP and the payment through Abiding
// Practice's Stripe Payment Link; the AP webhook adds the buyer to the event.
// The old email-capture overlay (TicketModal in ../garden/showcase-modals)
// is no longer used here.
//
// The FAQ uses native <details>/<summary> rather than a React accordion:
// every answer stays in the prerendered HTML for crawlers and answer engines,
// and the keyboard support comes free. Don't "upgrade" it to JS.
//
// The hero is the Abiding Creatives poster, used as is (it's already
// light-on-dark).
//
// The route-level ErrorBoundary is a net, not a plan: nothing on this page
// may make a query the page can't live without. If a decorative query ever
// comes back, give it its own component behind its own error boundary.

import { useRouteError } from "react-router";
import { GardenErrorState, GardenPage } from "../garden/ui";
import "../garden/garden.css";
import { ShowcaseContent } from "../components/ShowcaseContent";

export function meta() {
  return [
    {
      title:
        "The Creative Economy We All Need — November 6, Encinitas | The Garden",
    },
    {
      name: "description",
      content:
        "A night of creative work at Lightchurch, Encinitas. Tickets $25, and every ticket goes into the Sophia Grant Fund. November 6, 2026.",
    },
    {
      property: "og:title",
      content: "The Creative Economy We All Need — November 6, Encinitas",
    },
    {
      property: "og:description",
      content:
        "A night of creative work at Lightchurch, Encinitas. Tickets $25. Every ticket goes into the Sophia Grant Fund.",
    },
    { property: "og:type", content: "website" },
    // Absolute — a relative og:image doesn't unfurl on Instagram, iMessage
    // or Slack. The drawing is 1330x795; large-summary cards letterbox it.
    { property: "og:image", content: OG_IMAGE },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    {
      name: "twitter:title",
      content: "The Creative Economy We All Need — November 6, Encinitas",
    },
    {
      name: "twitter:description",
      content:
        "A night of creative work at Lightchurch, Encinitas. Tickets $25. Every ticket goes into the Sophia Grant Fund.",
    },
    { name: "twitter:image", content: OG_IMAGE },
  ];
}

/** The backstop: a designed sentence and a way home, never a stack frame. */
export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This page isn't loading right now — try again in a moment." />
      </div>
    </GardenPage>
  );
}

const OG_IMAGE = "https://thecreative.exchange/showcase/abiding-creatives-og.jpg";

export default function Showcase() {
  return (
    <GardenPage>
      <ShowcaseContent />
    </GardenPage>
  );
}
