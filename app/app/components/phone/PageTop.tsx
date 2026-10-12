// The top of a page on a phone (docs/features/phone-screens.md): the title
// on the left, one action on the right, and a way back when the page is a
// level inside another. It sticks to the top of the window while the page
// scrolls, the way a native list's bar does, so the title and the action
// stay in reach. From md up it sits still; the pages that draw their own
// desktop header (an h1 with a line under it: Events, Projects) leave it out
// there with `className="md:hidden"`.
//
// It bleeds to the screen's edges from inside the page's p-4 sm:p-6 gutter
// and puts the gutter back inside itself, so the bar spans the screen and
// its text still lines up with the page.

import type { ReactNode, Ref } from "react";
import { Link } from "react-router";
import { CaretLeft } from "@phosphor-icons/react";

/** The page's side gutter (p-4 sm:p-6), and the negative margin that bleeds past it. */
export const PHONE_GUTTER = "px-4 sm:px-6";
export const PHONE_BLEED = "-mx-4 sm:-mx-6";

const RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent-ink)]";

export function PageTop({
  title,
  count,
  back,
  action,
  className = "",
}: {
  title: ReactNode;
  /** Dim, after the title: "39 things", "15". */
  count?: string | null;
  /** A level up: the arrow on the left, named for where it goes. */
  back?: { to: string; label: string };
  /** The bar's one action, on the right: a TopButton, usually. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`sticky top-0 z-30 md:static ${PHONE_BLEED} ${PHONE_GUTTER} flex min-h-[56px] items-center gap-3 py-2 ${className}`}
      style={{ backgroundColor: "var(--app-surface)" }}
    >
      {back && (
        <Link
          to={back.to}
          aria-label={back.label}
          className={`-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full no-underline ${RING}`}
          style={{ color: "var(--app-text)" }}
        >
          <CaretLeft size={22} weight="bold" aria-hidden />
        </Link>
      )}
      <h1
        className="min-w-0 flex-1 truncate text-[22px] font-semibold leading-tight md:text-3xl"
        style={{ color: "var(--app-text)", fontFamily: "var(--garden-font-display)" }}
      >
        {title}
        {count && (
          <span className="ml-2 text-[15px] font-normal" style={{ color: "var(--app-text-dim)" }}>
            {count}
          </span>
        )}
      </h1>
      {action}
    </header>
  );
}

const TOP_BUTTON = `inline-flex h-9 shrink-0 items-center gap-1 rounded-full pl-3 pr-3.5 text-[13.5px] font-semibold no-underline transition-opacity hover:opacity-90 ${RING}`;
const TOP_BUTTON_STYLE = { backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" } as const;

/** The bar's one action: a short word on a citron pill ("Host", "Post",
 *  "New"), with a glyph before it. A button, or a link with `to`. */
export function TopButton({
  to,
  onClick,
  icon,
  children,
  ...rest
}: {
  to?: string;
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: boolean | "true" | "menu";
}) {
  const inside = (
    <>
      {icon}
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={TOP_BUTTON} style={TOP_BUTTON_STYLE}>
        {inside}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={TOP_BUTTON} style={TOP_BUTTON_STYLE} {...rest}>
      {inside}
    </button>
  );
}
