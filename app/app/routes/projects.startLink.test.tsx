// The Share a project card's "Something I finished" opens the start form with
// /projects?new=project&stage=completed. ?stage= is also the Stage menu's own
// word on this page, so a start link must not leave the list filtered to
// Completed behind the form: the stage belongs to the form, not the list.

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import Projects from "./projects";

const scene = vi.hoisted(() => ({ projects: [] as unknown[] }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (fn: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(fn);
      if (name === "garden/projects:listProjects") return scene.projects;
      if (name === "garden/communities:listMyCommunities") return [];
      return undefined;
    },
    useMutation: () => async () => {},
    useAction: () => async () => {},
    useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  };
});
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

const project = (id: string, title: string, stage: string) => ({
  _id: id,
  kind: "passion",
  status: "active",
  stage,
  title,
  media: [],
  creator: { name: "Dana Lee" },
  interests: [],
  openRoles: [],
});

function page(at: string) {
  scene.projects = [
    project("p1", "Harbor Mural", "working"),
    project("p2", "Songs of Safety", "completed"),
    project("p3", "Zine Press", "planning"),
  ];
  return renderToString(
    <MemoryRouter initialEntries={[at]}>
      <Projects />
    </MemoryRouter>,
  ).replace(/<!-- -->/g, "");
}

describe("Projects and a start link's stage", () => {
  it("lists every project behind a start link that asks for Completed", () => {
    const html = page("/projects?new=project&stage=completed");
    expect(html).toContain("Harbor Mural");
    expect(html).toContain("Songs of Safety");
    expect(html).toContain("Zine Press");
  });

  it("keeps the Stage menu's own choice: ?stage=completed alone filters the list", () => {
    const html = page("/projects?stage=completed");
    expect(html).toContain("Songs of Safety");
    expect(html).not.toContain("Harbor Mural");
    expect(html).not.toContain("Zine Press");
  });
});
