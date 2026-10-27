import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => ({ ok: true }),
  useAction: () => async () => ({ ok: true }),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

import { DeskCardView } from "./DeskCard";
import { personCard, projectCard, type DeskCard, type DeskProjectInput } from "./deskCards";

const money = (cents: number) => `$${cents / 100}`;

function project(extra: Partial<DeskProjectInput> = {}): DeskCard {
  return projectCard(
    {
      _id: "p1",
      kind: "passion",
      status: "active",
      title: "Songs of Safety",
      blurb: "Twelve new hymns.",
      media: [],
      stage: "working",
      creator: { _id: "dana", name: "Dana Lee", imageUrl: "https://img/dana.jpg" },
      community: null,
      ...extra,
    },
    ["projects"],
    money,
  );
}

function render(card: DeskCard, open = false) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DeskCardView
        card={card}
        place={{ x: 24, y: 24, w: 243, h: 324, r: 0, opacity: 1, z: 30 }}
        open={open}
        inert={false}
        vh={800}
        onOpen={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
}

// The mono, spaced capitals at the top of a face.
const KICKER = /<p style="[^"]*letter-spacing:0\.2em[^"]*">([^<]*)<\/p>/;
const FOOT = /<div style="margin:10px 0 0;display:flex[^"]*">(.*?<\/span>)<\/div>/;

describe("A resting project card", () => {
  it("has no stage up top: the kicker line is not there at all", () => {
    for (const stage of ["planning", "working", "raising", "completed"]) {
      const html = render(project({ stage }));
      expect(html).not.toMatch(KICKER);
      expect(html.toUpperCase()).not.toContain(`>${stage.toUpperCase()}<`);
    }
  });

  it("holds its words at the bottom, as an organization's do, since nothing is above them", () => {
    expect(render(project())).toMatch(/<div style="position:relative;min-width:0;margin-top:auto/);
  });

  it("keeps what the kind says under Jobs and gigs: a job, a recurring gig, a paid role", () => {
    const job = render(project({ kind: "paid", budgetType: "amount", budget: 400 }));
    expect(job.match(KICKER)?.[1]).toBe("JOB");
    const gig = render(project({ kind: "paid", budgetType: "amount", budget: 150, gig: { status: "open", cadence: "Every Friday", timeRange: "8–10pm" } }));
    expect(gig.match(KICKER)?.[1]).toBe("RECURRING GIG · FRIDAYS 8–10PM");
    const role = projectCard(
      {
        _id: "p2",
        kind: "passion",
        status: "active",
        title: "Harbor Mural",
        media: [],
        creator: { _id: "dana", name: "Dana Lee", imageUrl: null },
        openRoles: [{ title: "Drummer", budgetType: "amount", budget: 200 }],
      },
      ["projects"],
      money,
      { onJobsAndGigs: true },
    );
    expect(render(role).match(KICKER)?.[1]).toBe("ROLE ON HARBOR MURAL · PAID");
  });

  it("puts the maker's picture and name on the foot line, under the title", () => {
    const html = render(project());
    const title = html.indexOf(">Songs of Safety</h3>");
    const foot = html.match(FOOT)?.[1] ?? "";
    expect(title).toBeGreaterThan(-1);
    expect(html.indexOf(foot)).toBeGreaterThan(title);
    // The small rounded square, then the name.
    expect(foot).toMatch(/<img src="https:\/\/img\/dana\.jpg"[^>]*class="[^"]*\bh-6 w-6\b[^"]*\brounded\b/);
    expect(foot.indexOf("<img")).toBeLessThan(foot.indexOf(">Dana Lee<"));
  });

  it("is the person's initial in that square when they have no picture", () => {
    const foot = render(project({ creator: { _id: "dana", name: "Dana Lee", imageUrl: null } })).match(FOOT)?.[1] ?? "";
    expect(foot).toMatch(/<span aria-hidden="true" class="[^"]*\bh-6 w-6\b[^"]*"[^>]*>D<\/span>/);
    expect(foot).toContain(">Dana Lee<");
  });

  it("is the organization's logo and name when it was posted as one", () => {
    const foot =
      render(project({ organization: { name: "Abiding Practice", slug: "abiding-practice", logoUrl: "https://img/ap.png" } })).match(FOOT)?.[1] ?? "";
    expect(foot).toContain('src="https://img/ap.png"');
    expect(foot).toMatch(/w-6 h-6 rounded-md/);
    expect(foot).toContain(">Abiding Practice<");
    expect(foot).not.toContain("Dana Lee");
  });

  it("is ringed so it reads over a picture and over a plain tone", () => {
    expect(render(project())).toMatch(/<span aria-hidden="true" style="[^"]*box-shadow:0 0 0 1px rgba\(237,227,180[^"]*"><img/);
  });

  it("puts a paid role's pay ahead of the maker's picture", () => {
    const role = projectCard(
      {
        _id: "p2",
        kind: "passion",
        status: "active",
        title: "Harbor Mural",
        media: [],
        creator: { _id: "dana", name: "Dana Lee", imageUrl: "https://img/dana.jpg" },
        openRoles: [{ title: "Drummer", budgetType: "amount", budget: 200 }],
      },
      ["projects"],
      money,
      { onJobsAndGigs: true },
    );
    const foot = render(role).match(FOOT)?.[1] ?? "";
    expect(foot.indexOf("$200")).toBeGreaterThan(-1);
    expect(foot.indexOf("$200")).toBeLessThan(foot.indexOf("<img"));
  });

  it("with nobody named, is the community in the foot, as it was", () => {
    const html = render(project({ creator: null, community: { name: "Table Art Society", slug: "tas" } }));
    expect(html).toMatch(/<p style="[^"]*">Table Art Society<\/p>/);
    expect(html).not.toContain("h-6 w-6");
  });

  it("is still a project to a screen reader, with its maker", () => {
    expect(render(project())).toContain('aria-label="Project, Songs of Safety, Dana Lee"');
  });
});

describe("Other cards", () => {
  it("keep their kicker and their plain foot", () => {
    const html = render(personCard({ _id: "ann", name: "Ann Cole", imageUrl: null, interests: ["Painter"] }));
    expect(html.match(KICKER)?.[1]).toBe("FOLLOWING");
    expect(html).toMatch(/<p style="[^"]*">Painter<\/p>/);
    expect(html).not.toContain("h-6 w-6");
  });
});
