// A picture shown whole in a frame of a different shape — a 3:1 banner on a
// 16:10 card, a tall flyer in a square — without black bars: a blurred,
// enlarged copy of the same image fills the frame behind it. Nothing is
// cropped (Rick, 2026-10-01: posters shown whole; a wide banner looked tiny
// in a black box). The parent must be `relative overflow-hidden` and sized.
// Same URL twice, so the browser fetches it once.

export function ImageFill({ src, alt }: { src: string; alt: string }) {
  return (
    <>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-70"
      />
      <img src={src} alt={alt} className="relative w-full h-full object-contain" />
    </>
  );
}
