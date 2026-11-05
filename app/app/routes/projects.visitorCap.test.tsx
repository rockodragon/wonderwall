// A visitor gets the newest page of projects (listProjects), and the end of
// it says how many more there are and how to get in: Join free, or Sign in,
// each bringing them back to this list. A member sees no such card.

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import Projects from "./projects";

const scene = vi.hoisted(() => ({ projects: [] as unknown[], count: 0 as number | undefined, signedIn: false }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (fn: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(fn);
      if (name === "garden/projects:listProjects") return scene.projects;
      if (name === "garden/projects:listedProjectCount") return scene.count;
      if (name === "garden/communities:listMyCommunities") return [];
      return undefined;
    },
    useMutation: () => async () => {},
    useAction: () => async () => {},
    useConvexAuth: () => ({ isAuthenticated: scene.signedIn, isLoading: false }),
  };
});
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

const project = (i: number) => ({
  _id: `p${i}`,
  kind: "passion",
  status: "active",
  stage: "working",
  title: `Project ${i}`,
  media: [],
  creator: { name: "Dana Lee" },
  interests: [],
  openRoles: [],
});

function page(opts: { signedIn: boolean; shown: number; count: number | undefined; at?: string }) {
  scene.signedIn = opts.signedIn;
  scene.projects = Array.from({ length: opts.shown }, (_, i) => project(i));
  scene.count = opts.count;
  return renderToString(
    <MemoryRouter initialEntries={[opts.at ?? "/projects"]}>
      <Projects />
    </MemoryRouter>,
  )
    .replace(/<!-- -->/g, "")
    .replace(/&amp;/g, "&");
}

describe("a visitor's page of projects", () => {
  it("says how many more there are, with Join free and Sign in back to this list", () => {
    const html = page({ signedIn: false, shown: 24, count: 215, at: "/projects?stage=working" });
    expect(html).toContain("191 more projects here.");
    expect(html).toContain("Join free to see them all");
    expect(html).toContain(`href="/signup?redirect=${encodeURIComponent("/projects?stage=working")}"`);
    expect(html).toContain(`href="/login?redirect=${encodeURIComponent("/projects?stage=working")}"`);
  });

  it("says nothing when the visitor already sees them all, or before the count is in", () => {
    expect(page({ signedIn: false, shown: 5, count: 5 })).not.toContain("more projects here");
    expect(page({ signedIn: false, shown: 24, count: undefined })).not.toContain("more projects here");
  });

  it("never shows a member the card", () => {
    expect(page({ signedIn: true, shown: 24, count: 215 })).not.toContain("more projects here");
  });
});
