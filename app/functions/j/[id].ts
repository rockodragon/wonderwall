// The join proxy — /j/{eventId} (docs/gated-event-video-prd.md, "The join
// proxy"). A calendar invite is written once and sits in someone's calendar
// for weeks; the real meeting URL is not stable (the organizer often pastes
// it the day before, changes it, or later it becomes a per-user LiveKit
// token that cannot exist ahead of time). So invites carry this permanent
// URL and only the server-side redirect target ever changes. That is what
// makes the LiveKit migration non-breaking: every invite already sitting in
// an attendee's calendar keeps working.
//
// Shape follows functions/events/[id].ts — the working, deployed precedent:
// a Cloudflare Pages Function that queries Convex over plain HTTP POST to
// /api/query. No WebSocket (incompatible with Workers), no SSR.
//
// It resolves via eventVideo:getPublicJoinTarget, which answers only for a
// live PUBLIC event. The proxy has no user session, so it cannot resolve a
// role — a paid event's link is therefore never resolvable here; it falls
// through to the event page, which does the entitlement check.
//
// This is a *stable* link, not a *secret* one: /j/{eventId} is guessable
// from the public event ID, so for a free event it grants exactly what the
// event page already grants. Do not describe it as security.

interface Env {
  CONVEX_URL?: string;
}

const CONVEX_URL = "https://courteous-rabbit-750.convex.cloud";

/** Never a 404. Every failure lands on the event page, which explains
 * whatever the actual situation is (PRD "The join proxy" behavior table). */
function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      // The organizer can repaste the link minutes before the session —
      // a cached redirect would strand everyone on the old target.
      "Cache-Control": "no-store, no-cache, must-revalidate",
      // Don't hand the meeting host a referrer naming the event.
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function fetchJoinTarget(
  convexUrl: string,
  eventId: string,
): Promise<string | null> {
  const res = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "eventVideo:getPublicJoinTarget",
      args: { eventId },
      format: "json",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status?: string;
    value?: { meetingUrl?: string } | null;
  };
  if (data?.status !== "success") return null;
  const url = data?.value?.meetingUrl;
  if (typeof url !== "string") return null;
  // The mutation already rejects non-http(s), but the redirect target is the
  // last place to be trusting about it.
  return /^https?:\/\//i.test(url) ? url : null;
}

const handle = async (context: {
  request: Request;
  params: { id: string | string[] };
  env: Env;
}): Promise<Response> => {
  const { request, params, env } = context;

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const eventId = rawId ?? "";
  const fallback = new URL(
    `/events/${encodeURIComponent(eventId)}`,
    request.url,
  ).toString();

  if (!eventId) return redirect(fallback);

  try {
    const target = await fetchJoinTarget(env.CONVEX_URL ?? CONVEX_URL, eventId);
    if (target) return redirect(target);
  } catch {
    // Convex unreachable, malformed response, anything — the event page is
    // always a correct answer, so there is nothing to report to the visitor.
  }

  // No meetingUrl set yet, event cancelled, paid event, unknown id, or a
  // failure above. All four land here.
  return redirect(fallback);
};

export const onRequestGet = handle;
// Link scanners, calendar clients and unfurlers HEAD this URL before anyone
// clicks it. Without this, Pages falls through to the SPA fallback and a HEAD
// returns 200 text/html — which looks, to anything checking, like the redirect
// doesn't exist. A body-less 302 is the correct HEAD response anyway.
export const onRequestHead = handle;
