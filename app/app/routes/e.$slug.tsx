// /e/:slug — an event's short address. Sends the visitor to /events/:id, the
// public event page; an address nobody has goes to the events list.

import { useQuery } from "convex/react";
import { Navigate, useParams } from "react-router";
import { api } from "../../convex/_generated/api";

export default function EventShortAddress() {
  const { slug = "" } = useParams();
  const eventId = useQuery(api.eventSlug.idForSlug, { slug });
  if (eventId === undefined) return null;
  return <Navigate to={eventId ? `/events/${eventId}` : "/events"} replace />;
}
