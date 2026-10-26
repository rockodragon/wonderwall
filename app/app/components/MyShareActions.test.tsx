import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { MyShareActions } from "./MyShareActions";

// Your own page's three buttons: Settings keeps them as round icons at
// every width; your profile page turns them into pills from `sm` up.
const profile = { name: "Ana Reyes", handle: "ana", imageUrl: null, artifacts: [] };

function row(look: "icon" | "phoneTile", note?: string) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <MyShareActions profile={profile} projects={[]} look={look}>
        {note && <p>{note}</p>}
      </MyShareActions>
    </MemoryRouter>,
  );
}

describe("MyShareActions", () => {
  it("as icons (Settings): named for screen readers and on hover, never tiles", () => {
    const html = row("icon");
    expect(html).not.toContain("grid-cols-3");
    for (const name of ["Share your profile", "Show my code", "Your shortlist"]) {
      expect(html).toContain(`title="${name}"`);
      expect(html).toContain(`<span class="sr-only">${name}</span>`);
    }
    // No arrow read aloud, and nothing that changes at a wider width.
    expect(html).not.toContain("→");
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

  // Tab and screen-reader order is the markup's, not the grid's. So the note
  // is there twice, each copy shown at one width only (`display: none` takes
  // the hidden one out of both orders): between code and Shortlist from `sm`
  // up, as it sat as pills, and after Shortlist on a phone, where it's the
  // row under the three tiles.
  it("puts the note where it reads: between Share and Shortlist from sm up, after Shortlist on a phone", () => {
    const html = row("phoneTile", "THE NOTE");
    const notes = [...html.matchAll(/<div class="([^"]*)"><p>THE NOTE<\/p><\/div>/g)];
    expect(notes).toHaveLength(2);
    const [wide, phone] = notes;
    const code = html.indexOf('href="/code"');
    const shortlist = html.indexOf('href="/favorites"');
    // From sm up: after code, before Shortlist, shown only there.
    expect(wide[1].split(" ")).toEqual(expect.arrayContaining(["hidden", "sm:contents"]));
    expect(code).toBeLessThan(wide.index!);
    expect(wide.index!).toBeLessThan(shortlist);
    // On a phone: after Shortlist, its own row, gone from sm up.
    expect(phone[1].split(" ")).toEqual(expect.arrayContaining(["col-span-3", "sm:hidden"]));
    expect(phone[1].split(" ")).not.toContain("hidden");
    expect(shortlist).toBeLessThan(phone.index!);
  });

  it("lets Shortlist fall into the grid's third cell instead of being moved there", () => {
    const html = row("phoneTile", "THE NOTE");
    const shortlist = html.match(/<a [^>]*href="\/favorites"[^>]*>/)![0];
    expect(shortlist).not.toMatch(/col-start|row-start/);
    expect(html).not.toMatch(/col-start|row-start/);
  });

  it("has no empty note row when there's no note", () => {
    const html = row("phoneTile");
    expect(html).not.toContain("col-span-3");
    expect(html).not.toContain("sm:contents");
  });

  it("never gives the icons a note row", () => {
    const html = row("icon");
    expect(html).not.toContain("col-span-3");
  });
});
