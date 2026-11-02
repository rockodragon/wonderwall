import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { PostActions, PostMaker, PostTitle, ProjectCover } from "./ProjectPost";
import type { PostViewer } from "../lib/projectPick";

// The parts Today's Open projects and the Projects tab's cards share. Save is
// a Convex-backed button, so the hooks are stood in for.
vi.mock("../lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/featureFlags")>()),
  FF_BACKING: true,
}));
const asked = vi.hoisted(() => ({ saves: [] as { targetType: string; targetId: string }[] }));
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (_fn: unknown, args?: { targetType: string; targetId: string }) => {
    if (typeof args === "object" && args && "targetType" in args) asked.saves.push(args);
    return undefined;
  },
  useMutation: () => async () => {},
  useAction: () => async () => {},
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

const draw = (node: React.ReactNode) => renderToString(<MemoryRouter>{node}</MemoryRouter>).replace(/<!-- -->/g, "");
const classesOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");

const project = {
  _id: "p1",
  userId: "u-dana",
  status: "active",
  title: "Harbor Mural",
  supportCount: 2,
  raising: true,
  creator: { _id: "dana", name: "Dana Lee", imageUrl: null },
  community: { name: "The Garden" },
};
const member: PostViewer = { signedIn: true, profile: { userId: "u-me" } };

describe("PostMaker", () => {
  it("is the maker's header, lifted above the stretched link, with 4px under it", () => {
    const html = draw(<PostMaker project={project} />);
    expect(classesOf(html.match(/<div [^>]*>/)![0])).toEqual(expect.arrayContaining(["relative", "z-10", "w-fit", "max-w-full", "mb-1"]));
    expect(html).toContain('href="/profile/dana"');
    expect(html).toContain(">Dana Lee<");
    expect(html).toContain(">in The Garden<");
  });

  it("is an organization's page when posted as one, and says no community when there is none", () => {
    const html = draw(<PostMaker project={{ organization: { name: "Harbor Light", slug: "harbor-light" } }} />);
    expect(html).toContain('href="/orgs/harbor-light"');
    expect(html).not.toContain(" in ");
  });

  it("draws nothing for a project nobody made", () => {
    expect(draw(<PostMaker project={{}} />)).toBe("");
  });

  it("takes the caller's placement after its own classes", () => {
    const html = draw(<PostMaker project={project} className="md:mb-5 md:col-start-2" />);
    expect(html).toMatch(/<div class="relative z-10 w-fit max-w-full mb-1 md:mb-5 md:col-start-2">/);
  });
});

describe("ProjectCover", () => {
  it("crops a picture to fill the square, and is the abstract cover in the same square without one", () => {
    const picture = draw(<ProjectCover cover="/c.jpg" seed="p1" square />);
    expect(picture).toContain("aspect-square");
    expect(picture).toContain("object-cover");
    // A list's pictures load as they near the screen.
    expect(picture).toContain('loading="lazy"');
    const bare = draw(<ProjectCover cover={null} seed="p1" square />);
    expect(bare).toContain("aspect-square");
    expect(bare).toContain('<svg viewBox="0 0 160 100"');
    expect(draw(<ProjectCover cover={null} seed="p1" />)).toContain("aspect-[4/5]");
  });
});

describe("PostTitle", () => {
  it("is the first line of the words, under the picture, when there is one", () => {
    const html = draw(<PostTitle title="Harbor Mural" hasCover />);
    expect(classesOf(html.match(/<div [^>]*>/)![0])).toContain("mt-3");
    expect(classesOf(html.match(/<h3 [^>]*>/)![0])).toEqual(expect.arrayContaining(["text-[17px]", "font-semibold", "line-clamp-2"]));
    expect(html).not.toContain("md:");
  });

  it("is set large on the abstract cover, in the picture's own grid cell, when there isn't", () => {
    const html = draw(<PostTitle title="Harbor Mural" hasCover={false} />);
    expect(classesOf(html.match(/<div [^>]*>/)![0])).toEqual(
      expect.arrayContaining(["relative", "z-10", "col-start-1", "row-start-1", "self-end", "pt-20"]),
    );
    expect(classesOf(html.match(/<h3 [^>]*>/)![0])).toEqual(expect.arrayContaining(["text-[34px]", "font-bold", "line-clamp-4"]));
  });

  it("moves into the words column at md only when the caller sets the post wide", () => {
    const wide = draw(<PostTitle title="T" hasCover wide />);
    expect(classesOf(wide.match(/<h3 [^>]*>/)![0])).toEqual(
      expect.arrayContaining(["md:text-[30px]", "md:leading-tight", "md:line-clamp-none", "md:font-semibold"]),
    );
    expect(classesOf(wide.match(/<div [^>]*>/)![0])).toContain("md:mt-0");
    expect(draw(<PostTitle title="T" hasCover />)).not.toContain("md:");
  });

  it("is named for the heading it is, and underlines with its link", () => {
    const html = draw(<PostTitle title="Harbor Mural" hasCover />);
    expect(html).toMatch(/<h3 [^>]*>Harbor Mural<\/h3>/);
    expect(classesOf(html.match(/<h3 [^>]*>/)![0])).toEqual(expect.arrayContaining(["group-hover:underline", "group-focus-visible:underline"]));
  });
});

describe("PostActions", () => {
  const row = (over: Partial<Parameters<typeof PostActions>[0]> = {}) =>
    draw(<PostActions project={project} viewer={member} support onSupport={() => {}} {...over} />);

  it("is Cheer with its count, Back this while raising, then Save at the far right, each named for the project", () => {
    const html = row();
    expect(html.indexOf('aria-label="Cheer Harbor Mural"')).toBeLessThan(html.indexOf('aria-label="Back Harbor Mural"'));
    expect(html.indexOf('aria-label="Back Harbor Mural"')).toBeLessThan(html.indexOf('aria-label="Save Harbor Mural"'));
    expect(html).toContain(">2<");
    expect(html).toMatch(/<div class="ml-auto[^"]*"><button/);
    expect(html).not.toContain('aria-label="Cheer"');
  });

  it("offers no Back this when the project isn't raising", () => {
    expect(row({ project: { ...project, raising: false } })).not.toContain('aria-label="Back ');
  });

  it("offers no Cheer or Back when the post isn't one to back, and keeps Save", () => {
    const html = row({ support: false });
    expect(html).not.toContain("Cheer");
    expect(html).not.toContain('aria-label="Back ');
    expect(html).toContain('aria-label="Save Harbor Mural"');
  });

  it("saves a role instead of the project when the post leads with one, named for it, under the same rule", () => {
    asked.saves = [];
    const role = { roleId: "r1", title: "Drummer" };
    const html = row({ role });
    expect(html).toContain('aria-label="Save Drummer"');
    expect(html).not.toContain("Save Harbor Mural");
    expect(asked.saves).toEqual([{ targetType: "role", targetId: "r1" }]);
    expect(row({ role, viewer: { signedIn: false, profile: null } })).not.toContain("Save");
    expect(row({ role, project: { ...project, userId: "u-me" } })).not.toContain("Save");
    asked.saves = [];
    expect(row({ role: null })).toContain('aria-label="Save Harbor Mural"');
    expect(asked.saves).toEqual([{ targetType: "project", targetId: "p1" }]);
  });

  it("offers Save by canSaveProject: not on your own project, signed out, before the profile loads, or on a hidden one", () => {
    expect(row({ project: { ...project, userId: "u-me" } })).not.toContain("Save");
    expect(row({ viewer: { signedIn: false, profile: null } })).not.toContain("Save");
    expect(row({ viewer: { signedIn: true, profile: undefined } })).not.toContain("Save");
    expect(row({ project: { ...project, status: "pending" } })).not.toContain("Save");
  });

  it("lifts each group above the stretched link and puts the caller's placement after its own classes", () => {
    const html = row({ className: "md:mt-6 md:row-start-7" });
    expect(html).toMatch(/^<div class="mt-1 flex items-center md:mt-6 md:row-start-7">/);
    for (const group of [html.match(/<div class="([^"]*-ml-\[9px\][^"]*)">/), html.match(/<div class="(ml-auto[^"]*)">/)]) {
      expect(group![1].split(" ")).toEqual(expect.arrayContaining(["relative", "z-10"]));
    }
  });
});
