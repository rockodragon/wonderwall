import { describe, expect, it } from "vitest";
import { formatCents, formatDollars } from "./money";

describe("formatCents", () => {
  it("writes whole dollars bare", () => {
    expect(formatCents(500)).toBe("$5");
    expect(formatCents(50000)).toBe("$500");
    expect(formatCents(150000)).toBe("$1,500");
    expect(formatCents(0)).toBe("$0");
  });

  it("shows both cent digits when there are cents", () => {
    expect(formatCents(1250)).toBe("$12.50");
    expect(formatCents(2550)).toBe("$25.50");
    expect(formatCents(150050)).toBe("$1,500.50");
    expect(formatCents(1)).toBe("$0.01");
  });
});

describe("formatDollars", () => {
  it("follows the same rule for dollar amounts", () => {
    expect(formatDollars(500)).toBe("$500");
    expect(formatDollars(12.5)).toBe("$12.50");
    expect(formatDollars(3.4)).toBe("$3.40");
    expect(formatDollars(1234567)).toBe("$1,234,567");
  });
});
