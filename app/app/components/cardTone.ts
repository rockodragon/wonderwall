// The two looks a card on the home screen takes: the Canvas's own tokens
// (desk/tokens.ts) on a desktop, the page's --app-* variables on a phone's
// Today. The invite nudge (InviteNudge.tsx) and the Share a project card
// (ShareProjectCard.tsx) both draw with it.

import { DESK } from "../desk/tokens";

export type CardTone = "desk" | "page";

export type CardColors = { text: string; soft: string; line: string; bg: string; accent: string };

export const CARD_TONE: Record<CardTone, CardColors> = {
  desk: { text: DESK.text, soft: DESK.textSoft, line: DESK.line, bg: DESK.panel, accent: DESK.accent },
  page: {
    text: "var(--app-text)",
    soft: "var(--app-text-muted)",
    line: "var(--app-hairline-raised)",
    bg: "var(--app-surface-raised)",
    accent: "var(--app-accent-ink)",
  },
};
