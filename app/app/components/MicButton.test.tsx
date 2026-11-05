import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MicButton } from "./MicButton";

const noop = () => {};
const draw = (props: Partial<Parameters<typeof MicButton>[0]> = {}) =>
  renderToStaticMarkup(<MicButton listening={false} onStart={noop} onStop={noop} {...props} />);
const styleOf = (html: string) => html.match(/<button[^>]*style="([^"]*)"/)?.[1] ?? "";

describe("MicButton", () => {
  it("is a round 44px button that says 'Talk instead'", () => {
    const html = draw();
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Talk instead"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("rounded-full");
    const style = styleOf(html);
    expect(style).toContain("width:44px");
    expect(style).toContain("height:44px");
    expect(html).toContain("<svg");
  });

  it("while listening is pressed, says 'Stop', and fills with citron", () => {
    const html = draw({ listening: true });
    expect(html).toContain('aria-label="Stop"');
    expect(html).toContain('aria-pressed="true"');
    expect(styleOf(html)).toContain("background-color:var(--garden-citron)");
    expect(styleOf(draw())).not.toContain("--garden-citron");
  });

  it("takes the caller's class", () => {
    expect(draw({ className: "ml-auto" })).toMatch(/class="[^"]*\bml-auto\b/);
  });

  it("a tap starts it at rest and stops it while listening", () => {
    // It holds no hooks, so it can be called as a function and its click
    // handler read off the element it returns.
    const onStart = vi.fn();
    const onStop = vi.fn();
    const clickOf = (listening: boolean) =>
      (MicButton({ listening, onStart, onStop }) as { props: { onClick: () => void } }).props.onClick;
    clickOf(false)();
    expect([onStart.mock.calls.length, onStop.mock.calls.length]).toEqual([1, 0]);
    clickOf(true)();
    expect([onStart.mock.calls.length, onStop.mock.calls.length]).toEqual([1, 1]);
  });
});
