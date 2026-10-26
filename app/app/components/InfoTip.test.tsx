import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InfoTip } from "./InfoTip";

// The "i" next to a heading. A finger needs a 44px target, but the circle
// people see stays 28px and the row around it doesn't grow.
function styleOf(html: string, tag: "button" | "span", after = ""): Record<string, string> {
  const from = after ? html.indexOf(after) : 0;
  const open = html.slice(from).match(new RegExp(`<${tag}[^>]*style="([^"]*)"`));
  if (!open) throw new Error(`no styled <${tag}> in ${html}`);
  return Object.fromEntries(open[1].split(";").map((d) => d.split(":") as [string, string]));
}

const html = renderToStaticMarkup(<InfoTip label="About this" lines={["A line."]} />);

describe("InfoTip", () => {
  it("the button is a 44px target", () => {
    const button = styleOf(html, "button");
    expect(button.width).toBe("44px");
    expect(button.height).toBe("44px");
  });

  it("the circle drawn inside it is still 28px", () => {
    const circle = styleOf(html, "span", "<button");
    expect(circle.width).toBe("28px");
    expect(circle.height).toBe("28px");
    expect(circle["border-radius"]).toBe("9999px");
  });

  it("takes up 28px in the row: the extra 16px is cancelled by the margin", () => {
    const button = styleOf(html, "button");
    expect(parseInt(button.width) + 2 * parseInt(button.margin)).toBe(28);
    expect(parseInt(button.height) + 2 * parseInt(button.margin)).toBe(28);
  });

  it("starts closed, with its label on the button", () => {
    expect(html).toContain('aria-label="About this"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="note"');
  });
});
