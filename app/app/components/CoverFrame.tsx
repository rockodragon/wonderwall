// A cover in the 4:5 portrait shape (docs/features/cover-4x5.md). New covers
// are saved 4:5 and fill it; anything else — an old wide cover, a flyer kept
// whole — shows whole over a blurred copy of itself (ImageFill), never
// cropped. Children sit on top: chips, an owner's button. `square` is a
// list's picture (Today's open projects on a phone): cropped to fill the
// square, the way Instagram's grid crops and its post shows the whole thing
// (Rick, 2026-10-27: crop in the list, whole on the detail page).

import type { ReactNode } from "react";
import { ImageFill } from "./ImageFill";

export function CoverFrame({
  src,
  alt,
  className = "",
  square = false,
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  square?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`relative ${square ? "aspect-square" : "aspect-[4/5]"} overflow-hidden ${className}`}>
      {square ? (
        <img src={src} alt={alt} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <ImageFill src={src} alt={alt} />
      )}
      {children}
    </div>
  );
}
