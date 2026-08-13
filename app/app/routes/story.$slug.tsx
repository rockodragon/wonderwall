// /story/:slug — the public project story page (spec §1.7): photo hero,
// goal/raised bar for passion work, an updates timeline, and the credit
// block that makes fund allocations and covered seats visible on the work
// itself. Share-ready by design, but the actual OG tags come from the
// Cloudflare Pages Function (architect §5, ssr:false + ConvexHttpClient) —
// this is an SPA route with no loader, so it cannot set them itself. Not
// faking them here; see functions-spike for that piece.

import { useQuery } from "convex/react";
import { useParams, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenErrorState,
  GardenLoading,
  GardenPage,
  GardenNav,
  SectionLabel,
  formatDate,
  formatPeriod,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Story — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <GardenNav active="Projects" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This story isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

/** deriveSponsorLine (stories.ts) always yields "seat covered by {org}" — the
    org name is the citron part (g-credit's <b>), the rest is plain. */
function SponsorCredit({ line }: { line: string }) {
  const prefix = "seat covered by ";
  if (!line.startsWith(prefix)) {
    return <div className="g-credit">{line}</div>;
  }
  return (
    <div className="g-credit">
      {prefix}
      <b>{line.slice(prefix.length)}</b>
    </div>
  );
}

export default function StoryPage() {
  const { slug } = useParams();
  const data = useQuery(
    api.garden.stories.getStoryPage,
    slug ? { storySlug: slug } : "skip",
  );

  if (data === undefined) {
    return (
      <GardenPage>
        <GardenNav active="Projects" />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (data === null) {
    return (
      <GardenPage>
        <GardenNav active="Projects" />
        <div style={{ marginTop: 28 }}>
          <GardenErrorState message="Check the link — this story isn't set up here." />
        </div>
      </GardenPage>
    );
  }

  const { project, updates, credits } = data;
  const hasProgress = project.kind === "passion" && project.goal !== undefined && project.goal > 0;
  const raisedCents = project.raisedCents ?? 0;
  const goalCents = (project.goal ?? 0) * 100;

  return (
    <GardenPage>
      <GardenNav active="Projects" />

      {project.photoUrl && (
        <img
          src={project.photoUrl}
          alt={project.title}
          style={{
            width: "100%",
            height: 280,
            objectFit: "cover",
            borderRadius: 8,
            display: "block",
            marginTop: 20,
            filter: "saturate(0.85)",
          }}
        />
      )}

      <div style={{ marginTop: project.photoUrl ? 20 : 28 }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          {project.title}
        </h1>
        {project.byName && (
          <div className="g-credit" style={{ marginTop: 10 }}>
            {project.byName}
          </div>
        )}
        {project.blurb && (
          <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6, maxWidth: "62ch" }}>
            {project.blurb}
          </p>
        )}
      </div>

      {hasProgress && (
        <div style={{ marginTop: 24, maxWidth: 360 }}>
          <SectionLabel>Goal</SectionLabel>
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
                width: `${Math.min(100, (raisedCents / goalCents) * 100)}%`,
                background: "var(--g-paper)",
                borderRight: "2px solid var(--g-citron)",
              }}
            />
          </div>
          <p style={{ marginTop: 8, fontSize: 14, color: "var(--g-paper)" }}>
            ${(raisedCents / 100).toLocaleString()} of ${(goalCents / 100).toLocaleString()}
          </p>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <SectionLabel>Updates</SectionLabel>
        {updates.length === 0 ? (
          <p style={{ marginTop: 12, fontSize: 14.5 }}>
            No updates posted yet.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 0 }}>
            {updates.map((u, i) => (
              <div
                key={`${u.createdAt}-${i}`}
                style={{
                  padding: "14px 0",
                  borderBottom: "1px solid var(--g-hairline)",
                }}
              >
                <span className="g-mono" style={{ fontSize: 11, color: "var(--g-dim)" }}>
                  {formatDate(u.createdAt)}
                </span>
                <p style={{ marginTop: 6, fontSize: 14.5, lineHeight: 1.55 }}>{u.body}</p>
                {u.mediaUrl && (
                  <a
                    href={u.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13, color: "var(--g-citron)", marginTop: 6, display: "inline-block" }}
                  >
                    View media →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(credits.allocations.length > 0 || credits.sponsorLine) && (
        <div style={{ marginTop: 32 }}>
          <SectionLabel>Credits</SectionLabel>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {credits.allocations.map((c, i) => (
              <div className="g-credit" key={`${c.orgName}-${i}`}>
                Funded by the <b>{c.orgName} Fund</b> — ${c.amount.toLocaleString()} ·{" "}
                {formatPeriod(c.period)}
              </div>
            ))}
            {credits.sponsorLine && <SponsorCredit line={credits.sponsorLine} />}
          </div>
        </div>
      )}
    </GardenPage>
  );
}
