/** The cover a project without a photo gets. Lighter than the card around
 * it, with a faint hairline texture, so an empty cover reads as a surface
 * rather than a hole with a "missing image" icon in it. Neutral on purpose:
 * citron is for actions and chip-scale badges, never large fills. */
export const EMPTY_COVER = {
  backgroundColor: "var(--garden-hairline-raised)",
  backgroundImage:
    "repeating-linear-gradient(135deg, rgba(247,247,244,0.05) 0 1px, transparent 1px 11px)",
};
