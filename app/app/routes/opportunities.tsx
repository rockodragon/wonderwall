import { useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { budgetKindLabel } from "../lib/budgetLabel";

// /opportunities — the public browse surface. Deliberately OUTSIDE the
// _app.tsx layout: that layout sends logged-out visitors to /login
// (routes/_app.tsx:42), which is what /projects does today, so every
// "see what's being made" button on the audience pages had nowhere honest
// to land.
//
// The rule this page implements: gate participation, not viewing. A visitor
// with no account can read every posting — the money, who's asking, what the
// work is. Applying, backing and messaging still need an account.
//
// Reads convex/garden/projectsPublic.ts's listProjects, which is public and
// unauthenticated by design and already filters to visible, non-portfolio
// rows. No detail route: /projects/:id is inside the layout, and the blurb
// on the card is enough to decide with. Adding a public detail page is a
// separate call, not a side effect of this one.
//
// Styled to match routes/for.$audience.tsx (Tailwind + --garden-* tokens),
// not the g- credit-sheet system — those pages hand visitors here, and the
// hand-off shouldn't feel like a different website.

type ProjectCard = {
  id: string;
  kind: "passion" | "paid";
  title: string;
  blurb?: string;
  byName: string;
  photoUrl?: string;
  budgetType?: string;
  budget?: number;
  budgetMax?: number;
  goal?: number;
  raisedCents?: number;
  moneyLine: string;
  status?: string;
  community?: { name: string; slug: string } | null;
};

type TabId = "paid" | "passion" | "all";

// Paid work leads. A creative's first visit decides whether they come back,
// and money on the screen answers that faster than anything else here.
const TABS: { id: TabId; label: string }[] = [
  { id: "paid", label: "Paid work" },
  { id: "passion", label: "Projects to back" },
  { id: "all", label: "Everything" },
];

export function meta() {
  const title = "Open work and projects — creatives.exchange";
  const description =
    "Paid work posted by churches, businesses and nonprofits, and projects creatives are raising money to finish.";
  const image = "https://creatives.exchange/og-image.png";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}

/** The one-line "what you'd be doing about this" under each card. Paid work
    is applied to; a project is backed. Both land on /join, because both are
    the act this page doesn't let a stranger do yet. */
function actionLabel(project: ProjectCard): string {
  if (project.kind === "paid") {
    return budgetKindLabel(project) === "Volunteer"
      ? "Sign up to volunteer"
      : "Sign up to apply";
  }
  return "Sign up to back this";
}

function fundedPercent(project: ProjectCard): number | null {
  if (project.kind !== "passion") return null;
  if (!project.goal || project.goal <= 0) return null;
  const raised = (project.raisedCents ?? 0) / 100;
  return Math.max(0, Math.min(100, Math.round((raised / project.goal) * 100)));
}

function ProjectTile({ project }: { project: ProjectCard }) {
  const percent = fundedPercent(project);
  return (
    <article className="flex flex-col rounded-2xl border border-[var(--garden-hairline-raised)] bg-[var(--garden-ink-raised)]/80 overflow-hidden">
      {project.photoUrl && (
        <img
          src={project.photoUrl}
          alt=""
          className="w-full h-40 object-cover"
          loading="lazy"
        />
      )}
      <div className="flex flex-col flex-1 p-6">
        <p className="text-[var(--garden-citron)] font-semibold text-sm mb-2">
          {project.moneyLine}
        </p>
        <h2 className="text-[var(--garden-paper)] font-semibold text-lg leading-snug mb-2">
          {project.title}
        </h2>
        <p className="text-[var(--garden-dim)] text-sm mb-3">
          {project.byName}
          {project.community ? ` · ${project.community.name}` : ""}
        </p>
        {project.blurb && (
          <p className="text-[var(--garden-body)] leading-relaxed text-[15px] mb-4">
            {project.blurb.length > 200
              ? `${project.blurb.slice(0, 200).trimEnd()}…`
              : project.blurb}
          </p>
        )}
        {percent !== null && (
          <div
            className="h-1 w-full rounded-full bg-[var(--garden-hairline)] mb-4"
            aria-hidden="true"
          >
            <div
              className="h-1 rounded-full bg-[var(--garden-citron)]"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
        <div className="mt-auto pt-2">
          <Link
            to="/join"
            className="text-[var(--garden-body)] hover:text-[var(--garden-citron)] font-medium text-sm transition-colors"
          >
            {actionLabel(project)} →
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Empty is the likely first state — postings are being seeded before
    creatives are invited — so it still needs a way in rather than a dead
    end. Two lines, no consolation prize. */
function EmptyState({ tab }: { tab: TabId }) {
  const line =
    tab === "paid"
      ? "No paid work is open right now."
      : tab === "passion"
        ? "No projects are raising right now."
        : "Nothing is posted right now.";
  return (
    <div className="rounded-2xl border border-[var(--garden-hairline)] p-8 max-w-2xl">
      <p className="text-[var(--garden-paper)] font-semibold text-lg mb-2">{line}</p>
      <p className="text-[var(--garden-body)] leading-relaxed mb-6">
        Check back, or make an account and post your own.
      </p>
      <Link
        to="/join"
        className="px-6 py-3 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold inline-block hover:opacity-90 transition-all"
      >
        Join free
      </Link>
    </div>
  );
}

export default function Opportunities() {
  const [tab, setTab] = useState<TabId>("paid");
  const projects = useQuery(
    api.garden.projectsPublic.listProjects,
    tab === "all" ? {} : { kind: tab },
  ) as ProjectCard[] | undefined;

  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <header className="px-6 py-6 max-w-6xl mx-auto flex items-center justify-between gap-6">
        <Link
          to="/"
          className="text-[var(--garden-body)] hover:text-[var(--garden-paper)] text-sm font-medium transition-colors"
        >
          ← creatives.exchange
        </Link>
        <Link
          to="/login"
          className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] text-sm transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="px-6 pb-24 max-w-6xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-bold text-[var(--garden-paper)] leading-tight mb-5 max-w-3xl">
          What's open right now.
        </h1>
        <p className="text-xl text-[var(--garden-body)] max-w-2xl mb-10">
          You'll need a free account to apply or to back someone.
        </p>

        <div
          role="tablist"
          aria-label="What to browse"
          className="flex flex-wrap gap-3 mb-10"
        >
          {TABS.map((t) => {
            const isActive = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                className={
                  isActive
                    ? "px-5 py-2.5 rounded-xl font-semibold bg-[var(--garden-citron)] text-[var(--garden-ink)]"
                    : "px-5 py-2.5 rounded-xl font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors"
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {projects === undefined ? (
          <p className="text-[var(--garden-dim)] text-sm">Loading…</p>
        ) : projects.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectTile key={project.id} project={project} />
            ))}
          </div>
        )}

        <div className="mt-16 pt-10 border-t border-[var(--garden-hairline)] max-w-3xl">
          <h2 className="text-[var(--garden-paper)] text-2xl font-bold mb-3">
            Joining is free.
          </h2>
          <p className="text-[var(--garden-body)] leading-relaxed mb-6">
            An account lets you apply for work, back a project, or post your
            own.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/join"
              className="px-6 py-3 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all"
            >
              Join free
            </Link>
            <Link
              to="/for/creatives"
              className="px-6 py-3 rounded-xl font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors"
            >
              How it works for creatives
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
