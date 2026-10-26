import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { MyShareActions } from "./MyShareActions";

// Your own page's three buttons: Settings keeps them as tiles at every
// width; your profile page turns them into pills from `sm` up.
const profile = { name: "Ana Reyes", handle: "ana", imageUrl: null, artifacts: [] };

function row(look: "tile" | "phoneTile", note?: string) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <MyShareActions profile={profile} projects={[]} look={look}>
        {note && <p>{note}</p>}
      </MyShareActions>
    </MemoryRouter>,
  );
}

describe("MyShareActions", () => {
  it("as tiles (Settings): three to a row, never pills", () => {
    const html = row("tile");
    expect(html).toContain("grid-cols-3");
    for (const label of ["Share profile", "My code", "Shortlist"]) expect(html).toContain(label);
    for (const label of ["Share your profile", "Show my code", "Your shortlist"]) expect(html).not.toContain(label);
    // Nothing that changes at a wider width.
    expect(html).not.toContain("sm:");
  });

  it("as phone tiles (profile page): one button each, worded for both widths", () => {
    const html = row("phoneTile");
    expect(html).toContain("grid-cols-3");
    expect(html).toContain("sm:flex-col");
    expect(html).toContain("Share your profile");
    expect(html).toContain("Show my code");
    expect(html).toContain("Your shortlist →");
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(1);
    expect(html.match(/href="\/code"/g)).toHaveLength(1);
    expect(html.match(/href="\/favorites"/g)).toHaveLength(1);
  });

  it("puts the note between Share and Shortlist, where it sat as pills", () => {
    const html = row("phoneTile", "THE NOTE");
    expect(html.indexOf("Show my code")).toBeLessThan(html.indexOf("THE NOTE"));
    expect(html.indexOf("THE NOTE")).toBeLessThan(html.indexOf("Your shortlist"));
    // And no empty row of its own when there's no note.
    expect(row("phoneTile")).not.toContain("col-span-3");
  });
});
