// /garden/events — the old public upcoming list. /events is public now and
// shows the same data (api.events.list), so this sends everyone there, keeping
// a ?community= link. Old shared links keep working; the nav's signed-out
// address (garden/ui.tsx NAV_ITEMS publicTo) still lands here and is forwarded.

import { redirect } from "react-router";
import type { Route } from "./+types/events_.garden._index";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const community = new URL(request.url).searchParams.get("community");
  throw redirect(community ? `/events?community=${encodeURIComponent(community)}` : "/events");
}

export default function OldGardenEventsRedirect() {
  return null;
}
