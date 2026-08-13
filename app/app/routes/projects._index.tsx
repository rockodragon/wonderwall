// /projects — the public Projects browse grid (spec §5): the missing "how do
// I even see creative work" surface. `projects` holds both kind "passion"
// (goal/raisedCents/storySlug) and kind "paid" (budget) rows — a legacy
// `jobs` migration lands both into this table, so the page must read cleanly
// whether it's empty or fully populated. Filter chips reuse the demo.app.tsx
// / tables._index.tsx chip pattern (aria-pressed, one active at a time).

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenErrorState,
  GardenLoading,
  GardenNav,
  GardenPage,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Projects — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError(); // logged by the framework; the page just degrades warmly
  return (
    <GardenPage wide>
      <GardenNav active="Projects" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="Projects isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

type ProjectCard = {
  id: string;
  kind: "passion" | "paid";
  title: string;
  blurb?: string;
  byName: string;
  photoUrl?: string;
  budget?: number;
  goal?: number;
  raisedCents?: number;
  storySlug?: string;
  moneyLine: string;
};

type Filter = "All" | "Passion" | "Paid";
const FILTER_OPTIONS: readonly Filter[] = ["All", "Passion", "Paid"];

function FilterChips({
  active,
  onSelect,
}: {
  active: Filter;
  onSelect: (v: Filter) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          className="g-demo-chip"
          data-active={active === opt}
          aria-pressed={active === opt}
          onClick={() => onSelect(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function KindBadge({ project }: { project: ProjectCard }) {
  return project.kind === "passion" ? (
    <span className="g-badge g-badge-line">Passion</span>
  ) : (
    <span className="g-badge g-badge-citron">
      Paid{project.budget !== undefined ? ` · $${project.budget.toLocaleString()}` : ""}
    </span>
  );
}

function ProjectCardView({ project }: { project: ProjectCard }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      aria-label={project.title}
      className="g-card"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        padding: 0,
        overflow: "hidden",
      }}
    >
      {project.photoUrl && (
        <img src={project.photoUrl} alt="" className="g-photo-strip" style={{ borderRadius: "10px 10px 0 0" }} />
      )}
      <div style={{ padding: "16px 20px 20px" }}>
        <KindBadge project={project} />
        <div className="g-h" style={{ fontSize: 17, marginTop: 10 }}>
          {project.title}
        </div>
        <div className="g-credit" style={{ marginTop: 6 }}>
          <b>{project.byName}</b>
        </div>
        {project.blurb && (
          <p
            style={{
              marginTop: 8,
              fontSize: 14.5,
              lineHeight: 1.5,
              color: "var(--g-muted)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {project.blurb}
          </p>
        )}
        <p style={{ marginTop: 10, fontSize: 14.5, color: "var(--g-paper)" }}>
          {project.moneyLine}
        </p>
      </div>
    </Link>
  );
}

export default function ProjectsIndex() {
  const [filter, setFilter] = useState<Filter>("All");
  const kindArg = filter === "Passion" ? "passion" : filter === "Paid" ? "paid" : undefined;
  const projects = useQuery(api.garden.projectsPublic.listProjects, { kind: kindArg }) as
    | ProjectCard[]
    | undefined;

  // Hooks stay above every early return (React rules-of-hooks).
  const shown = useMemo(() => projects ?? [], [projects]);

  if (projects === undefined) {
    return (
      <GardenPage wide>
        <GardenNav active="Projects" />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (projects.length === 0 && filter === "All") {
    return (
      <GardenPage wide>
        <GardenNav active="Projects" />
        <div style={{ marginTop: 28, maxWidth: "50ch" }}>
          <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
            Projects
          </h1>
          <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5 }}>
            Creative work seeking support, and paid work seeking creatives.
          </p>
          <p style={{ marginTop: 20, fontSize: 15, lineHeight: 1.6 }}>
            The first projects land this fall — creatives are just getting
            seated.
          </p>
          <Link
            to="/garden"
            className="g-mono"
            style={{
              display: "inline-block",
              marginTop: 16,
              fontSize: 12.5,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--g-muted)",
            }}
          >
            ← Back to The Garden
          </Link>
        </div>
      </GardenPage>
    );
  }

  return (
    <GardenPage wide>
      <GardenNav active="Projects" />
      <div style={{ marginTop: 28, marginBottom: 24 }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          Projects
        </h1>
        <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, maxWidth: "58ch" }}>
          Creative work seeking support, and paid work seeking creatives.
        </p>
      </div>

      <FilterChips active={filter} onSelect={setFilter} />

      {shown.length === 0 ? (
        <p style={{ marginTop: 24, fontSize: 14.5, color: "var(--g-muted)" }}>
          Nothing in this filter yet — try another, or check back soon.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 14,
            marginTop: 20,
          }}
        >
          {shown.map((project) => (
            <ProjectCardView key={project.id} project={project} />
          ))}
        </div>
      )}
    </GardenPage>
  );
}
