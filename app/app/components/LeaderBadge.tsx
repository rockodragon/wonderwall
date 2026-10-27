// The crimson sprout that marks a community leader, beside their name: on
// their profile page, and on their card in the People directory (/people and
// the desk's People). Who is one is decided on the server and arrives as
// `isLeader` (convex/garden/communityLeader.ts); this only draws it.
//
// Two sizes. The badge says "community leader" in small block letters, for
// a header with room for it. `compact` is the sprout alone for a spot too
// tight for the words (a directory card's name line, where the name is cut
// short with an ellipsis and a long badge would crowd it out); it carries the
// words as its label and tooltip instead.
//
// Two surfaces, because crimson has to be read against both:
//   page  follows the theme (dark unless data-theme="light"): #be123c
//         (rose-700) on light, 5.9:1 on the paper page and 4.9:1 on a raised
//         card; #fb7185 (rose-400) on dark, 7.0:1 on the page's #121212 and
//         5.8:1 on a raised card.
//   dark  the desk's cards, which are dark in both themes and often sit on a
//         photo: rose-400 on a near-black chip (#0c0c0c at 90%), 5.8:1 even
//         over a white photo. 12px, the desk's smallest size.
// Hex rather than Tailwind's rose scale, whose v4 values are not these.

import { Plant } from "@phosphor-icons/react";

const WORDS = "community leader";
const LABEL = "Community leader";

const SURFACE = {
  page: {
    box: "text-[#be123c] dark:text-[#fb7185]",
    text: "text-[11px]",
  },
  dark: {
    box: "rounded-full bg-[rgba(12,12,12,0.9)] px-2 py-1 text-[#fb7185]",
    text: "text-xs",
  },
} as const;

export function LeaderBadge({
  compact = false,
  surface = "page",
  className = "",
}: {
  /** The sprout alone, labelled "Community leader", for a tight spot. */
  compact?: boolean;
  /** `dark` for the desk's cards (always dark); `page` follows the theme. */
  surface?: keyof typeof SURFACE;
  className?: string;
}) {
  const look = SURFACE[surface];
  if (compact) {
    return (
      <span role="img" aria-label={LABEL} title={LABEL} className={`inline-flex shrink-0 ${look.box} ${className}`}>
        <Plant size={16} weight="fill" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={`inline-flex max-w-full items-center gap-1 ${look.box} ${look.text} ${className}`}>
      <Plant size={13} weight="fill" aria-hidden="true" className="shrink-0" />
      <span className="font-semibold uppercase leading-tight tracking-[0.06em]">{WORDS}</span>
    </span>
  );
}
