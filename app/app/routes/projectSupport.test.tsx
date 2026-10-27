// useProjectSupport (routes/projects.tsx): what a tap on Cheer or Back this
// does, for the Projects page, a project's page and Today's posts alike. A
// server render has no clicks, so a tap is made while the probe renders, once.

import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { signupHref } from "../lib/pendingIntent";
import { useProjectSupport, type SupportMode } from "./projects";

const scene = vi.hoisted(() => ({ signedIn: true, loading: false, navigate: undefined as unknown as ReturnType<typeof vi.fn> }));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: scene.signedIn, isLoading: scene.loading }),
}));
vi.mock("react-router", async (importOriginal) => {
  scene.navigate = vi.fn();
  return { ...(await importOriginal<typeof import("react-router")>()), useNavigate: () => scene.navigate };
});

beforeEach(() => {
  scene.signedIn = true;
  scene.loading = false;
  scene.navigate.mockClear();
});

const project = { _id: "projects:p1", title: "Songs of Safety" };

function Tap({ mode }: { mode: SupportMode }) {
  const { support, modal } = useProjectSupport();
  const tapped = useRef(false);
  if (!tapped.current) {
    tapped.current = true;
    support(project, mode);
  }
  return <>{modal}</>;
}

// React marks the seams between text pieces; they are not in the page.
const plain = (html: string) => html.replace(/<!-- -->/g, "");

function tap(mode: SupportMode, at = "/today?tab=open") {
  return plain(renderToString(
    <MemoryRouter initialEntries={[at]}>
      <Tap mode={mode} />
    </MemoryRouter>,
  ));
}

describe("useProjectSupport", () => {
  it("does nothing until the sign-in check settles, so a member isn't sent to sign up", () => {
    scene.loading = true;
    scene.signedIn = false;
    expect(tap("cheer")).not.toContain("Cheer on");
    expect(tap("back")).not.toContain("Back");
    expect(scene.navigate).not.toHaveBeenCalled();
  });

  it("opens the sheet for a member", () => {
    expect(tap("cheer")).toContain("Cheer on");
    expect(tap("back")).toContain("Back &quot;Songs of Safety&quot;");
    expect(scene.navigate).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor who cheers to sign up, and back to this page and its search", () => {
    scene.signedIn = false;
    const html = tap("cheer", "/today?tab=open");
    expect(html).not.toContain("Cheer on");
    expect(scene.navigate).toHaveBeenCalledWith(signupHref("/today?tab=open"));
  });

  it("opens the Back this sheet for a signed-out visitor: a one-time backing needs no account", () => {
    scene.signedIn = false;
    expect(tap("back")).toContain("Back &quot;Songs of Safety&quot;");
    expect(scene.navigate).not.toHaveBeenCalled();
  });

  it("draws nothing before a tap", () => {
    function Idle() {
      const { modal } = useProjectSupport();
      return <i>{modal}</i>;
    }
    expect(
      renderToString(
        <MemoryRouter>
          <Idle />
        </MemoryRouter>,
      ),
    ).toBe("<i></i>");
  });
});
