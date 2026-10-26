// The project page (/projects/:id) as drawn, now that anyone may open it
// (Rick, 2026-10-22): a visitor sees only what has something in it, and
// every action asks them to sign up first; the owner keeps every section,
// with its empty state and edit controls, so there's somewhere to fill it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { getFunctionName } from "convex/server";
import ProjectDetail from "./projects.$id";

const scene = vi.hoisted(() => ({ signedIn: false, answers: {} as Record<string, unknown> }));

// Backing is off by default (FF_BACKING). The page is drawn with it open
// unless a test shuts it, so the Back this path stays covered.
const flags = vi.hoisted(() => ({ backing: true }));
vi.mock("../lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/featureFlags")>()),
  get FF_BACKING() {
    return flags.backing;
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (ref: unknown, args?: unknown) =>
    args === "skip" ? undefined : scene.answers[getFunctionName(ref as never)],
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: scene.signedIn, isLoading: false }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

const LEAD = "users:lead";
const lead = { profileId: "profiles:lead", userId: LEAD, name: "Lena Ortiz", imageUrl: null };

/** A project with nothing in it yet: no place, no team but its lead, no
 * roles, no updates, no support. */
function bareProject(extra: Record<string, unknown> = {}) {
  return {
    _id: "p1",
    userId: LEAD,
    kind: "passion",
    status: "active",
    title: "Harbor Mural",
    media: [],
    interests: [],
    openRoles: [],
    raising: false,
    supportCount: 0,
    creator: { _id: "profiles:lead", name: "Lena Ortiz", imageUrl: null },
    organization: null,
    community: null,
    gig: null,
    ...extra,
  };
}

function page({
  viewer,
  project = bareProject(),
  team,
  updates = [],
  roles = [],
  accepting = false,
  url = "/projects/p1",
  answers = {},
}: {
  viewer: "visitor" | "owner" | "member" | "admin";
  project?: Record<string, unknown>;
  team?: Record<string, unknown>;
  updates?: unknown[];
  roles?: unknown[];
  /** Still taking people (getTeam's acceptingPeople). Off by default: a
   * finished project, which with only its lead has no Team tab. */
  accepting?: boolean;
  url?: string;
  /** More answers, by function name. */
  answers?: Record<string, unknown>;
}): string {
  scene.signedIn = viewer !== "visitor";
  const me =
    viewer === "owner"
      ? { _id: "profiles:lead", userId: LEAD, name: "Lena Ortiz" }
      : viewer === "member"
        ? { _id: "profiles:mo", userId: "users:mo", name: "Mo" }
        : viewer === "admin"
          ? // What useIsAdmin reads.
            { _id: "profiles:ada", userId: "users:ada", name: "Ada", isAdmin: true }
          : null;
  const signedInTeam = viewer === "visitor" ? {} : { mine: undefined, apply: { allowed: true, reason: null, upgradePath: null } };
  const ownerTeam = viewer === "owner" ? { pending: [], invited: [] } : {};
  scene.answers = {
    "garden/projects:getProject": project,
    "profiles:getMyProfile": me,
    "garden/projectTeam:getTeam": team ?? { lead, accepted: [], credits: [], acceptingPeople: accepting, ...signedInTeam, ...ownerTeam },
    "garden/projectTeam:listRoles": roles,
    "garden/stories:listProjectUpdates": updates,
    "garden/support:listSupportForProject": [],
    "favorites:isFavorited": false,
    ...answers,
  };
  return renderToString(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>,
  ).replace(/<!-- -->/g, "");
}

/** The tab bar's labels, in order. */
const tabs = (html: string) => [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1]);

afterEach(() => {
  scene.answers = {};
  scene.signedIn = false;
  flags.backing = true;
});

describe("the project page, for a signed-out visitor", () => {
  it("shows a bare project's About and nothing empty: no Location, Team, Updates or Support", () => {
    const html = page({ viewer: "visitor" });
    expect(html).toContain("Harbor Mural");
    expect(tabs(html)).toEqual(["About"]);
    expect(html).not.toContain("Remote-friendly");
    expect(html).not.toContain("No location set");
    expect(html).not.toContain("No supporters yet");
    expect(html).not.toContain('id="project-panel-team"');
  });

  it("has no generic Project chip", () => {
    expect(page({ viewer: "visitor" })).not.toMatch(/>Project</);
  });

  it("shows the lead's name as plain text, not a link to a members-only profile", () => {
    const html = page({ viewer: "visitor" });
    expect(html).toContain("Lena Ortiz");
    expect(html).not.toContain('href="/profile/');
  });

  it("sends Follow to sign up, coming back to this page", () => {
    const html = page({ viewer: "visitor" });
    expect(html).toMatch(/<a [^>]*href="\/signup\?redirect=%2Fprojects%2Fp1"[^>]*>Follow<\/a>/);
  });

  it("offers Cheer as an icon", () => {
    expect(page({ viewer: "visitor" })).toContain('aria-label="Cheer"');
  });

  it("shows the Team tab once there is someone on it, with names as plain text", () => {
    const team = {
      lead,
      accepted: [{ memberId: "m1", profileId: "profiles:mo", userId: "users:mo", name: "Mo Diaz", imageUrl: null, role: "Sound", status: "accepted" }],
      credits: [],
      acceptingPeople: true,
    };
    const html = page({ viewer: "visitor", team, url: "/projects/p1?tab=team" });
    expect(tabs(html)).toEqual(["About", "Team"]);
    expect(html).toContain("Mo Diaz");
    expect(html).not.toContain('href="/profile/');
    expect(html).toContain("Ask to join");
  });

  it("keeps Team on a project still taking people, with only its lead: Ask to join sends them to sign up", () => {
    const html = page({ viewer: "visitor", accepting: true, url: "/projects/p1?tab=team" });
    expect(tabs(html)).toEqual(["About", "Team"]);
    expect(html).toMatch(/<a [^>]*href="\/signup\?redirect=%2Fprojects%2Fp1%3Ftab%3Dteam"[^>]*>Ask to join<\/a>/);
    expect(html).toContain("Lena Ortiz");
  });

  it("sends a role's Apply to sign up, coming back to the Team tab", () => {
    const role = {
      roleId: "r1", title: "Editor", description: null, interests: [], neededBy: null,
      budgetType: null, budget: null, budgetMax: null, status: "open", filledBy: null,
    };
    const html = page({ viewer: "visitor", accepting: true, roles: [role], url: "/projects/p1?tab=team" });
    expect(html).toContain("Editor");
    expect(html).toMatch(/<a [^>]*href="\/signup\?redirect=%2Fprojects%2Fp1%3Ftab%3Dteam"[^>]*>Apply<\/a>/);
  });

  it("gives a raising project with no supporters yet a Support tab that asks them to back it", () => {
    const html = page({ viewer: "visitor", project: bareProject({ raising: true }), url: "/projects/p1?tab=support" });
    expect(tabs(html)).toEqual(["About", "Support"]);
    expect(html).toContain("Be the first to back this.");
    expect(html).toContain('aria-label="Back this"');
    expect(html).not.toContain("No supporters yet");
  });

  it("keeps an organization's byline linked to its public page", () => {
    const html = page({
      viewer: "visitor",
      project: bareProject({ organization: { name: "Harbor Arts", slug: "harbor-arts", logoUrl: null } }),
    });
    expect(html).toContain('href="/orgs/harbor-arts"');
    expect(html).not.toContain('href="/profile/');
  });

  it("falls back to About for ?tab=team when there's no team", () => {
    const html = page({ viewer: "visitor", url: "/projects/p1?tab=team" });
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>About</);
    expect(html).toMatch(/<div role="tabpanel" id="project-panel-about" aria-labelledby="project-tab-about">/);
  });

  it("shows Updates and Support once they have something in them", () => {
    const updates = [{ _id: "u1", body: "Primer's on.", createdAt: 1, authorUserId: LEAD, author: { name: "Lena Ortiz", profileId: "profiles:lead" } }];
    const html = page({ viewer: "visitor", updates, project: bareProject({ supportCount: 2 }) });
    expect(tabs(html)).toEqual(["About", "Updates", "Support · 2"]);
    expect(html).not.toContain('href="/profile/');
  });

  it("shows a place that was set", () => {
    const html = page({ viewer: "visitor", project: bareProject({ location: "Oakland, CA", remote: false }) });
    expect(html).toContain("Oakland, CA");
  });
});

describe("the project page, for its owner", () => {
  it("keeps every section of an empty project, with its empty state and edit control", () => {
    const html = page({ viewer: "owner" });
    expect(tabs(html)).toEqual(["About", "Team", "Updates", "Support"]);
    expect(html).toContain("No location set");
    expect(html).toContain('title="Add location"');
    expect(html).toContain("+ Add a role");
    expect(html).toContain("Post an update");
    expect(html).toContain("No supporters yet");
  });
});

describe("the project page, for an admin", () => {
  it("keeps every section of an empty project, as the owner does", () => {
    expect(tabs(page({ viewer: "admin" }))).toEqual(["About", "Team", "Updates", "Support"]);
  });
});

describe("the project page, for a signed-in member", () => {
  it("can still Ask to join a project with only its lead while it takes people", () => {
    const html = page({ viewer: "member", accepting: true, url: "/projects/p1?tab=team" });
    expect(tabs(html)).toContain("Team");
    expect(html).toContain("Ask to join");
  });


  it("links names to profiles, and keeps the real Follow", () => {
    const html = page({ viewer: "member" });
    expect(html).toContain('href="/profile/profiles:lead"');
    expect(html).not.toContain("/signup?redirect=");
  });
});

describe("the project page while backing is closed (FF_BACKING)", () => {
  const raising = () => bareProject({ raising: true, goal: 1000, raisedCents: 25_000 });

  it("gives a visitor Cheer and the goal's progress, but nothing to pay with", () => {
    flags.backing = false;
    const html = page({ viewer: "visitor", project: raising(), url: "/projects/p1?tab=support" });
    expect(html).toContain('aria-label="Cheer"');
    expect(html).not.toContain('aria-label="Back this"');
    expect(html).not.toContain("back this");
    expect(html).toContain("Be the first to cheer this on.");
    // How far it got is information, not a way to pay: it stays.
    expect(html).toContain(">$250</span> of $1,000<");
  });

  it("gives a signed-in member the same: Cheer, no Back this", () => {
    flags.backing = false;
    const html = page({ viewer: "member", project: raising() });
    expect(html).toContain('aria-label="Cheer"');
    expect(html).not.toContain('aria-label="Back this"');
  });

  it("stops the owner asking for money: no Ask for support step, no goal form, no tiers", () => {
    flags.backing = false;
    const next = page({ viewer: "owner" });
    expect(next).toContain("Next steps");
    expect(next).toContain("Find people");
    expect(next).not.toContain("Ask for support");
    expect(next).not.toContain("people can back it");
    expect(next).toContain("This is optional.");

    const tab = page({ viewer: "owner", url: "/projects/p1?tab=support" });
    expect(tab).toContain("No supporters yet");
    expect(tab).not.toContain("Want money toward this?");
    expect(tab).not.toContain("Start asking");

    const tiers = page({
      viewer: "owner",
      project: raising(),
      url: "/projects/p1?tab=support",
      answers: { "garden/patronTiers:listAllTiers": [] },
    });
    expect(tiers).not.toContain("Stop asking");
    expect(tiers).not.toContain("patron tiers");
  });

  it("still lets the owner ask for money when backing is open", () => {
    const next = page({ viewer: "owner" });
    expect(next).toContain("Ask for support");
    expect(next).toContain("Both of these are optional.");
    const tab = page({ viewer: "owner", url: "/projects/p1?tab=support" });
    expect(tab).toContain("Want money toward this?");
    const tiers = page({
      viewer: "owner",
      project: raising(),
      url: "/projects/p1?tab=support",
      answers: { "garden/patronTiers:listAllTiers": [] },
    });
    expect(tiers).toContain("Stop asking");
    expect(tiers).toContain("patron tiers");
  });
});
