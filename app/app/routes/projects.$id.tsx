// /projects/:id — a single project's public detail page (spec §5). Actions
// ("Back this project" / "Apply") are display-only for now — real
// backing/applying needs Stripe + auth wiring — but the button stays
// visible; it communicates intent per founder instruction, it just doesn't
// fake a payment.

import { useState } from "react";
import { useQuery } from "convex/react";
import { Link, useParams, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenErrorState,
  GardenLoading,
  GardenNav,
  GardenPage,
  SectionLabel,
  formatPeriod,
} from "../garden/ui";
import "../garden/garden.css";

export function meta({ data }: { data?: { title?: string } }) {
  return [
    { title: data?.title ? `${data.title} — The Garden` : "Project — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError(); // logged by the framework; the page just degrades warmly
  return (
    <GardenPage wide>
      <GardenNav active="Projects" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This project isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

type CreditEntry = { orgName: string; period: string; amount: number };

type ProjectDetail = {
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
  credits: CreditEntry[];
};

function KindBadge({ project }: { project: ProjectDetail }) {
  return project.kind === "passion" ? (
    <span className="g-badge g-badge-line">Passion</span>
  ) : (
    <span className="g-badge g-badge-citron">
      Paid{project.budget !== undefined ? ` · $${project.budget.toLocaleString()}` : ""}
    </span>
  );
}

/** Goal bar for a passion project: paper fill with a 2px citron cap — never
 * a citron fill (citron is reserved for actions/tiny badges, same rule as
 * the demo's ProjectDetail treatment this mirrors). */
function GoalBar({ goal, raisedCents }: { goal: number; raisedCents?: number }) {
  const raisedDollars = (raisedCents ?? 0) / 100;
  const pct = Math.min(100, (raisedDollars / goal) * 100);
  return (
    <div style={{ marginTop: 22, maxWidth: 360 }}>
      <div className="g-label">Goal</div>
      <div
        style={{
          marginTop: 8,
          height: 6,
          borderRadius: 3,
          background: "var(--g-hairline)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: "var(--g-paper)",
            borderRight: "2px solid var(--g-citron)",
          }}
        />
      </div>
      <p style={{ marginTop: 8, fontSize: 15, color: "var(--g-paper)" }}>
        ${raisedDollars.toLocaleString()} of ${goal.toLocaleString()}
      </p>
    </div>
  );
}

function ActionButton({ project }: { project: ProjectDetail }) {
  const [clicked, setClicked] = useState(false);
  const label = project.kind === "passion" ? "Back this project" : "Apply";
  return (
    <div style={{ marginTop: 24 }}>
      <button type="button" className="g-btn g-btn-citron" onClick={() => setClicked(true)}>
        {label}
      </button>
      {clicked && (
        <p className="g-hint" style={{ marginTop: 10 }}>
          Backing opens when memberships go live this fall.
        </p>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  // Hooks stay above every early return (React rules-of-hooks).
  const project = useQuery(
    api.garden.projectsPublic.getProject,
    id ? { projectId: id } : "skip",
  ) as ProjectDetail | null | undefined;

  if (project === undefined) {
    return (
      <GardenPage wide>
        <GardenNav active="Projects" />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (project === null) {
    return (
      <GardenPage wide>
        <GardenNav active="Projects" />
        <div style={{ marginTop: 28 }}>
          <GardenErrorState message="Check the link — this project isn't set up here." />
        </div>
      </GardenPage>
    );
  }

  return (
    <GardenPage wide>
      <GardenNav active="Projects" />
      <Link
        to="/projects"
        className="g-mono"
        style={{
          display: "inline-block",
          marginTop: 20,
          fontSize: 12.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--g-muted)",
          textDecoration: "none",
        }}
      >
        ← All projects
      </Link>

      <div style={{ marginTop: 20, maxWidth: 640 }}>
        {project.photoUrl && (
          <img
            src={project.photoUrl}
            alt=""
            style={{
              width: "100%",
              height: 280,
              objectFit: "cover",
              borderRadius: 8,
              display: "block",
              filter: "saturate(0.85)",
            }}
          />
        )}

        <div style={{ marginTop: 16 }}>
          <KindBadge project={project} />
        </div>
        <h1 className="g-h" style={{ marginTop: 12, fontSize: "clamp(26px,4.5vw,36px)" }}>
          {project.title}
        </h1>
        <div className="g-credit" style={{ marginTop: 8 }}>
          <b>{project.byName}</b>
        </div>
        {project.blurb && (
          <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6 }}>{project.blurb}</p>
        )}

        {project.kind === "passion" && project.goal !== undefined && project.goal > 0 ? (
          <GoalBar goal={project.goal} raisedCents={project.raisedCents} />
        ) : (
          <p style={{ marginTop: 22, fontSize: 14.5, color: "var(--g-paper)" }}>
            {project.moneyLine}
          </p>
        )}

        {project.credits.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <SectionLabel>Credits</SectionLabel>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {project.credits.map((credit, i) => (
                <p key={`${credit.orgName}-${credit.period}-${i}`} style={{ fontSize: 14.5 }}>
                  Funded by the {credit.orgName} Fund — ${credit.amount.toLocaleString()} ·{" "}
                  {formatPeriod(credit.period)}
                </p>
              ))}
            </div>
          </div>
        )}

        {project.storySlug && (
          <div style={{ marginTop: 20 }}>
            <Link to={`/story/${project.storySlug}`} style={{ fontSize: 14.5, color: "var(--g-citron)" }}>
              Read the story →
            </Link>
          </div>
        )}

        <ActionButton project={project} />
      </div>
    </GardenPage>
  );
}
