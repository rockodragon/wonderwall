// A cover in the 4:5 portrait shape (docs/features/cover-4x5.md). New covers
// are saved 4:5 and fill it; anything else — an old wide cover, a flyer kept
// whole — shows whole over a blurred copy of itself (ImageFill), never
// cropped. Children sit on top: chips, an owner's button.

import type { ReactNode } from "react";
import { ImageFill } from "./ImageFill";

export function CoverFrame({
  src,
  alt,
  className = "",
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`relative aspect-[4/5] overflow-hidden ${className}`}>
      <ImageFill src={src} alt={alt} />
      {children}
    </div>
  );
}
