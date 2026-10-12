import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { PageTop, TopButton } from "./PageTop";
import { TabStrip } from "./TabStrip";

function render(node: React.ReactNode) {
  return renderToString(<MemoryRouter initialEntries={["/events"]}>{node}</MemoryRouter>);
}

describe("the phone's page bar", () => {
  it("is the heading, with its count beside it and the action on the right", () => {
    const html = render(<PageTop title="Events" count="4" action={<TopButton onClick={() => {}}>Host</TopButton>} />);
    expect(html).toMatch(/<h1[^>]*>Events<span[^>]*>4<\/span><\/h1>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Host<\/button>/);
    expect(html).toContain("sticky");
  });

  it("goes a level up by the arrow, named for where it goes", () => {
    const html = render(<PageTop title="Projects" back={{ to: "/favorites", label: "Shortlist" }} />);
    expect(html).toMatch(/<a (?=[^>]*href="\/favorites")[^>]*aria-label="Shortlist"/);
  });

  it("makes the action a link when it has somewhere to go", () => {
    expect(render(<TopButton to="/projects?new=project">Post</TopButton>)).toMatch(/<a [^>]*href="\/projects\?new=project"[^>]*>Post<\/a>/);
  });
});

describe("the phone's tabs", () => {
  it("are links when they are places, the open one aria-current", () => {
    const html = render(
      <TabStrip
        label="Shortlist areas"
        active="events"
        items={[
          { key: "all", label: "All", count: 39, to: "/favorites" },
          { key: "events", label: "Events", count: 10, dot: true, to: "/favorites?area=events" },
        ]}
      />,
    );
    expect(html).toMatch(/<a (?=[^>]*href="\/favorites\?area=events")[^>]*aria-current="page"/);
    expect(html).not.toMatch(/<a (?=[^>]*href="\/favorites")[^>]*aria-current/);
    expect(html).toContain('aria-label="Shortlist areas"');
    expect(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).toContain("All 39 Events 10");
  });

  it("are buttons when they are views of one page, the open one pressed", () => {
    const html = render(
      <TabStrip
        label="Which events"
        active="past"
        items={[
          { key: "all", label: "Upcoming", onClick: () => {} },
          { key: "past", label: "Past", onClick: () => {} },
        ]}
      />,
    );
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Past/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>(?:(?!<\/button>).)*Upcoming/);
    expect(html).not.toContain("<a ");
  });
});
