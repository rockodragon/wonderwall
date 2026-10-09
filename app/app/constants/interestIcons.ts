// One icon per interest, beside the list in interests.ts (Rick, 2026-10-09:
// "those interests could be better with some icons in the badges"). Literal
// and plain: the tool or thing the craft is made with. No religious symbols,
// no emoji. Its own file so the strings in interests.ts stay free of the icon
// library, for the modules that only need the words.
//
// Draw them at one weight and size, aria-hidden, before the label:
//   const Icon = interestIcon(interest);
//   <Icon size={16} weight="regular" aria-hidden />

import {
  Briefcase,
  Camera,
  ChalkboardTeacher,
  Code,
  Cpu,
  Cube,
  DotsThree,
  Faders,
  Feather,
  FilmSlate,
  FilmStrip,
  Flag,
  HandHeart,
  Images,
  MaskHappy,
  Megaphone,
  Microphone,
  MusicNotes,
  PaintBrush,
  PenNib,
  PencilLine,
  PencilRuler,
  PersonSimpleTaiChi,
  Rocket,
  Scissors,
  Tag,
  UsersThree,
  VideoCamera,
  Waveform,
  type Icon,
} from "@phosphor-icons/react";
import type { Interest } from "./interests";

export const INTEREST_ICONS: Record<Interest, Icon> = {
  Design: PencilRuler,
  Illustration: PenNib,
  Animation: FilmStrip,
  Photography: Camera,
  Videography: VideoCamera,
  Filmmaking: FilmSlate,
  Writing: PencilLine,
  Poetry: Feather,
  Art: PaintBrush,
  Craft: Scissors,
  Music: MusicNotes,
  "Dance & Movement": PersonSimpleTaiChi,
  Acting: MaskHappy,
  // A group singing together, not a symbol of any faith.
  Worship: UsersThree,
  Production: Faders,
  Audio: Waveform,
  Technology: Cpu,
  Software: Code,
  Product: Cube,
  "Content Creation": Images,
  Ministry: HandHeart,
  Leadership: Flag,
  Teaching: ChalkboardTeacher,
  "Public Speaking": Microphone,
  Entrepreneurship: Rocket,
  Business: Briefcase,
  Marketing: Megaphone,
  Other: DotsThree,
};

/** For an interest the map doesn't know yet (a new one added to the list
 *  before its icon, or an old value stored on a profile). */
export const FALLBACK_INTEREST_ICON: Icon = Tag;

export function interestIcon(interest: string): Icon {
  return (INTEREST_ICONS as Partial<Record<string, Icon>>)[interest] ?? FALLBACK_INTEREST_ICON;
}
