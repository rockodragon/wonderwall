// An organization's logo. Square with rounded corners, like a person's photo
// on a profile page (PersonAvatar's tile); in the directory it fills the
// strip down the card's edge (`fill`), as a person's photo does. No logo:
// the first letter on the raised hairline, like a profile with no photo.

const SIZES = {
  xs: "w-6 h-6 rounded-md border text-xs",
  sm: "w-10 h-10 rounded-lg border text-base",
  md: "w-14 h-14 rounded-xl border text-xl",
  lg: "w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border text-2xl sm:text-3xl",
  // As big as its box, no corners or edge of its own: a directory card's strip.
  fill: "w-full h-full text-2xl",
} as const;

export function OrgLogo({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl?: string | null;
  size?: keyof typeof SIZES;
}) {
  return (
    <div
      className={`${SIZES[size]} shrink-0 overflow-hidden flex items-center justify-center`}
      style={{ backgroundColor: "var(--app-hairline-raised)", borderColor: "var(--app-hairline)" }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
