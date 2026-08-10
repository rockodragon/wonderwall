// The Garden — line icon set. Credit-sheet rules: 1.5px stroke, currentColor,
// geometric, no fills. Size via the `size` prop; color via CSS color on the parent.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** I make things — brush */
export const IconMake = (p: IconProps) => (
  <Base {...p}>
    <path d="M19 3l2 2-8.5 8.5-3 1 1-3L19 3z" />
    <path d="M9.5 12.5C7 13 5 14.5 4.5 17c-.3 1.5-1 2.5-2.5 3 2.5 1 6 .5 7.5-1.5 1-1.3 1-3 .5-4.5" />
  </Base>
);

/** I fund work — seed in palm */
export const IconFund = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3c1.8 1.2 2.7 2.8 2.7 4.5S13.8 10.8 12 12c-1.8-1.2-2.7-2.8-2.7-4.5S10.2 4.2 12 3z" />
    <path d="M4 17c2-1.5 4-1.5 6-.5l3 1.5c1 .5 2 .3 2.7-.3L20 14" />
    <path d="M4 21h4l4 .5c2 .2 4-.5 5.5-2L21 17" />
  </Base>
);

/** I have a place — door ajar */
export const IconPlace = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 21h16" />
    <path d="M6 21V5a2 2 0 012-2h8a2 2 0 012 2v16" />
    <path d="M10 21V8l5-2v15" />
    <circle cx="12.5" cy="14" r="0.5" />
  </Base>
);

/** I gather people — chairs at a table edge */
export const IconGather = (p: IconProps) => (
  <Base {...p}>
    <circle cx="7" cy="6" r="2.2" />
    <circle cx="17" cy="6" r="2.2" />
    <path d="M3.5 20v-3a3.5 3.5 0 013.5-3.5h1A3.5 3.5 0 0111.5 17v3" />
    <path d="M12.5 20v-3a3.5 3.5 0 013.5-3.5h1a3.5 3.5 0 013.5 3.5v3" />
  </Base>
);

/** A seat — chair */
export const IconSeat = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 3v8h10V3" />
    <path d="M5 11h14v3H5z" />
    <path d="M6.5 14L6 21M17.5 14l.5 7M12 14v3" />
  </Base>
);

/** A table — the roster that belongs */
export const IconTable = (p: IconProps) => (
  <Base {...p}>
    <ellipse cx="12" cy="8" rx="8" ry="3" />
    <path d="M4 8v2c0 1.2 2 2.3 5 2.8L8 21M20 8v2c0 1.2-2 2.3-5 2.8L16 21" />
  </Base>
);

/** Passion project — spark */
export const IconSpark = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19" />
  </Base>
);

/** Paid project — tag with declared number */
export const IconTag = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 11V4a1 1 0 011-1h7l10 10-8 8L3 11z" />
    <circle cx="8" cy="8" r="1.5" />
  </Base>
);

/** Grant pool — droplets */
export const IconPool = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5c2.5 3 4 5.3 4 7.5a4 4 0 11-8 0c0-2.2 1.5-4.5 4-7.5z" />
    <path d="M5.5 14.5c1.2 1.5 2 2.7 2 3.9a2.4 2.4 0 11-4.8 0c0-1.2.8-2.4 2.8-3.9zM18.5 14.5c1.2 1.5 2 2.7 2 3.9a2.4 2.4 0 11-4.8 0c0-1.2.8-2.4 2.8-3.9z" transform="scale(0.9) translate(1.3 1.3)" />
  </Base>
);

/** Event — calendar day */
export const IconEvent = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
    <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
  </Base>
);

/** People / roster */
export const IconPeople = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 20v-1.5A4.5 4.5 0 018 14h2a4.5 4.5 0 014.5 4.5V20" />
    <path d="M16 5.5a3 3 0 010 5.5M18.5 14.5a4 4 0 012 3.5v2" />
  </Base>
);

/** Money / ledger */
export const IconLedger = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <path d="M8 8h8M8 12h8M8 16h4" />
  </Base>
);

/** Grow — sprout */
export const IconGrow = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 21v-8" />
    <path d="M12 13c0-3.5-2.5-6-6-6 0 3.5 2.5 6 6 6zM12 10c0-3 2.2-5 5.5-5 0 3-2.2 5-5.5 5z" />
  </Base>
);

/** QR mark */
export const IconQr = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z" />
  </Base>
);

/** Credit line — the sponsor's name on the work */
export const IconCredit = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 19h16" />
    <path d="M6 15c2-6 4-9 6-9s4 3 6 9" />
    <circle cx="12" cy="6" r="0.5" />
  </Base>
);

/** Check — allowed */
export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Base>
);

/** Arrow */
export const IconArrow = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12h16M13 5l7 7-7 7" />
  </Base>
);
