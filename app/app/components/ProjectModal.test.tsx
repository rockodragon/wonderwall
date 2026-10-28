import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

// The sheet with convex/react stubbed: no member, no communities, no
// organizations, so the pickers draw nothing and the rest is the sheet itself.
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => ({ projectId: "p1" }),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

import {
  DraftChoice,
  PROJECT_STEPS,
  ProjectModal,
  canSaveDraft,
  closeStep,
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

// Drafts (Rick, 2026-10-28): a new project can be saved for later, like
// Instagram, once it has a title; only its lead sees it, and it is published
// from its page (routes/projects.$id.tsx).
describe("ProjectModal drafts", () => {
  const buttons = (html: string) =>
    [...html.matchAll(/<button[^>]*type="(?:button|submit)"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);

  it("offers Save draft only once a title is typed", () => {
    expect(buttons(sheet())).not.toContain("Save draft");
    expect(buttons(sheet({ initialTitle: "   " }))).not.toContain("Save draft");
    for (const step of PROJECT_STEPS) {
      expect(buttons(sheet({ initialTitle: "A film about Nana", initialStep: step.id }))).toContain("Save draft");
    }
  });

  it("puts it between Back and Next, and between Back and Post it", () => {
    expect(buttons(sheet({ initialTitle: "A film", initialStep: "about" })).slice(-3)).toEqual(["Back", "Save draft", "Next"]);
    const last = buttons(sheet({ initialTitle: "A film", initialStep: "details" }));
    expect(last.slice(-3)).toEqual(["Back", "Save draft", "Post it"]);
    expect(buttons(sheet({ initialTitle: "A film", initialStep: "name" })).slice(-3)).toEqual(["Cancel", "Save draft", "Next"]);
  });

  it("keeps it out of an edit, which has its own Save changes", () => {
    for (const step of PROJECT_STEPS) {
      expect(buttons(sheet({ edit: EDIT, initialStep: step.id }))).not.toContain("Save draft");
    }
  });

  it("is quiet, beside the primary: outlined, 44px tall, not the citron button", () => {
    const html = sheet({ initialTitle: "A film" });
    const draft = html.match(/<button[^>]*>Save draft<\/button>/)?.[0] ?? "";
    expect(draft).toMatch(/\bmin-h-11\b/);
    expect(draft).toMatch(/\bborder\b/);
    expect(draft).not.toContain("garden-citron");
  });

  it("knows when a draft can be saved", () => {
    expect(canSaveDraft("A film")).toBe(true);
    expect(canSaveDraft("  A film ")).toBe(true);
    expect(canSaveDraft("")).toBe(false);
    expect(canSaveDraft("   ")).toBe(false);
    expect(canSaveDraft("A film", { projectId: "p1" })).toBe(false);
  });
});

describe("closing a new project with a title typed", () => {
  it("asks first, from the X, Cancel, Escape and Back alike (they share one answer)", () => {
    expect(closeStep({ edit: false, title: "A film", asking: false })).toBe("ask");
    expect(closeStep({ edit: false, title: " A film ", asking: false })).toBe("ask");
  });

  it("closes as before with no title, and for an edit", () => {
    expect(closeStep({ edit: false, title: "", asking: false })).toBe("close");
    expect(closeStep({ edit: false, title: "   ", asking: false })).toBe("close");
    expect(closeStep({ edit: true, title: "My film", asking: false })).toBe("close");
  });

  it("keeps editing when the question is already up (Escape or Back on it)", () => {
    expect(closeStep({ edit: false, title: "A film", asking: true })).toBe("keep");
  });

  it("is not showing until a close is asked for", () => {
    const html = sheet({ initialTitle: "A film" });
    expect(html).not.toContain("Save as a draft?");
    expect(html).not.toContain("alertdialog");
    expect(html).not.toContain("Keep editing");
  });

  it("puts the three choices in order: Save draft, Discard, Keep editing, each 44px tall", () => {
    const html = renderToStaticMarkup(<DraftChoice onSave={() => {}} onDiscard={() => {}} onKeep={() => {}} />);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("Save as a draft?");
    const labels = [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);
    expect(labels).toEqual(["Save draft", "Discard", "Keep editing"]);
    for (const button of html.match(/<button[^>]*>/g) ?? []) expect(button).toMatch(/\bmin-h-11\b/);
  });

  it("names its heading for a screen reader", () => {
    const html = renderToStaticMarkup(<DraftChoice onSave={() => {}} onDiscard={() => {}} onKeep={() => {}} />);
    const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy}"`);
  });
});
