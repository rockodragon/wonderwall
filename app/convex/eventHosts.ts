// Who counts as a host of an event. Pure and server-free so the frontend and
// tests can import it (no `_generated/server` here).

export const MAX_CO_HOSTS = 10;

/** Organizer or a listed co-host. Ids compared as strings so Id<"users">
 * and plain strings both work. */
export function isEventHost(
  event: { organizerId: unknown; coHostIds?: readonly unknown[] | null },
  userId: unknown,
): boolean {
  if (userId === null || userId === undefined || userId === "") return false;
  const id = String(userId);
  if (String(event.organizerId) === id) return true;
  return (event.coHostIds ?? []).some((c) => String(c) === id);
}

export type CoHostChange =
  | { ok: true; coHostIds: string[] }
  | { ok: false; reason: "is_organizer" | "duplicate" | "full" | "not_a_co_host" };

/** Pure rule for adding a co-host: not the organizer, no duplicates, max 10. */
export function planAddCoHost(
  event: { organizerId: unknown; coHostIds?: readonly unknown[] | null },
  userId: string,
): CoHostChange {
  const current = (event.coHostIds ?? []).map(String);
  if (String(event.organizerId) === userId) return { ok: false, reason: "is_organizer" };
  if (current.includes(userId)) return { ok: false, reason: "duplicate" };
  if (current.length >= MAX_CO_HOSTS) return { ok: false, reason: "full" };
  return { ok: true, coHostIds: [...current, userId] };
}

export function planRemoveCoHost(
  event: { coHostIds?: readonly unknown[] | null },
  userId: string,
): CoHostChange {
  const current = (event.coHostIds ?? []).map(String);
  if (!current.includes(userId)) return { ok: false, reason: "not_a_co_host" };
  return { ok: true, coHostIds: current.filter((c) => c !== userId) };
}
