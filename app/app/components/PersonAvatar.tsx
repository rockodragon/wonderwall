/** Small reusable person portrait with a readable fallback for profiles without a photo. */
export function PersonAvatar({
  name,
  imageUrl,
  size = "md",
  className = "",
}: {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const dimensions = size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-sm";
  const initial = name.trim().charAt(0).toUpperCase() || "·";
  const style = {
    backgroundColor: "var(--app-accent-wash)",
    color: "var(--app-text)",
  };
  return imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      className={`${dimensions} shrink-0 rounded-full object-cover ${className}`}
    />
  ) : (
    <span
      aria-label={name}
      className={`${dimensions} flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}
      style={style}
    >
      {initial}
    </span>
  );
}
