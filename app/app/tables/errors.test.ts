import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { tableEventInput } from "./eventInput";
import { TableInputError, tableErrorMessage } from "./errors";

const FALLBACK = "We couldn't save the date. Please try again.";

describe("tableErrorMessage", () => {
  it("shows a check in the browser in its own words", () => {
    let thrown: unknown;
    try {
      tableEventInput(
        { title: "x", date: "", duration: "90", location: "", locationType: "online" },
        Date.now(),
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(TableInputError);
    expect(tableErrorMessage(thrown, FALLBACK)).toMatch(/^Choose a future date/);
  });

  it("shows the server's reason when there is one", () => {
    expect(tableErrorMessage(new ConvexError({ code: "full", reason: "This Table is full." }), FALLBACK)).toBe(
      "This Table is full.",
    );
  });

  // Production hands the page "[CONVEX M(...)] [Request ID: …] Server Error"
  // as the message of a server error; that never reaches the person.
  it("falls back instead of showing a server error's raw message", () => {
    expect(tableErrorMessage(new ConvexError({ code: "full" }), FALLBACK)).toBe(FALLBACK);
    expect(tableErrorMessage(new Error("[CONVEX M(garden/tables:addDate)] Server Error"), FALLBACK)).toBe(FALLBACK);
  });
});
