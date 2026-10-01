// An organization's logo. Square with rounded corners — people are circles
// everywhere in the app, so the shape alone says "organization". No logo:
// the first letter on the raised hairline, like a profile with no photo.

const SIZES = {
  sm: "w-10 h-10 rounded-lg text-base",
  md: "w-14 h-14 rounded-xl text-xl",
  lg: "w-20 h-20 sm:w-24 sm:h-24 rounded-2xl text-2xl sm:text-3xl",
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
      className={`${SIZES[size]} shrink-0 overflow-hidden flex items-center justify-center border`}
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
