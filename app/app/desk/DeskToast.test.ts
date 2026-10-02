import { describe, expect, it } from "vitest";
import { SHOW_MS, toastTimeLeft, type Toast } from "./DeskToast";

const AT = new Date(2026, 9, 2, 12).getTime();
const toast: Toast = { id: 1, text: "Removed from your shortlist.", at: AT };

describe("toastTimeLeft", () => {
  it("is the whole show time as it goes up", () => {
    expect(toastTimeLeft(toast, AT)).toBe(SHOW_MS);
  });

  it("is what's left for a desk that mounts while it's still up", () => {
    expect(toastTimeLeft(toast, AT + 1000)).toBe(SHOW_MS - 1000);
    expect(toastTimeLeft(toast, AT + SHOW_MS - 1)).toBe(1);
  });

  it("is nothing once its time is spent: a desk mounting later doesn't say it again", () => {
    expect(toastTimeLeft(toast, AT + SHOW_MS)).toBe(0);
    expect(toastTimeLeft(toast, AT + 60 * 60 * 1000)).toBe(0);
  });
});
