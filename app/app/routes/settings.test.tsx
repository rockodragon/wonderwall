import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import { getFunctionName } from "convex/server";
import Settings from "./settings";
import { COVER_ASPECT } from "../lib/coverCrop";

// The settings page on a phone: a tab row that scrolls without a scrollbar,
// and a Work & Portfolio section with its intro behind an info button.
let answers: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) =>
    args === "skip" ? undefined : answers[getFunctionName(ref)],
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: async () => {}, signOut: async () => {} }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => null }));
// A note is closed until someone taps it, so show every note's lines here.
vi.mock("../components/InfoTip", () => ({
  InfoTip: ({ label, lines }: { label?: string; lines: React.ReactNode[] }) => (
    <aside data-info={label}>{lines.map((l, i) => <p key={i}>{l}</p>)}</aside>
  ),
}));

beforeEach(() => {
  answers = {
    "profiles:getMyProfile": { _id: "p1", name: "Ada", bio: "I make things.", interests: [], isAdmin: true },
    "artifacts:getMyArtifacts": [],
  };
});

async function settings(url = "/settings") {
  const handler = createStaticHandler([{ path: "/settings", Component: Settings }]);
  const context = await handler.query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error(`redirected to ${context.headers.get("Location")}`);
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

describe("Settings tabs", () => {
  it("keeps every tab, and Admin for an admin", async () => {
    const html = await settings();
    for (const label of ["Profile", "Network", "Money", "Support you&#x27;ve given", "Account", "Admin"]) {
      expect(html).toContain(`>${label}</`);
    }
  });

  it("scrolls sideways with no scrollbar, and the tabs are 15px", async () => {
    const html = await settings();
    const row = html.match(/<div[^>]*role="tablist"[^>]*>/)?.[0] ?? "";
    expect(row).toContain("no-scrollbar");
    expect(row).toContain("overflow-x-auto");
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) expect(tab).toContain("text-[15px]");
  });

  it("marks the tab from ?tab= as selected", async () => {
    const html = await settings("/settings?tab=support");
    expect(html).toMatch(/aria-selected="true"[^>]*>Support you&#x27;ve given</);
  });
});

// The Profile tab leads with who you are and your work; the address and
// the search switch are profile settings, behind Edit.
describe("the Profile tab", () => {
  beforeEach(() => {
    answers["profiles:getMyProfile"] = {
      _id: "p1",
      name: "Ada",
      handle: "ada",
      bio: "I make things.",
      interests: ["Film", "Music"],
      isAdmin: true,
    };
    answers["profiles:getProfile"] = { _id: "p1", userId: "u1", name: "Ada", handle: "ada", artifacts: [], organizations: [] };
  });

  it("shows a rounded-square photo, then name, @address, disciplines and bio", async () => {
    const html = await settings();
    expect(html).toContain("rounded-2xl");
    const at = (s: string) => html.indexOf(s);
    expect(at(">Ada<")).toBeGreaterThan(-1);
    expect(at(">Ada<")).toBeLessThan(at("@ada"));
    expect(at("@ada")).toBeLessThan(at("Film · Music"));
    expect(at("Film · Music")).toBeLessThan(at("I make things."));
  });

  it("keeps Share, your code, Shortlist and Edit as small icon buttons, not tiles", async () => {
    const html = await settings();
    for (const name of ["Share your profile", "Show my code", "Your shortlist", "Edit profile"]) {
      expect(html).toContain(name);
    }
    expect(html).not.toContain("grid-cols-3");
  });

  it("puts Work & Portfolio right under the header, and the address behind Edit", async () => {
    const html = await settings();
    expect(html).toContain("Work &amp; Portfolio");
    expect(html).not.toContain("Your public address");
    expect(html).not.toContain("Hide my profile from search engines");
  });
});

describe("Work & Portfolio", () => {
  it("puts the intro behind an info button, with the sizes from the upload caps", async () => {
    const html = await settings();
    const note = html.match(/<aside data-info="About work and portfolio">(.*?)<\/aside>/)?.[1] ?? "";
    expect(note).toContain("12 MB");
    expect(note).toContain("64 MB");
    expect(html).not.toContain("Showcase your work");
  });

  it("says plainly there is nothing yet, without telling a phone to click", async () => {
    const html = await settings();
    expect(html).toContain("No work added yet.");
    expect(html).not.toContain("Click");
  });
});

// The Work & Portfolio cards are the same 4:5 shape as the Canvas's photo
// cards, and a phone (no hover) can still reach Edit, Delete and Refresh.
describe("Work & Portfolio cards", () => {
  beforeEach(() => {
    answers["artifacts:getMyArtifacts"] = [
      { _id: "a1", type: "image", title: "Mural", mediaUrl: "/m.jpg" },
      { _id: "a2", type: "link", title: "Reel", mediaUrl: "https://example.com/reel" },
    ];
  });

  const classesOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);

  it("shapes each card 4:5 from the shared cover ratio, not a square", async () => {
    const html = await settings();
    // The picture's parent is the card.
    const at = html.lastIndexOf("<div", html.indexOf('alt="Mural"'));
    const card = html.slice(at, html.indexOf(">", at) + 1);
    expect(card).toContain(`aspect-ratio:${COVER_ASPECT}`);
    expect(card).not.toContain("aspect-square");
  });

  it("shows Edit, Delete and Refresh at once on a touch screen, and on hover or focus for a mouse", async () => {
    const html = await settings();
    const row = html.match(/<div[^>]*pointer-fine:group-hover:opacity-100[^>]*>/)?.[0] ?? "";
    const classes = classesOf(row);
    expect(classes).toContain("opacity-100");
    expect(classes).not.toContain("opacity-0");
    expect(classes).toContain("pointer-fine:opacity-0");
    expect(classes).toContain("pointer-fine:group-hover:opacity-100");
    expect(classes).toContain("pointer-fine:group-focus-within:opacity-100");
    expect(classes).not.toContain("group-hover:opacity-100");
  });

  // Named for its card, so a screen reader doesn't hear a run of "Edit".
  it("names every icon button for its card, at least 36px, with a drawn icon", async () => {
    const html = await settings();
    for (const [name, tip] of [
      ["Edit Mural", "Edit"],
      ["Delete Mural", "Delete"],
      ["Refresh preview of Reel", "Refresh preview"],
    ]) {
      const button = html.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>.*?</button>`))?.[0] ?? "";
      expect(button, name).not.toBe("");
      expect(button, name).toContain(`title="${tip}"`);
      expect(classesOf(button), name).toEqual(expect.arrayContaining(["w-9", "h-9"]));
      expect(button, name).toContain('viewBox="0 0 256 256"');
    }
  });

  it("keeps the title white on the dark gradient, with a shadow behind it", async () => {
    const html = await settings();
    const title = html.match(/<p[^>]*>Mural<\/p>/)?.[0] ?? "";
    expect(classesOf(title)).toContain("text-white");
    expect(html).toContain("from-black/70");
    expect(html).toMatch(/<div[^>]*text-shadow-[^>]*><p[^>]*>Mural<\/p>/);
  });
});
