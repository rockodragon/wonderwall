import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ProjectCard } from "./projects";
import type { ProjectsLens } from "../lib/browse/projectsFilter";

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
  it("says Project, or Seeking funding for one asking for backers", () => {
    expect(card({}, "projects")).toContain(">Project<");
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
    expect(html).not.toContain("Cheer them on");
    expect(html).not.toContain("Back this");
  });
  it("is the project, with a count of people, anywhere else", () => {
    const html = card(withRole, "projects");
    expect(html).toContain(">Project<");
    expect(html).toMatch(/<h3[^>]*>Harbor Mural<\/h3>/);
    expect(html).toContain("Looking for 2 people");
    expect(html).toContain("Cheer them on");
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

describe("a funding card", () => {
  it("offers Back this beside Cheer them on", () => {
    const html = card({ goal: 500, raisedCents: 12_000 }, "funding");
    expect(html).toContain("Cheer them on");
    expect(html).toContain("Back this");
  });
});
