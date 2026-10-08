import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PeopleFaces } from "./PeopleFaces";

describe("PeopleFaces", () => {
  it("shows names and small photos for the people behind a count", () => {
    const html = renderToStaticMarkup(
      <PeopleFaces
        faces={[
          { name: "Mara Lin", imageUrl: "/mara.jpg" },
          { name: "Theo Okafor" },
        ]}
        count={2}
      />,
    );
    expect(html).toContain("Mara Lin");
    expect(html).toContain("Theo Okafor");
    expect(html).toContain('src="/mara.jpg"');
    expect(html).toContain("2 people");
  });

  it("does not render an empty people group", () => {
    expect(renderToStaticMarkup(<PeopleFaces faces={[]} count={0} />)).toBe("");
  });
});
