import { describe, expect, it } from "vitest";
import { tableEventInput } from "./eventInput";
const input = {
  title: "Studio gathering",
  date: "2026-10-20T18:00",
  duration: "90",
  location: "Pasadena",
  locationType: "in_person" as const,
};
const now = new Date("2026-10-03T12:00").getTime();
describe("creation and added Events share the canonical occurrence input", () => {
  it("converts the form's in-person label to a supported canonical venue", () => {
    const event = tableEventInput(input, now);
    expect(event.locationType).toBe("venue");
    expect(event.endTime - event.datetime).toBe(90 * 60_000);
    expect(event.location).toBe("Pasadena");
  });
  it("retains an online location without manufacturing a secret meeting link", () => {
    const event = tableEventInput(
      { ...input, locationType: "online", location: "" },
      now,
    );
    expect(event.locationType).toBe("online");
    expect(event.location).toBeUndefined();
    expect(event).not.toHaveProperty("meetingUrl");
  });
  it.each([
    { date: "" },
    { date: "2026-10-01T12:00" },
    { duration: "0" },
    { duration: "-20" },
    { duration: "bogus" },
    { duration: "1500" },
  ])("rejects unusable occurrence input %j", (change) => {
    expect(() => tableEventInput({ ...input, ...change }, now)).toThrow(
      "Choose a future date",
    );
  });
});
