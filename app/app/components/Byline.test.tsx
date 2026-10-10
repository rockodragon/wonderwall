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
});
