// "Share a project", on the Canvas until the member has one up: something
// they're making, or something they finished, which is their Portfolio
// (docs/features/project-ia.md). It takes the spot the invite nudge has,
// under the greeting on a desktop and in a phone's Today, and leaves on its
// own once a project exists (lib/shareProject.ts ownsAProject): there is
// nothing to close. Two buttons, no body text (Rick, 2026-10-16).

import { Link } from "react-router";
import { FOCUS_RING_CLASS } from "../desk/tokens";
import { CARD_TONE, type CardTone } from "./cardTone";

const BUTTON = `inline-flex items-center justify-center rounded-lg border px-4 py-2 text-[13.5px] font-medium no-underline whitespace-nowrap transition-colors w-full sm:w-auto ${FOCUS_RING_CLASS}`;

export function ShareProjectCard({
  tone,
  makingHref,
  finishedHref,
  className,
}: {
  tone: CardTone;
  /** The start form: "Something I'm making". */
  makingHref: string;
  /** The same form on a finished piece (lib/shareProject.ts withFinishedStage). */
  finishedHref: string;
  /** Around the card, so a page's spacing goes with it. */
  className?: string;
}) {
  const c = CARD_TONE[tone];
  return (
    <section
      aria-label="Share a project"
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-5 py-4 ${className ?? ""}`}
      style={{ borderColor: c.line, background: c.bg, maxWidth: 600 }}
    >
      <p className="min-w-[8rem] flex-1 text-[15px] font-semibold" style={{ color: c.text }}>
        Share a project
      </p>
      <Link to={makingHref} className={BUTTON} style={{ borderColor: c.accent, color: c.accent }}>
        Something I'm making
      </Link>
      <Link to={finishedHref} className={BUTTON} style={{ borderColor: c.line, color: c.text }}>
        Something I finished
      </Link>
    </section>
  );
}
