// /garden/events/:id — the old guest-facing event page. It didn't know about
// tickets (it showed paid events as "Free" and took free RSVPs for them), so
// it now sends everyone to /events/:id, which is public and has the ticket
// card, the Stripe link and the guest RSVP. Old shared links keep working.

import { redirect } from "react-router";
import type { Route } from "./+types/events_.garden.$id";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  throw redirect(`/events/${params.id}`);
}

export default function OldGardenEventRedirect() {
  return null;
}
