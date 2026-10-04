import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import {
  PHONE_NOTE_TITLE,
  PhoneNavName,
  PhoneNavNoteCard,
  nameRow,
  nameRows,
  namesReach,
} from "./PhoneNavNote";

describe("the phone bar's names", () => {
  it("uses one row while there's room, three on a full bar", () => {
    expect(nameRows(4)).toBe(1); // signed out
    expect(nameRows(6)).toBe(2);
    expect(nameRows(8)).toBe(3); // signed in
  });

  it("never puts neighbours in the same row on a full bar", () => {
    const count = 8;
    for (let i = 1; i < count; i++) {
      expect(nameRow(i, count)).not.toBe(nameRow(i - 1, count));
      if (i >= 2) expect(nameRow(i, count)).not.toBe(nameRow(i - 2, count));
    }
  });

  it("puts the card above the highest row", () => {
    expect(namesReach(8)).toBeGreaterThan(namesReach(4));
  });

  it("keeps the first and last names on screen", () => {
    const first = renderToString(<PhoneNavName label="Today" index={0} count={8} />);
    const middle = renderToString(<PhoneNavName label="Tables" index={4} count={8} />);
    const last = renderToString(<PhoneNavName label="Messages" index={7} count={8} />);
    expect(first).toMatch(/left:0/);
    expect(middle).toContain("translateX(-50%)");
    expect(last).toMatch(/right:0/);
    // Screen readers already hear each link's name.
    expect(middle).toContain('aria-hidden="true"');
  });

  it("titles the card and offers Got it", () => {
    const html = renderToString(<PhoneNavNoteCard count={8} onDismiss={() => {}} />);
    expect(html).toContain(PHONE_NOTE_TITLE);
    expect(html).toContain(">Got it</button>");
  });
});
