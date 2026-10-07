// "Ana, Ben and 4 others are going", with their faces, on an opened event
// card (goingPreview.ts has the rules). It links to the event's Who's going
// tab. Until the list is in it shows the card's own count, so the row
// doesn't jump; signed out, the list has no names and the count stays.

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { initialsOf } from "../lib/initials";
import { goingPreview } from "./goingPreview";
import { DESK, FOCUS_RING_CLASS } from "./tokens";

const FACE = 28;

export function GoingLine({ eventId, fallback }: { eventId: string; fallback: string | null }) {
  const attendees = useQuery(api.events.getAttendees, { eventId: eventId as Id<"events"> });
  // The same subscriptions the canvas already holds (useDeskData), so these
  // cost nothing extra.
  const favorites = useQuery(api.favorites.getMyFavorites, {});
  const me = useQuery(api.profiles.getMyProfile);

  const preview = useMemo(() => {
    if (!attendees) return null;
    const followed = new Set((favorites?.profiles ?? []).flatMap((f) => (f ? [String(f.profile._id)] : [])));
    return goingPreview(
      attendees.map((a) => ({
        key: a.key,
        userId: a.userId ? String(a.userId) : null,
        profileId: a.profileId ? String(a.profileId) : null,
        name: a.name,
        imageUrl: a.imageUrl,
        joinedAt: a.joinedAt,
        extraTickets: a.extraTickets,
      })),
      me?.userId ? String(me.userId) : null,
      followed,
    );
  }, [attendees, favorites, me]);

  const line = preview ? preview.line : fallback;
  if (!line) return null;
  const faces = preview?.faces.filter((p) => p.userId) ?? [];

  return (
    <Link
      to={`/events/${eventId}?tab=going`}
      className={`flex items-center gap-2.5 rounded-full underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`}
      style={{ fontSize: 15, color: DESK.textSoft }}
    >
      {faces.length > 0 && (
        <span className="flex" aria-hidden>
          {faces.map((p, i) => (
            <span
              key={p.key}
              className="flex items-center justify-center overflow-hidden rounded-full"
              style={{
                width: FACE,
                height: FACE,
                marginLeft: i === 0 ? 0 : -8,
                boxShadow: `0 0 0 2px ${DESK.panel}`,
                background: DESK.hover,
                color: DESK.textSoft,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initialsOf(p.name)
              )}
            </span>
          ))}
        </span>
      )}
      <span>{line}</span>
    </Link>
  );
}
