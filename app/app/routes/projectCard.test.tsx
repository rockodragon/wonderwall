import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ProjectCard } from "./projects";
import type { ProjectsLens } from "../lib/browse/projectsFilter";

// Backing is off by default (FF_BACKING). These cards are drawn with it open
// unless a test shuts it, so the Back this icon stays covered.
const flags = vi.hoisted(() => ({ backing: true }));
vi.mock("../lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/featureFlags")>()),
  get FF_BACKING() {
    return flags.backing;
  },
}));
afterEach(() => {
  flags.backing = true;
});

function card(project: Record<string, unknown>, lens: ProjectsLens = "projects") {
  const full = {
    _id: "p1",
    kind: "passion",
    status: "active",
    title: "Harbor Mural",
    media: [],
    creator: { name: "Dana Lee" },
    interests: [],
    openRoles: [],
    ...project,
  };
  // React marks the seams between text pieces; they are not in the page.
  return renderToString(
    <MemoryRouter>
      <ProjectCard project={full} lens={lens} onSupport={() => {}} />
    </MemoryRouter>,
  ).replace(/<!-- -->/g, "");
}

const drummer = { roleId: "r1", title: "Drummer", budgetType: "amount", budget: 200, budgetMax: null };
const stagehand = { roleId: "r2", title: "Stagehand", budgetType: "volunteer", budget: null, budgetMax: null };
const job = { kind: "paid", title: "Logo for a bakery", budgetType: "amount", budget: 400 };
const gig = {
  kind: "paid",
  title: "Friday jazz",
  budgetType: "amount",
  budget: 300,
  gig: { status: "open", venueName: "The Grove", cadence: "Every Friday", timeRange: "8–10pm", schedule: "Every Friday · 8–10pm", nextDateLabel: "Fri, Oct 9", openCount: 3 },
};

describe("a project card's first line", () => {
  it("says Job for one-off paid work, with its pay beside it", () => {
    const html = card(job, "work");
    expect(html).toContain(">Job<");
    expect(html).toContain(">$400<");
    expect(html).not.toContain(">Paid<");
  });
  it("says Recurring gig with the schedule, and the pay per date", () => {
    const html = card(gig, "work");
    expect(html).toContain(">Recurring gig · Fridays 8–10pm<");
    expect(html).toContain(">$300/date<");
    // The schedule line in the body is still there.
    expect(html).toContain("The Grove");
    expect(html).toContain("3");
  });
  it("says Volunteer for an unpaid posting, with no money pill", () => {
    const html = card({ ...job, budgetType: "volunteer", budget: undefined }, "people");
    expect(html).toContain(">Volunteer<");
    expect(html).not.toContain("$");
    expect(html).not.toContain(">Job<");
  });
  it("says nothing for a plain project, and Seeking funding for one asking for backers", () => {
    const plain = card({}, "projects");
    expect(plain).not.toContain(">Project<");
    expect(plain).not.toMatch(/uppercase[^"]*line-clamp-2/);
    expect(card({ goal: 500, raisedCents: 0 }, "funding")).toContain(">Seeking funding<");
  });
});

describe("a project card under Jobs and gigs", () => {
  const withRole = { openRoles: [drummer, stagehand] };

  it("leads with the paid role and its pay: Role on {project} · Paid", () => {
    const html = card(withRole, "work");
    expect(html).toContain(">Role on Harbor Mural · Paid<");
    expect(html).toMatch(/<h3[^>]*>Drummer<\/h3>/);
    expect(html).toContain(">$200<");
  });
  it("lists the other open roles, not the one it leads with twice", () => {
    const html = card(withRole, "work");
    expect(html.match(/Drummer/g)?.length).toBe(1);
    expect(html).toContain("Stagehand");
    expect(html).toContain(">Volunteer<");
  });
  it("offers no support buttons: this is work, not a project to back", () => {
    const html = card(withRole, "work");
    expect(html).not.toContain('aria-label="Cheer"');
    expect(html).not.toContain('aria-label="Back this"');
  });
  it("is the project, with a count of people, anywhere else", () => {
    const html = card(withRole, "projects");
    expect(html).not.toContain(">Project<");
    expect(html).toMatch(/<h3[^>]*>Harbor Mural<\/h3>/);
    expect(html).toContain("Looking for 2 people");
    expect(html).toContain('aria-label="Cheer"');
  });
  it("spells the roles out under Seeking people, with their pay", () => {
    const html = card(withRole, "people");
    expect(html).toMatch(/<h3[^>]*>Harbor Mural<\/h3>/);
    expect(html).toContain("Drummer");
    expect(html).toContain("$200");
    expect(html).toContain("Stagehand");
    expect(html).not.toContain("Looking for 2 people");
  });
  it("does not lead with a role that never said what it pays", () => {
    const html = card({ openRoles: [{ roleId: "r3", title: "Writer", budgetType: null, budget: null, budgetMax: null }] }, "work");
    expect(html).toMatch(/<h3[^>]*>Harbor Mural<\/h3>/);
    expect(html).not.toContain("Role on");
  });
});

describe("a project card's support", () => {
  it("is two icons on a funding card: Cheer, then Back this", () => {
    const html = card({ goal: 500, raisedCents: 12_000 }, "funding");
    const cheer = html.indexOf('aria-label="Cheer"');
    const back = html.indexOf('aria-label="Back this"');
    expect(cheer).toBeGreaterThan(-1);
    expect(back).toBeGreaterThan(cheer);
    expect(html).not.toContain("Cheer them on");
    // The icons are drawings, not words.
    expect(html).toMatch(/aria-label="Cheer"[^>]*>\s*<svg/);
    expect(html).toMatch(/aria-label="Back this"[^>]*>\s*<svg/);
  });
  it("has Cheer but no Back this on a funding card while backing is closed (FF_BACKING)", () => {
    flags.backing = false;
    const html = card({ goal: 500, raisedCents: 12_000 }, "funding");
    expect(html).toContain('aria-label="Cheer"');
    expect(html).not.toContain('aria-label="Back this"');
    expect(html).not.toContain("Back this");
    // How far it got is information, not a way to pay: it stays.
    expect(html).toContain("$120");
  });
  it("has no Back this on a project that isn't raising", () => {
    const html = card({}, "projects");
    expect(html).toContain('aria-label="Cheer"');
    expect(html).not.toContain('aria-label="Back this"');
  });
  it("says nothing about supporters until there is one", () => {
    const html = card({ supportCount: 0 });
    expect(html).not.toContain("No supporters yet");
    expect(html).not.toContain("supporter");
  });
  it("puts the count beside Cheer once there are supporters", () => {
    const html = card({ supportCount: 3 });
    expect(html).toMatch(/aria-label="Cheer".*?<\/button><span[^>]*>3<span class="sr-only"> supporters<\/span><\/span>/);
    expect(card({ supportCount: 1 })).toContain('<span class="sr-only"> supporter</span>');
  });
});

describe("a project card's cover", () => {
  it("is a 4:5 frame, whole, whatever shape the picture is", () => {
    const html = card({ resolvedPhotoUrl: "https://files.example/wide.jpg" });
    expect(html).toContain("aspect-[4/5]");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("16/10");
  });
  it("keeps a strip on a phone for the badges, and the full 4:5 box from sm up, when there is no picture", () => {
    const html = card({ goal: 500, raisedCents: 0 }, "funding");
    expect(html).toContain("sm:aspect-[4/5]");
    expect(html).toContain("h-16");
    expect(card(job, "work")).toContain("h-16");
  });
  it("has no strip on a phone with no picture and no badge to hold, and keeps the 4:5 box from sm up", () => {
    const html = card({});
    expect(html).not.toContain("h-16");
    expect(html).toContain("hidden sm:block sm:aspect-[4/5]");
  });
});
