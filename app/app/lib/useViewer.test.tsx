import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { canSaveProject } from "./projectPick";
import { useViewer } from "./useViewer";

// useViewer is the one place a page's `{ signedIn, profile }` is built, for
// canSaveProject. It reads the two answers a page already had: the auth state
// and getMyProfile, and adds no query of its own.
const scene = vi.hoisted(() => ({ signedIn: true, profile: undefined as unknown, queries: [] as string[] }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({ isAuthenticated: scene.signedIn, isLoading: false }),
    useQuery: (fn: Parameters<typeof getFunctionName>[0]) => {
      scene.queries.push(getFunctionName(fn));
      return scene.profile;
    },
  };
});
beforeEach(() => {
  scene.signedIn = true;
  scene.profile = undefined;
  scene.queries = [];
});

function viewer() {
  let seen: ReturnType<typeof useViewer> | undefined;
  function Probe() {
    seen = useViewer();
    return null;
  }
  renderToString(<Probe />);
  return seen!;
}

describe("useViewer", () => {
  it("is signed in with the profile once it has loaded", () => {
    scene.profile = { _id: "me", userId: "u-me" };
    expect(viewer()).toEqual({ signedIn: true, profile: { _id: "me", userId: "u-me" } });
  });

  it("holds the profile as undefined while it loads, so Save is held back", () => {
    const v = viewer();
    expect(v.profile).toBeUndefined();
    expect(canSaveProject(v, { userId: "u-dana", status: "active" })).toBe(false);
  });

  it("is signed out, with no profile, for a visitor", () => {
    scene.signedIn = false;
    scene.profile = null;
    const v = viewer();
    expect(v).toEqual({ signedIn: false, profile: null });
    expect(canSaveProject(v, { userId: "u-dana", status: "active" })).toBe(false);
  });

  it("lets a member save someone else's project and not their own", () => {
    scene.profile = { userId: "u-me" };
    const v = viewer();
    expect(canSaveProject(v, { userId: "u-dana", status: "active" })).toBe(true);
    expect(canSaveProject(v, { userId: "u-me", status: "active" })).toBe(false);
  });

  it("asks for nothing but getMyProfile", () => {
    viewer();
    expect(scene.queries).toEqual(["profiles:getMyProfile"]);
  });
});
