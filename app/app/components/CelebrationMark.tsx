// A celebration's mark (lib/celebrations.ts celebrationIcon): hands clapping
// for a cheer, a handshake for an offer of help, coins for a backing, a gift
// for a gift, a trophy for an award. The canvas card and the phone's card
// both draw it, so each kind looks the same wherever it shows.

import { Gift, HandCoins, HandsClapping, Handshake, Trophy, type Icon } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import type { CelebrationIcon } from "../lib/celebrations";

const ICONS: Record<CelebrationIcon, Icon> = {
  clap: HandsClapping,
  handshake: Handshake,
  coins: HandCoins,
  gift: Gift,
  trophy: Trophy,
};

export function CelebrationMark({ icon, size, color, style }: { icon: CelebrationIcon; size: number; color: string; style?: CSSProperties }) {
  const Mark = ICONS[icon];
  return <Mark aria-hidden size={size} weight="fill" color={color} style={style} />;
}
