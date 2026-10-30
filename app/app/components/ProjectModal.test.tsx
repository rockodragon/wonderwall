import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

// The sheet with convex/react stubbed: no member, no communities, no
// organizations, so the pickers draw nothing and the rest is the sheet itself.
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => ({ projectId: "p1" }),
  // useTalk's transcriber (the recorder fallback); never called in a server render.
  useAction: () => async () => ({ text: "" }),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

import {
  PROJECT_STEPS,
  ProjectModal,
  postedStage,
  stepAfter,
  stepBefore,
  stepTitle,
  type ProjectEditTarget,
  type ProjectStep,
} from "./ProjectModal";

const sheet = (props: Partial<React.ComponentProps<typeof ProjectModal>> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ProjectModal onClose={() => {}} {...props} />
    </MemoryRouter>,
  );

const EDIT: ProjectEditTarget = { projectId: "p1" as ProjectEditTarget["projectId"], title: "My film" };

/** The screens that are showing: a panel with "hidden" among its classes is not. */
function visibleScreens(html: string): string[] {
  return [...html.matchAll(/<div data-step="(\w+)" class="([^"]*)"/g)]
    .filter((m) => !m[2].split(" ").includes("hidden"))
    .map((m) => m[1]);
}

// The stepper's reading ("Step 1 of 4") and the screen's heading.
const progress = (html: string) => {
  const step = html.match(/aria-label="Step (\d) of (\d)"/)?.slice(1, 3);
  const heading = html.match(/<h2[^>]*>([^<]+)<\/h2>/)?.[1];
  return step && heading ? [...step, heading] : undefined;
};

describe("ProjectModal screens", () => {
  it("has four, one thing each, in this order", () => {
    expect(PROJECT_STEPS.map((s) => [s.id, s.title])).toEqual([
      ["name", "What are you making?"],
      ["about", "Say a bit about it"],
      ["show", "Show it"],
      ["details", "Details"],
    ]);
  });

  it("shows one screen at a time, its question as the heading over the stepper", () => {
    for (const [i, s] of PROJECT_STEPS.entries()) {
      const html = sheet({ initialStep: s.id });
      expect(visibleScreens(html)).toEqual([s.id]);
      expect(progress(html)).toEqual([String(i + 1), "4", s.title]);
    }
  });

  it("never repeats the sheet's name over the screens (Rick, 2026-10-27)", () => {
    for (const s of PROJECT_STEPS) {
      const html = sheet({ initialStep: s.id });
      expect(html).not.toContain("Start a project");
      expect(html.match(/<h2/g)?.length).toBe(1);
    }
    expect(sheet({ initialStage: "completed" })).not.toContain("Share your work");
    expect(sheet({ edit: EDIT })).not.toContain("Edit project");
  });

  it("opens on the first, and 'show' opens on the third (the project page's Add a link)", () => {
    expect(visibleScreens(sheet())).toEqual(["name"]);
    const html = sheet({ edit: EDIT, initialStep: "show" });
    expect(visibleScreens(html)).toEqual(["show"]);
    expect(progress(html)).toEqual(["3", "4", "Show it"]);
  });

  it("names the field when editing, instead of asking", () => {
    expect(progress(sheet({ edit: EDIT }))).toEqual(["1", "4", "Title"]);
    expect(progress(sheet({ edit: EDIT, initialStep: "about" }))).toEqual(["2", "4", "About it"]);
    expect(stepTitle("name", false, true)).toBe("Title");
  });

  it("walks forward and back, and stops at the ends", () => {
    const ids = PROJECT_STEPS.map((s) => s.id);
    const forward: ProjectStep[] = [ids[0]];
    while (stepAfter(forward[forward.length - 1]) !== forward[forward.length - 1]) {
      forward.push(stepAfter(forward[forward.length - 1]));
    }
    expect(forward).toEqual(ids);
    expect([...ids].reverse().map(stepBefore)).toEqual(["show", "about", "name", "name"]);
  });

  it("keeps every field mounted, so Back finds the title where it was left", () => {
    const html = sheet({ initialStep: "details", initialTitle: "A film about Nana" });
    expect(visibleScreens(html)).toEqual(["details"]);
    expect(html).toMatch(/<input[^>]*value="A film about Nana"/);
    for (const s of PROJECT_STEPS) expect(html).toContain(`data-step="${s.id}"`);
  });

  it("no longer talks about inviting people", () => {
    const html = sheet();
    expect(html).not.toContain("add the people you need");
    expect(html).not.toContain("ask for support");
    expect(html).not.toContain("Say what you");
  });
});

describe("ProjectModal first screen", () => {
  it("asks for the title and where it is: three stages, none picked", () => {
    const html = sheet();
    expect(html).toContain("What are you making?");
    for (const label of ["Thinking about it", "Working on it", "Finished it"]) {
      expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="false"[^>]*>${label}</button>`));
    }
  });

  it("hides the stages when the link already said which, and a finished one asks 'made'", () => {
    const working = sheet({ initialStage: "working" });
    expect(working).not.toContain("Thinking about it");
    expect(working).toContain("What are you making?");

    const done = sheet({ initialStage: "completed" });
    expect(done).not.toContain("Thinking about it");
    expect(done).not.toContain("Finished it");
    expect(done).toContain("What did you make?");
    expect(done).not.toContain("What are you making?");
    expect(stepTitle("name", true)).toBe("What did you make?");
    expect(stepTitle("about", true)).toBe("Say a bit about it");
  });

  it("never asks the stage when editing", () => {
    const html = sheet({ edit: EDIT });
    expect(html).not.toContain("Thinking about it");
    expect(html).not.toContain("What are you making?");
  });

  it("posts the stage the link asked for, else the one picked, else none", () => {
    expect(postedStage(undefined, "working")).toBe("working");
    expect(postedStage("completed", undefined)).toBe("completed");
    expect(postedStage("completed", "planning")).toBe("completed");
    expect(postedStage(undefined, undefined)).toBeUndefined();
  });
});

describe("ProjectModal buttons", () => {
  const buttons = (html: string) => [...html.matchAll(/<button[^>]*type="(?:button|submit)"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);

  it("Cancel and Next at the start; Back and Next after; Back and Post it at the end", () => {
    expect(buttons(sheet({ initialStep: "name" }))).toEqual(expect.arrayContaining(["Cancel", "Next"]));
    expect(buttons(sheet({ initialStep: "name" }))).not.toContain("Back");
    for (const step of ["about", "show"] as const) {
      const b = buttons(sheet({ initialStep: step }));
      expect(b).toEqual(expect.arrayContaining(["Back", "Next"]));
      expect(b).not.toContain("Cancel");
    }
    const last = buttons(sheet({ initialStep: "details" }));
    expect(last).toEqual(expect.arrayContaining(["Back", "Post it"]));
    expect(last).not.toContain("Next");
    expect(last).not.toContain("Create project");
  });

  it("saves changes, rather than posts, when editing", () => {
    expect(buttons(sheet({ edit: EDIT, initialStep: "details" }))).toContain("Save changes");
  });

  it("keeps the close button's 44px tap target", () => {
    expect(sheet()).toMatch(/aria-label="Close"[^>]*class="[^"]*\bw-11 h-11\b/);
  });
});

describe("ProjectModal description box", () => {
  const box = (props: Partial<React.ComponentProps<typeof ProjectModal>> = {}) =>
    sheet({ initialStep: "about", ...props }).match(/<textarea[^>]*>[^<]*<\/textarea>/)?.[0] ?? "";

  it("is the shared four-row talk-or-type box, plain where the browser can't listen (a server render)", () => {
    const html = box();
    expect(html).toMatch(/id="[^"]*-blurb"/);
    expect(html).toContain('rows="4"');
    expect(html).toMatch(/placeholder="What you(?:'|&#x27;)re making, and why"/);
    expect(html).toMatch(/class="[^"]*\bresize-none\b[^"]*\btext-\[17px\]/);
    expect(sheet({ initialStep: "about" })).not.toContain('aria-label="Talk instead"');
  });

  it("asks what you made for finished work, and holds a project's saved words when editing", () => {
    expect(box({ initialStage: "completed" })).toContain('placeholder="What you made, and why"');
    expect(box({ edit: { ...EDIT, blurb: "A short film." } })).toContain(">A short film.</textarea>");
  });
});
