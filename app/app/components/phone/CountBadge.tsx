// The red count on a Messages icon: unread messages and notifications
// together (2026-08-30). One chip, drawn in the corner of whatever wraps it
// (which must be `relative`): Today's corner on a phone, the sidebar's
// account row with the palette off. Nothing at zero.

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-2 -right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
