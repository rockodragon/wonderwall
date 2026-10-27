// A project's updates, ten at a time. The list is its own component so the
// Updates tab and the About tab can both draw it: newest first as the server
// sends them, a quiet "Show more" only while there is more, nothing at all
// when a place on the page has no update to show.

import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { getFunctionName } from "convex/server";
import { ProjectUpdates, UpdatesList, UPDATES_PAGE_SIZE } from "./ProjectUpdates";

type Status = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

const scene = vi.hoisted(() => ({
  results: [] as Record<string, unknown>[],
  status: "Exhausted" as string,
  loadMore: (() => {}) as (n: number) => void,
  calls: [] as { name: string; args: unknown; options: unknown }[],
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: (ref: unknown, args: unknown, options: unknown) => {
    scene.calls.push({ name: getFunctionName(ref as never), args, options });
    return { results: scene.results, status: scene.status, loadMore: scene.loadMore };
  },
  useMutation: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));

const PROJECT = "projects:p1" as never;
const LEAD = "users:lead";
const OTHER = "users:other";

function update(n: number, authorUserId = LEAD) {
  return {
    _id: `storyUpdates:u${n}`,
    body: `Update number ${n}`,
    createdAt: Date.UTC(2026, 9, n),
    authorUserId,
    author: { name: "Lena Ortiz", imageUrl: null, profileId: "profiles:lead" },
  };
}

function show(results: Record<string, unknown>[], status: Status) {
  scene.results = results;
  scene.status = status;
}

const draw = (node: ReactNode) => renderToString(<MemoryRouter>{node}</MemoryRouter>);

beforeEach(() => {
  show([], "Exhausted");
  scene.loadMore = () => {};
  scene.calls = [];
});

describe("UpdatesList", () => {
  it("asks the server for the first ten of this project's updates", () => {
    show([update(1)], "Exhausted");
    draw(<UpdatesList projectId={PROJECT} />);
    expect(UPDATES_PAGE_SIZE).toBe(10);
    expect(scene.calls).toEqual([
      {
        name: "garden/stories:listProjectUpdatesPage",
        args: { projectId: PROJECT },
        options: { initialNumItems: UPDATES_PAGE_SIZE },
      },
    ]);
  });

  it("draws each update, in the order the server sent them", () => {
    show([update(3), update(2), update(1)], "Exhausted");
    const html = draw(<UpdatesList projectId={PROJECT} />);
    const at = [3, 2, 1].map((n) => html.indexOf(`Update number ${n}`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(html).toContain("Lena Ortiz");
  });

  it("offers Show more only while there are more", () => {
    show([update(1)], "CanLoadMore");
    expect(draw(<UpdatesList projectId={PROJECT} />)).toContain("Show more");

    show([update(1)], "Exhausted");
    expect(draw(<UpdatesList projectId={PROJECT} />)).not.toContain("Show more");

    show([update(1)], "LoadingMore");
    const loading = draw(<UpdatesList projectId={PROJECT} />);
    expect(loading).not.toContain("Show more");
    expect(loading).toContain("Loading…");
  });

  it("loads the next ten when Show more is pressed", () => {
    const loadMore = vi.fn();
    scene.loadMore = loadMore;
    show([update(1)], "CanLoadMore");
    const button = findByText(UpdatesList({ projectId: PROJECT }), "Show more");
    expect(button).not.toBeNull();
    (button!.props as { onClick: () => void }).onClick();
    expect(loadMore).toHaveBeenCalledExactlyOnceWith(UPDATES_PAGE_SIZE);
  });

  it("lets an author edit and delete their own update, and no one else's", () => {
    show([update(2, LEAD), update(1, OTHER)], "Exhausted");
    const html = draw(<UpdatesList projectId={PROJECT} myUserId={LEAD} />);
    expect(html.match(/>Edit</g)).toHaveLength(1);
    expect(html.match(/>Delete</g)).toHaveLength(1);

    expect(draw(<UpdatesList projectId={PROJECT} />)).not.toContain(">Edit<");
  });

  describe("hideWhenEmpty", () => {
    it("draws nothing when there are no updates", () => {
      show([], "Exhausted");
      expect(draw(<UpdatesList projectId={PROJECT} hideWhenEmpty heading="Updates" />)).toBe("");
    });

    it("draws nothing while the first page is still loading", () => {
      show([], "LoadingFirstPage");
      expect(draw(<UpdatesList projectId={PROJECT} hideWhenEmpty heading="Updates" />)).toBe("");
    });

    it("draws the updates once there are some", () => {
      show([update(1)], "Exhausted");
      expect(draw(<UpdatesList projectId={PROJECT} hideWhenEmpty />)).toContain("Update number 1");
    });
  });

  describe("heading", () => {
    it("sits above the updates", () => {
      show([update(1)], "Exhausted");
      const html = draw(<UpdatesList projectId={PROJECT} heading="Updates" />);
      expect(html).toContain("Updates</h2>");
      expect(html.indexOf("Updates</h2>")).toBeLessThan(html.indexOf("Update number 1"));
    });

    it("is not drawn without updates", () => {
      show([], "Exhausted");
      expect(draw(<UpdatesList projectId={PROJECT} heading="Updates" />)).not.toContain("<h2");

      show([], "LoadingFirstPage");
      expect(draw(<UpdatesList projectId={PROJECT} heading="Updates" />)).not.toContain("<h2");
    });

    it("is not drawn unless asked for", () => {
      show([update(1)], "Exhausted");
      expect(draw(<UpdatesList projectId={PROJECT} />)).not.toContain("<h2");
    });
  });

  it("says its empty line when it isn't hidden and has no updates", () => {
    show([], "Exhausted");
    expect(draw(<UpdatesList projectId={PROJECT} empty={<p>Nothing yet.</p>} />)).toContain("Nothing yet.");
  });

  it("says Loading… while the first page loads", () => {
    show([], "LoadingFirstPage");
    expect(draw(<UpdatesList projectId={PROJECT} empty={<p>Nothing yet.</p>} />)).toContain("Loading…");
  });
});

describe("ProjectUpdates (the Updates tab)", () => {
  it("shows a visitor nothing when there are no updates", () => {
    show([], "Exhausted");
    expect(draw(<ProjectUpdates projectId={PROJECT} isOwner={false} />)).toBe("");
  });

  it("shows a visitor the heading and the updates when there are some", () => {
    show([update(2), update(1)], "CanLoadMore");
    const html = draw(<ProjectUpdates projectId={PROJECT} isOwner={false} />);
    expect(html).toContain("Updates</h2>");
    expect(html).toContain("Update number 2");
    expect(html).toContain("Show more");
    expect(html).not.toContain("Post an update");
  });

  it("gives the owner the heading, the way to post and the empty line when there are none", () => {
    show([], "Exhausted");
    const html = draw(<ProjectUpdates projectId={PROJECT} isOwner />);
    expect(html).toContain("Updates</h2>");
    expect(html).toContain("Post an update");
    expect(html).toContain("No updates yet. Supporters and followers see these as you post them.");
  });

  it("gives the owner the way to post above their updates, and manage controls on their own", () => {
    show([update(1, LEAD)], "Exhausted");
    const html = draw(<ProjectUpdates projectId={PROJECT} isOwner myUserId={LEAD} />);
    expect(html.indexOf("Post an update")).toBeLessThan(html.indexOf("Update number 1"));
    expect(html).not.toContain("No updates yet");
    expect(html).toContain(">Edit<");
  });

  it("reads the updates through the one paged list", () => {
    show([update(1)], "Exhausted");
    draw(<ProjectUpdates projectId={PROJECT} isOwner />);
    expect(scene.calls.map((c) => c.name)).toEqual(["garden/stories:listProjectUpdatesPage"]);
  });
});

/** The first element in a tree of unrendered elements whose only child is
 * `text`: renderToString can't press a button, so this finds it to call its
 * onClick. Components that aren't expanded here are walked by their props. */
function findByText(node: ReactNode, text: string): ReactElement | null {
  if (!isValidElement(node)) return null;
  const props = node.props as { children?: ReactNode };
  if (props.children === text) return node;
  for (const child of Children.toArray(props.children)) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}
