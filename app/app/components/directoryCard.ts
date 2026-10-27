// The People directory's cards (routes/search.tsx) and the Organizations
// tab's (components/OrgDirectory.tsx): one height, and a photo or logo that
// runs to the card's left edge, top to bottom, with the card's own corners
// rounding it (Rick, 2026-10-27: the inset faces were too small).

/** Every card this tall, so a row of four never has one taller than the rest. */
export const DIRECTORY_CARD_MIN_H = "min-h-[5.625rem]";

/** The card itself: no padding of its own, so the picture reaches its edge. */
export const DIRECTORY_CARD = `group flex ${DIRECTORY_CARD_MIN_H} items-stretch overflow-hidden rounded-xl border transition-colors min-w-0 hover:border-[var(--app-accent)]`;

/** The strip the picture fills: as wide as the card is tall, the full height. */
export const DIRECTORY_CARD_PICTURE = "w-[5.625rem] shrink-0";

/** The words beside it, inset. */
export const DIRECTORY_CARD_WORDS = "min-w-0 flex-1 flex flex-col justify-center px-4 py-3";
