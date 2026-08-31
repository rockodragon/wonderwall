// "Add to calendar" for events — net-new (docs/gated-event-video-prd.md,
// "Calendar invite"; verified: there was no .ics, no VCALENDAR, and no
// calendar code anywhere in app/ or convex/ before this).
//
// Generated entirely client-side from fields the event page already has. No
// new infrastructure, no server round trip, works in every calendar client:
// a Google Calendar template URL for the common case, a downloadable .ics
// for everyone else.
//
// The one load-bearing rule: DESCRIPTION carries the /j/{eventId} proxy
// link, never the real meeting URL. A calendar entry is written once and
// lives for weeks; the meeting URL is not stable (repasted the day before,
// changed, or later a per-user token that cannot exist ahead of time). The
// proxy is the entire point — see functions/j/[id].ts.

/** Hardcoded rather than window.location.origin on purpose: this URL is
 * copied into somebody's calendar and outlives the session that made it, so
 * it must be the canonical host and never a preview deployment's. */
export const SITE_ORIGIN = "https://creatives.exchange";

/** Events carry a start `datetime` and no end — the schema has no duration
 * field. One hour is the assumption; the invite is a reminder with a join
 * link, not a scheduling contract. */
export const DEFAULT_DURATION_MINUTES = 60;

export interface CalendarEventInput {
  eventId: string;
  title: string;
  description?: string;
  /** Start, epoch ms. */
  datetime: number;
  durationMinutes?: number;
  location?: string;
  /** events.updatedAt — drives ICS SEQUENCE so a re-send supersedes. */
  updatedAt?: number;
  cancelled?: boolean;
}

export function joinProxyUrl(eventId: string): string {
  return `${SITE_ORIGIN}/j/${eventId}`;
}

export function eventPageUrl(eventId: string): string {
  // /garden/events/:id is the guest-facing event page. /events/:id lives
  // inside the _app.tsx layout, which sends unauthenticated visitors to
  // /login (routes/_app.tsx:42) — and a calendar invite is precisely the
  // thing a guest with no account receives (eventRsvps.userId is
  // optional). Keep this in sync with functions/j/[id].ts's fallback.
  return `${SITE_ORIGIN}/garden/events/${eventId}`;
}

/** `20260906T183000Z` — the only date form every calendar client agrees on. */
export function formatIcsUtc(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** RFC 5545 §3.3.11 TEXT escaping. Order matters — backslash first. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** RFC 5545 §3.1: content lines fold at 75 octets, continuations begin with
 * a space. Counted in UTF-8 bytes, and never split mid-character. */
export function foldIcsLine(line: string): string {
  const LIMIT = 75;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    // Continuation lines spend one octet on the leading space.
    const limit = out.length === 0 ? LIMIT : LIMIT - 1;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

function calendarDescription(input: CalendarEventInput): string {
  const parts: string[] = [];
  const body = (input.description ?? "").trim();
  if (body) parts.push(body);
  parts.push(`Join: ${joinProxyUrl(input.eventId)}`);
  parts.push(`Event page: ${eventPageUrl(input.eventId)}`);
  return parts.join("\n\n");
}

function endTime(input: CalendarEventInput): number {
  const minutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  return input.datetime + minutes * 60_000;
}

/** SEQUENCE must increase for a client to accept an update to an existing
 * UID. Minutes since 2020-01-01 is monotonic in updatedAt and stays well
 * inside the 32-bit integer clients expect. */
function icsSequence(updatedAt?: number): number {
  if (!updatedAt) return 0;
  const epoch2020 = Date.UTC(2020, 0, 1);
  return Math.max(0, Math.floor((updatedAt - epoch2020) / 60_000));
}

/**
 * A complete VCALENDAR for one event.
 *
 * UID is `event-{eventId}@creatives.exchange` and never changes, so a
 * re-sent invite updates the entry already in someone's calendar instead of
 * duplicating it.
 */
export function buildIcs(input: CalendarEventInput, now: number = Date.now()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//creatives.exchange//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${input.eventId}@creatives.exchange`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(input.datetime)}`,
    `DTEND:${formatIcsUtc(endTime(input))}`,
    `SEQUENCE:${icsSequence(input.updatedAt)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `DESCRIPTION:${escapeIcsText(calendarDescription(input))}`,
    `URL:${escapeIcsText(eventPageUrl(input.eventId))}`,
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    `STATUS:${input.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // CRLF throughout, plus a trailing one — Outlook is strict about both.
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** Google's public "create event" template — no API key, no OAuth. */
export function buildGoogleCalendarUrl(input: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${formatIcsUtc(input.datetime)}/${formatIcsUtc(endTime(input))}`,
    details: calendarDescription(input),
  });
  if (input.location) params.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Filename for the downloaded .ics. */
export function icsFileName(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "event";
  return `${slug}.ics`;
}
