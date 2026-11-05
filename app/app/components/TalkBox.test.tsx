import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Talk } from "../lib/useTalk";
import { TalkBox, addSaid, talkPlaceholder, type TalkBoxProps } from "./TalkBox";

// The mic's state is useTalk's (lib/useTalk.test.ts tests the recording and
// writing down); here it is whatever the test says, and the words it hands
// over are handed over by the test.
const talk = vi.hoisted(() => ({
  state: {} as Talk,
  onText: (_text: string) => {},
}));
vi.mock("../lib/useTalk", () => ({
  useTalk: (onText: (text: string) => void) => {
    talk.onText = onText;
    return talk.state;
  },
}));

const idle = (patch: Partial<Talk> = {}): Talk => ({
  supported: true,
  recording: false,
  transcribing: false,
  error: null,
  start: () => {},
  stop: () => {},
  ...patch,
});

const draw = (props: Partial<TalkBoxProps> = {}) =>
  renderToStaticMarkup(<TalkBox id="bio" value="" onChange={() => {}} {...props} />);

describe("addSaid", () => {
  it("is just what was said when the box is empty", () => {
    expect(addSaid("", "I paint murals.")).toBe("I paint murals.");
    expect(addSaid("  \n", "I paint murals.")).toBe("I paint murals.");
  });

  it("goes after what's there, one space between", () => {
    expect(addSaid("I paint murals.", "And I teach.")).toBe("I paint murals. And I teach.");
  });

  it("adds no space after a space or a new line", () => {
    expect(addSaid("I paint murals. ", "And I teach.")).toBe("I paint murals. And I teach.");
    expect(addSaid("Line one\n", "Line two")).toBe("Line one\nLine two");
  });
});

describe("TalkBox", () => {
  beforeEach(() => {
    talk.state = idle();
  });

  it("is a textarea with the page's attributes and look", () => {
    const html = draw({ rows: 4, maxLength: 500, className: "w-full border", style: { color: "red" }, "aria-label": "Bio" });
    expect(html).toMatch(/<textarea[^>]*id="bio"/);
    expect(html).toContain('rows="4"');
    expect(html).toContain('maxLength="500"');
    expect(html).toContain('aria-label="Bio"');
    expect(html).toMatch(/class="block w-full border"/);
    expect(html).toContain("color:red");
  });

  it("has the mic inside the box, room for it, and says it listens", () => {
    const html = draw({ placeholder: "Who you are" });
    expect(html).toContain('aria-label="Talk instead"');
    expect(html).toContain("padding-right:60px");
    expect(html).toContain(`placeholder="${talkPlaceholder("Who you are")}"`);
    expect(talkPlaceholder()).toBe("Talk or type");
  });

  it("draws no mic where it can't record or the person isn't signed in", () => {
    talk.state = idle({ supported: false });
    const html = draw({ placeholder: "Who you are" });
    expect(html).not.toContain("Talk instead");
    expect(html).not.toContain("padding-right");
    expect(html).toContain('placeholder="Who you are"');
  });

  it("draws no mic on a box that can't be typed in", () => {
    expect(draw({ disabled: true })).not.toContain("Talk instead");
    expect(draw({ readOnly: true })).not.toContain("Talk instead");
  });

  it("says when it is recording, writing down, or what went wrong", () => {
    talk.state = idle({ recording: true });
    expect(draw()).toContain('role="status"');
    expect(draw()).toContain("Listening… tap the mic to stop");
    expect(draw()).toContain('aria-pressed="true"');
    talk.state = idle({ transcribing: true });
    expect(draw()).toContain("Writing it down…");
    talk.state = idle({ error: "Microphone access was blocked." });
    expect(draw()).toMatch(/role="alert"[^>]*>Microphone access was blocked\./);
    talk.state = idle();
    expect(draw()).not.toMatch(/role="(status|alert)"/);
  });

  it("puts the words that come back after the take after what's in the box", () => {
    const onChange = vi.fn();
    const onSaid = vi.fn();
    draw({ value: "I paint murals.", onChange, onSaid });
    talk.onText("And I teach.");
    expect(onChange).toHaveBeenCalledWith("I paint murals. And I teach.");
    expect(onSaid).toHaveBeenCalledWith("I paint murals. And I teach.");
  });

  it("keeps to the box's limit", () => {
    const onChange = vi.fn();
    draw({ value: "12345", maxLength: 8, onChange });
    talk.onText("6789");
    expect(onChange).toHaveBeenCalledWith("12345 67");
  });

  it("puts the classes for its place on the wrapper", () => {
    expect(draw({ wrapperClassName: "flex-1 min-w-0" })).toMatch(/^<div class="flex-1 min-w-0">/);
  });
});
