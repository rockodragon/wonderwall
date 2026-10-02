// Covers for projects with no photo: flat shapes in a muted palette —
// charcoal grounds, a dull amber and a bone white. Picked from the project
// id so a project keeps the same cover everywhere. Deliberately plain
// geometry (rings, bands, a split field, blocks): it has to read as "no
// picture yet," never as someone's artwork.
const COVER_GROUNDS = ["#1c1c19", "#23231f", "#2a2926"];
const COVER_AMBER = "#9c8456";
const COVER_BONE = "#cfcabd";

export function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export function AbstractCover({ seed }: { seed: string }) {
  const h = hashSeed(seed);
  const ground = COVER_GROUNDS[h % COVER_GROUNDS.length];
  const shade = COVER_GROUNDS[(h + 1) % COVER_GROUNDS.length];
  const variant = (h >>> 3) % 4;
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      <rect width="160" height="100" fill={ground} />
      {variant === 0 && (
        <g fill="none">
          <circle cx="80" cy="50" r="34" stroke={shade} strokeWidth="10" />
          <circle cx="80" cy="50" r="18" stroke={COVER_AMBER} strokeWidth="1.5" opacity="0.7" />
          <circle cx="80" cy="50" r="5" fill={COVER_BONE} opacity="0.5" />
        </g>
      )}
      {variant === 1 && (
        <g>
          <path d="M0 64 C40 52 80 76 160 58 V100 H0 Z" fill={shade} />
          <path d="M0 76 C50 66 100 88 160 72 V100 H0 Z" fill={COVER_AMBER} opacity="0.45" />
          <path d="M0 88 C50 80 110 98 160 86 V100 H0 Z" fill={COVER_BONE} opacity="0.35" />
          <circle cx="122" cy="26" r="8" fill={COVER_BONE} opacity="0.4" />
        </g>
      )}
      {variant === 2 && (
        <g>
          <path d="M0 100 L80 10 L160 100 Z" fill={shade} />
          <path d="M0 100 L0 58 L34 100 Z" fill={COVER_AMBER} opacity="0.5" />
          <path d="M160 100 L160 64 L130 100 Z" fill={COVER_BONE} opacity="0.35" />
        </g>
      )}
      {variant === 3 && (
        <g>
          <rect x="22" y="18" width="52" height="64" fill={shade} />
          <rect x="30" y="26" width="36" height="22" fill={COVER_AMBER} opacity="0.5" />
          <rect x="86" y="18" width="52" height="30" fill={shade} />
          <path d="M86 58h52M86 66h40M86 74h46" stroke={COVER_BONE} strokeWidth="2" opacity="0.35" />
        </g>
      )}
    </svg>
  );
}
