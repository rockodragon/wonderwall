import { describe, expect, it } from "vitest";
import {
  buildGoogleCalendarUrl,
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  icsFileName,
  type CalendarEventInput,
} from "./eventCalendar";

const base: CalendarEventInput = {
  eventId: "k1739abcdefghijklmnopqrstu",
  title: "Citywide gathering",
  description: "An open panel; anyone can drop in.",
  datetime: Date.UTC(2026, 8, 6, 18, 30, 0), // 2026-09-06T18:30:00Z
  location: "Grove, San Diego, CA",
};

describe("formatIcsUtc", () => {
  it("emits the UTC basic format every calendar client accepts", () => {
    expect(formatIcsUtc(base.datetime)).toBe("20260906T183000Z");
  });
});

describe("escapeIcsText", () => {
  it("escapes backslash before the characters that gain one", () => {
    expect(escapeIcsText("a\\b;c,d")).toBe("a\\\\b\\;c\\,d");
  });
  it("collapses every newline form to the literal \\n", () => {
    expect(escapeIcsText("a\r\nb\nc\rd")).toBe("a\\nb\\nc\\nd");
  });
});

describe("foldIcsLine", () => {
  it("leaves a short line alone", () => {
    expect(foldIcsLine("VERSION:2.0")).toBe("VERSION:2.0");
  });
  it("folds past 75 octets with a leading space on continuations", () => {
    const folded = foldIcsLine("X:" + "a".repeat(200));
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBe(75);
    for (const part of parts.slice(1)) expect(part.startsWith(" ")).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(
      "X:" + "a".repeat(200),
    );
  });
});

/** What a calendar client sees: continuation lines rejoined (RFC 5545 §3.1). */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("buildIcs", () => {
  const ics = buildIcs(base, Date.UTC(2026, 7, 31, 12, 0, 0));

  it("uses the stable UID so a re-send updates instead of duplicating", () => {
    expect(ics).toContain(`UID:event-${base.eventId}@creatives.exchange`);
  });

  it("puts the /j/ proxy link in DESCRIPTION, not a meeting URL", () => {
    expect(unfold(ics)).toContain(
      `https://creatives.exchange/j/${base.eventId}`,
    );
    expect(ics).not.toContain("zoom.us");
    expect(ics).not.toContain("youtube.com");
  });

  it("points at the public /events/:id page, never the /garden/ one", () => {
    // /events/:id is registered outside the auth-gated _app.tsx layout
    // (routes.ts) precisely so the guest holding this invite can open it.
    expect(unfold(ics)).toContain(
      `URL:https://creatives.exchange/events/${base.eventId}`,
    );
    expect(ics).not.toContain("/garden/events/");
  });

  it("defaults to a one-hour block", () => {
    expect(ics).toContain("DTSTART:20260906T183000Z");
    expect(ics).toContain("DTEND:20260906T193000Z");
  });

  it("uses CRLF line breaks and terminates the file", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("raises SEQUENCE with updatedAt so an update supersedes", () => {
    const first = buildIcs({ ...base, updatedAt: Date.UTC(2026, 7, 1) });
    const second = buildIcs({ ...base, updatedAt: Date.UTC(2026, 7, 2) });
    const seq = (s: string) => Number(/SEQUENCE:(\d+)/.exec(s)![1]);
    expect(seq(second)).toBeGreaterThan(seq(first));
    expect(seq(second)).toBeLessThan(2 ** 31 - 1);
  });

  it("marks a cancelled event cancelled", () => {
    expect(buildIcs({ ...base, cancelled: true })).toContain("STATUS:CANCELLED");
  });
});

describe("buildGoogleCalendarUrl", () => {
  const url = buildGoogleCalendarUrl(base);

  it("is a template link with a start/end range", () => {
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(
      true,
    );
    expect(new URL(url).searchParams.get("dates")).toBe(
      "20260906T183000Z/20260906T193000Z",
    );
  });

  it("carries the proxy link in the details", () => {
    expect(new URL(url).searchParams.get("details")).toContain(
      `https://creatives.exchange/j/${base.eventId}`,
    );
  });
});

describe("icsFileName", () => {
  it("slugifies, and never produces a bare extension", () => {
    expect(icsFileName("Citywide Gathering!")).toBe("citywide-gathering.ics");
    expect(icsFileName("!!!")).toBe("event.ics");
  });
});
