// A ballot card's picture (Rick, 2026-11-04: on a phone the pictures were
// cropped to a strip, and a project with none was a black box). It is the
// project's cover shown whole, in the 4:5 frame on a phone, and the abstract
// cover when the project has no picture, never an empty box.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import AdminVotingPage from "./admin.voting";

const state = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("../lib/useIsAdmin", () => ({ useIsAdmin: () => true }));
vi.mock("convex/react", () => ({
  useQuery: (_fn: unknown, args: unknown) => (args === "skip" ? undefined : state.rows),
  useMutation: () => vi.fn(),
}));

const row = (id: string, photoUrl: string | null) => ({
  _id: id,
  title: `Project ${id}`,
  blurb: "",
  kind: "passion",
  stage: "completed",
  byName: "Kai Moy",
  photoUrl,
  createdAt: 0,
  cheers: 0,
  backers: 0,
  status: "new",
  tally: { yes: 0, maybe: 0, no: 0 },
  votes: [],
  myVote: null,
  myNote: null,
});

function card(photoUrl: string | null) {
  state.rows = [row("p1", photoUrl)];
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <AdminVotingPage />
    </MemoryRouter>,
  );
  // The card's picture column: everything before the title.
  return html.slice(html.indexOf("overflow-hidden rounded-xl"), html.indexOf("Project p1"));
}

describe("a ballot card's picture", () => {
  it("shows the whole picture in the 4:5 frame, not a cropped strip", () => {
    const html = card("https://example.com/river.jpg");
    expect(html).toContain("aspect-[4/5]");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("h-44");
  });

  it("draws the abstract cover when the project has no picture", () => {
    const html = card(null);
    expect(html).toContain("aspect-[4/5]");
    expect(html).toContain("<svg");
  });
});
