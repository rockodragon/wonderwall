// Class strings for the admin pages (routes/admin*.tsx), so they all read as
// the same dark shell as the rest of the app instead of each page carrying its
// own grays. Everything points at the --app-* tokens in public/tokens.css.
//
// Text on a raised surface (cards, tables) is measured, not guessed:
//   --app-text        14:1   titles and the main thing in a cell
//   --garden-body      9:1   paragraphs
//   --app-text-muted   6.8:1 secondary lines and labels
//   --app-text-dim     5.1:1 only on the page ground (6.1:1), never on a card
// Nothing here is under 12px; controls and table text are 13.5px or more,
// column headers 12.5px.
//
// The strings are written out whole so Tailwind can see them.

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--app-accent)]";

const CARD =
  "rounded-xl border border-[color:var(--app-hairline)] bg-[var(--app-surface-raised)]";

const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const CHIP =
  "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-medium whitespace-nowrap";

const NOTICE = "rounded-lg border px-3.5 py-3 text-[13.5px]";

export const admin = {
  focus: FOCUS,

  // Page
  h1: "text-2xl sm:text-3xl font-semibold text-[color:var(--app-text)]",
  h2: "text-lg font-semibold text-[color:var(--app-text)]",
  h3: "text-[15px] font-semibold text-[color:var(--app-text)]",
  body: "text-[14px] leading-relaxed text-[color:var(--garden-body)]",
  meta: "text-[13.5px] text-[color:var(--app-text-muted)]",
  hint: "text-[12.5px] text-[color:var(--app-text-muted)]",
  backLink: `text-[13.5px] text-[color:var(--app-text-muted)] transition-colors hover:text-[color:var(--app-text)] rounded ${FOCUS}`,
  link: `underline underline-offset-2 decoration-[color:var(--app-hairline-raised)] transition-colors hover:text-[color:var(--app-accent-ink)] hover:decoration-current rounded-sm ${FOCUS}`,
  code: "rounded bg-[var(--app-surface)] px-1.5 py-0.5 text-[12.5px] text-[color:var(--app-text)]",

  // Surfaces
  card: CARD,
  panel: `${CARD} p-5 sm:p-6`,
  inset: "rounded-lg border border-[color:var(--app-hairline)] bg-[var(--app-surface)]",
  divide: "divide-y divide-[color:var(--app-hairline)]",
  ruleTop: "border-t border-[color:var(--app-hairline)]",
  ruleBottom: "border-b border-[color:var(--app-hairline)]",

  // A whole card that is one link (the /admin destinations)
  cardLink: `group flex h-full flex-col gap-1.5 ${CARD} p-5 transition-colors hover:border-[color:var(--app-hairline-raised)] hover:bg-[var(--app-hairline)] ${FOCUS}`,

  // Buttons. Primary is the app's citron fill; secondary is an outline;
  // danger is a quiet red outline (destructive, so never the fill).
  btnPrimary: `${BTN} bg-[var(--app-accent)] text-[color:var(--garden-ink)] enabled:hover:opacity-90 ${FOCUS}`,
  btnSecondary: `${BTN} border border-[color:var(--app-hairline-raised)] text-[color:var(--app-text)] enabled:hover:bg-[var(--app-hairline)] ${FOCUS}`,
  btnDanger: `${BTN} border border-red-400/50 text-red-300 enabled:hover:bg-red-400/10 ${FOCUS}`,
  btnQuiet: `inline-flex items-center rounded-lg px-3 py-1.5 text-[13.5px] font-medium text-[color:var(--app-text-muted)] transition-colors enabled:hover:text-[color:var(--app-text)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  // A text-only action inside a card ("Clear my vote", "Add a note")
  btnText: `rounded text-[13.5px] text-[color:var(--app-text-muted)] underline underline-offset-2 transition-colors enabled:hover:text-[color:var(--app-text)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  // Smaller buttons that sit inside a table row
  btnRowSecondary: `inline-flex items-center justify-center rounded-lg border border-[color:var(--app-hairline-raised)] px-3 py-1.5 text-[13.5px] font-medium whitespace-nowrap text-[color:var(--app-text)] transition-colors enabled:hover:bg-[var(--app-hairline)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  btnRowDanger: `inline-flex items-center justify-center rounded-lg border border-red-400/50 px-3 py-1.5 text-[13.5px] font-medium whitespace-nowrap text-red-300 transition-colors enabled:hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  btnRowPrimary: `inline-flex items-center justify-center rounded-lg bg-[var(--app-accent)] px-3 py-1.5 text-[13.5px] font-semibold whitespace-nowrap text-[color:var(--garden-ink)] transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  // A pressed/unpressed filter pill (the showcase buckets)
  pillOn: `rounded-lg border border-[color:var(--app-accent)] bg-[var(--app-accent-wash)] px-3 py-1.5 text-[13.5px] font-medium text-[color:var(--app-text)] ${FOCUS}`,
  pillOff: `rounded-lg border border-[color:var(--app-hairline-raised)] px-3 py-1.5 text-[13.5px] font-medium text-[color:var(--app-text-muted)] transition-colors hover:text-[color:var(--app-text)] hover:bg-[var(--app-hairline)] ${FOCUS}`,

  // Fields. Inset (the page ground) so a field reads as a hollow in the card.
  input: `w-full rounded-lg border border-[color:var(--app-hairline-raised)] bg-[var(--app-surface)] px-3 py-2 text-[13.5px] text-[color:var(--app-text)] placeholder:text-[color:var(--app-text-dim)] disabled:opacity-50 ${FOCUS}`,
  select: `rounded-lg border border-[color:var(--app-hairline-raised)] bg-[var(--app-surface)] px-3 py-2 text-[13.5px] text-[color:var(--app-text)] disabled:opacity-50 ${FOCUS}`,
  label: "block text-[12.5px] font-medium text-[color:var(--app-text-muted)] mb-1",

  // Chips (status badges). Tinted fill, light text.
  chip: {
    neutral: `${CHIP} bg-[var(--app-hairline)] text-[color:var(--app-text-muted)]`,
    green: `${CHIP} bg-green-400/15 text-green-300`,
    amber: `${CHIP} bg-amber-400/15 text-amber-300`,
    red: `${CHIP} bg-red-400/15 text-red-300`,
    purple: `${CHIP} bg-purple-400/15 text-purple-300`,
    sky: `${CHIP} bg-sky-400/15 text-sky-300`,
    orange: `${CHIP} bg-orange-400/15 text-orange-300`,
  },

  // Messages
  notice: {
    info: `${NOTICE} border-[color:var(--app-hairline-raised)] bg-[var(--app-surface-raised)] text-[color:var(--app-text)]`,
    ok: `${NOTICE} border-green-400/30 bg-green-400/10 text-green-200`,
    error: `${NOTICE} border-red-400/30 bg-red-400/10 text-red-200`,
    warn: `${NOTICE} border-amber-400/30 bg-amber-400/10 text-amber-100`,
  },

  // Tables
  tableWrap: `${CARD} overflow-hidden`,
  tableScroll: "overflow-x-auto",
  table: "w-full text-left",
  thead: "border-b border-[color:var(--app-hairline)] bg-[var(--app-surface)]",
  th: "px-4 py-3 text-left align-bottom whitespace-nowrap text-[12.5px] font-semibold uppercase tracking-wider text-[color:var(--app-text-muted)]",
  tbody: "divide-y divide-[color:var(--app-hairline)]",
  tr: "transition-colors hover:bg-[var(--app-hairline)]",
  td: "px-4 py-3 align-top text-[14px] text-[color:var(--app-text)]",
  tdMuted: "px-4 py-3 align-top text-[14px] text-[color:var(--app-text-muted)]",
  sortButton: `inline-flex items-center gap-1 rounded uppercase tracking-wider text-[12.5px] font-semibold transition-colors hover:text-[color:var(--app-text)] ${FOCUS}`,
  tableFoot:
    "flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--app-hairline)] px-4 py-3 text-[13.5px] text-[color:var(--app-text-muted)]",
} as const;
