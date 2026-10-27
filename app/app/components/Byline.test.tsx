import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { Byline } from "./Byline";
import { PersonAvatar } from "./PersonAvatar";

describe("PersonAvatar", () => {
  it("is a round accent initial by default", () => {
    const html = renderToStaticMarkup(<PersonAvatar name="  mara lin" />);
    expect(html).toContain("h-10 w-10 text-sm");
    expect(html).toContain("rounded-full");
    expect(html).toContain("font-semibold");
    expect(html).toContain("var(--app-accent-wash)");
    expect(html).toContain(">M</span>");
  });

  it("takes a size, a tone and a shape", () => {
    const html = renderToStaticMarkup(<PersonAvatar name="Org" size="2xs" tone="garden" shape="square" />);
    expect(html).toContain("h-5 w-5 text-xs");
    expect(html).toContain("font-bold");
    expect(html).toContain("var(--garden-hairline-raised)");
    expect(html).not.toContain("rounded-full");
  });

  it("shows the photo when there is one", () => {
    const html = renderToStaticMarkup(<PersonAvatar name="Mara" imageUrl="/mara.jpg" />);
    expect(html).toContain('src="/mara.jpg"');
    expect(html).toContain('alt=""');
  });
});

describe("Byline", () => {
  const person = { kind: "person", name: "Mara Lin", imageUrl: null, href: "/profile/p1" } as const;
  const org = { kind: "org", name: "Abiding Practice", imageUrl: null, href: "/orgs/abiding-practice" } as const;

  it("is a round avatar for a person", () => {
    const html = renderToStaticMarkup(<Byline byline={person} size="sm" />);
    expect(html).toContain("rounded-full");
    expect(html).toContain("h-5 w-5");
    expect(html).toContain("Mara Lin");
    expect(html).not.toContain("<a ");
  });

  it("is a square logo for an organization", () => {
    const card = renderToStaticMarkup(<Byline byline={org} size="sm" />);
    expect(card).toContain("h-5 w-5");
    expect(card).not.toContain("rounded-full");
    const page = renderToStaticMarkup(
      <MemoryRouter>
        <Byline byline={org} linked />
      </MemoryRouter>,
    );
    expect(page).toContain("w-6 h-6 rounded-md");
  });

  it("links to their page and shows the community after the name", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Byline byline={org} linked>
          <span> · in The Garden</span>
        </Byline>
      </MemoryRouter>,
    );
    expect(html).toContain('href="/orgs/abiding-practice"');
    expect(html).toContain("Abiding Practice<span> · in The Garden</span>");
  });

  // A feed post's header (Today): a 36px rounded square for a person or an
  // organization alike, the name on one line and what goes after it (the
  // community) on the next.
  describe("as a post's header", () => {
    const post = (b: typeof person | typeof org, children?: React.ReactNode) =>
      renderToStaticMarkup(
        <MemoryRouter>
          <Byline byline={b} size="post" linked>
            {children}
          </Byline>
        </MemoryRouter>,
      );

    it("is a 36px rounded square for a person, not a round avatar", () => {
      const html = post(person);
      expect(html).toContain("h-9 w-9");
      expect(html).toContain("rounded-xl");
      expect(html).not.toContain("rounded-full");
    });

    it("is the same square for an organization", () => {
      const html = post(org);
      expect(html).toContain("h-9 w-9");
      expect(html).toContain("rounded-xl");
      expect(html).not.toContain("rounded-full");
      expect(html).not.toContain("w-6 h-6");
    });

    it("links to their page, name first at 15px semibold in the text colour", () => {
      const html = post(person);
      expect(html).toContain('href="/profile/p1"');
      expect(html).toMatch(/<span class="block text-\[15px\] font-semibold[^"]*" style="color:var\(--app-text\)">Mara Lin<\/span>/);
    });

    it("puts the community on its own line under the name, 13px muted", () => {
      const html = post(person, "in The Garden");
      const name = html.indexOf(">Mara Lin<");
      const line = html.match(/<span class="block text-\[13px\][^"]*" style="color:var\(--app-text-muted\)">in The Garden<\/span>/);
      expect(line).not.toBeNull();
      expect(html.indexOf(line![0])).toBeGreaterThan(name);
      // Nothing under the name when there's no community.
      expect(post(person)).not.toContain("text-[13px]");
    });

    it("is a control at least 44px tall to tap", () => {
      expect(post(person)).toContain("py-1");
    });
  });
});
