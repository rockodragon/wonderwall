import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { AnnouncementComposer, reminderLine } from "./AnnouncementComposer";

vi.mock("convex/react", () => ({
  useQuery: () => [],
  useMutation: () => vi.fn(),
}));

// Read in Los Angeles, as the hosts are; put back after.
const zone = process.env.TZ;
beforeAll(() => { process.env.TZ = "America/Los_Angeles"; });
afterAll(() => { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; });

const HOUR = 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 7, 2); // Fri Nov 6, 6:00 PM Pacific

describe("reminderLine", () => {
  it("names both times while both are ahead", () => {
    expect(reminderLine(START, START - 48 * HOUR)).toBe("Reminders go out around Thu, Nov 5, 6:00 PM and Fri, Nov 6, 4:00 PM.");
  });
  it("names the one left after the day-before one has gone", () => {
    expect(reminderLine(START, START - 10 * HOUR, [START - 24 * HOUR])).toBe("A reminder goes out around Fri, Nov 6, 4:00 PM.");
  });
  it("says one is about to go for an event posted less than a day ahead", () => {
    expect(reminderLine(START, START - 10 * HOUR)).toBe("Reminders go out in the next 15 minutes and around Fri, Nov 6, 4:00 PM.");
  });
  it("says nothing once both have gone, or with no start", () => {
    expect(reminderLine(START, START - HOUR, [START - 24 * HOUR, START - 2 * HOUR])).toBeNull();
    expect(reminderLine(undefined, START)).toBeNull();
  });
});

describe("AnnouncementComposer", () => {
  it("shows the host when reminders go out, under Message attendees", () => {
    vi.useFakeTimers();
    vi.setSystemTime(START - 48 * HOUR);
    const html = renderToString(<AnnouncementComposer targetType="event" targetId="events:a" heading="Message attendees" startsAt={START} />);
    vi.useRealTimers();
    expect(html).toContain("Message attendees");
    expect(html).toContain("Reminders go out around Thu, Nov 5, 6:00 PM and Fri, Nov 6, 4:00 PM.");
  });
  it("shows no reminder line for a project", () => {
    const html = renderToString(<AnnouncementComposer targetType="project" targetId="projects:a" heading="Message team and supporters" />);
    expect(html).not.toContain("Reminder");
  });
});
