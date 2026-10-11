import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { PersonAvatar } from "./PersonAvatar";

// The looks the app's person lists already had. If one of these changes, every
// page that picked it changes with it.
describe("PersonAvatar looks", () => {
  it("mdBase is 40px with a 16px initial (the blocked list)", () => {
    const html = renderToString(<PersonAvatar name="Mara" size="mdBase" tone="strong" />);
    expect(html).toContain("h-10 w-10 text-base");
    expect(html).not.toContain("text-sm");
    expect(html).toContain("rounded-full");
  });

  it("card is 48px with a 16px initial (search results)", () => {
    const html = renderToString(<PersonAvatar name="Mara" size="card" tone="strong" />);
    expect(html).toContain("h-12 w-12 text-base");
    expect(html).toContain("rounded-full");
  });

  it("strong is a bold initial in the app text color on the raised hairline", () => {
    const html = renderToString(<PersonAvatar name="Mara" tone="strong" />);
    expect(html).toContain("font-bold");
    expect(html).toContain("var(--app-hairline-raised)");
    expect(html).toContain("color:var(--app-text)");
    expect(html).not.toContain("var(--app-text-");
  });

  it("rowXs + gray is the event attendee face: 36px, a readable gray initial, extra classes kept", () => {
    const html = renderToString(
      <PersonAvatar name="ada" size="rowXs" tone="gray" className="ring-2 ring-white dark:ring-gray-900" />,
    );
    expect(html).toContain("h-9 w-9 text-xs");
    expect(html).toContain("text-gray-700 dark:text-gray-200");
    expect(html).toContain("ring-2 ring-white dark:ring-gray-900");
    expect(html).toContain(">A<");
  });

  it("keeps the 40px md size at a 14px initial", () => {
    expect(renderToString(<PersonAvatar name="Mara" />)).toContain("h-10 w-10 text-sm");
  });
});

describe("PersonAvatar fallbacks", () => {
  it("shows a dot for a blank name and a question mark when asked to", () => {
    expect(renderToString(<PersonAvatar name="  " />)).toContain(">·</span>");
    expect(renderToString(<PersonAvatar name="?" />)).toContain(">?</span>");
  });

  it("hides the initial from a screen reader, and the picture has no alt (the name sits beside it)", () => {
    expect(renderToString(<PersonAvatar name="Mara" />)).toContain('aria-hidden="true"');
    expect(renderToString(<PersonAvatar name="Mara" imageUrl="/mara.jpg" />)).toContain('alt=""');
  });

  it("puts the picture on the tone's background and keeps it from shrinking in a row", () => {
    const html = renderToString(<PersonAvatar name="Mara" imageUrl="/mara.jpg" size="card" tone="strong" />);
    expect(html).toContain("<img");
    expect(html).toContain("h-12 w-12");
    expect(html).toContain("shrink-0");
    expect(html).toContain("object-cover");
    expect(html).toContain("background-color:var(--app-hairline-raised)");
  });
});
