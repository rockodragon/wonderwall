import { describe, expect, it } from "vitest";
import { shiftEndTime } from "./shiftEndTime";

describe("shiftEndTime", () => {
  it("keeps the length when the start moves", () => {
    expect(shiftEndTime("15:00", "16:30", "16:00")).toBe("17:30");
    expect(shiftEndTime("19:00", "18:15", "21:00")).toBe("20:15");
  });

  it("leaves a blank end, or a blank start, alone", () => {
    expect(shiftEndTime("15:00", "16:00", "")).toBe("");
    expect(shiftEndTime("", "16:00", "17:00")).toBe("17:00");
    expect(shiftEndTime("15:00", "", "17:00")).toBe("17:00");
  });

  it("stops an event's end at 23:59", () => {
    expect(shiftEndTime("20:00", "22:30", "23:00")).toBe("23:59");
  });

  it("leaves an event's end alone when it had no length to keep", () => {
    expect(shiftEndTime("15:00", "16:00", "14:00")).toBe("14:00");
  });

  it("lets a gig's end pass midnight", () => {
    // An end before the start already meant the next day.
    expect(shiftEndTime("22:00", "21:00", "01:00", { overnight: true })).toBe("00:00");
    expect(shiftEndTime("21:00", "23:00", "23:30", { overnight: true })).toBe("01:30");
  });
});
