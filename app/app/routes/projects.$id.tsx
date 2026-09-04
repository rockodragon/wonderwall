// /projects/:id — a single project's detail page. Replaces the retired
// GardenPage/GardenNav version of this route (which queried the older,
// pre-community garden/projectsPublic.getProject and lived OUTSIDE the
// _app layout — same "side nav disappears" bug already fixed on events).
// This route is registered inside the _app layout in routes.ts, so the
// sidebar/wordmark/CommunitySwitcher render normally; it queries the
// CURRENT garden/projects.getProject (same shape listProjects' cards use).
//
// StatusSelect and SupportModal are reused directly from routes/projects.tsx
// (the list page) rather than re-implemented — same convention offerings.
// $id.tsx already uses for PostOfferingForm/SignupModal.

import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { Link, useParams, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import { AnnouncementComposer } from "../components/AnnouncementComposer";
import { budgetAmountLabel, budgetKindLabel } from "../lib/budgetLabel";
import { STATUS_LABELS, StatusSelect, SupportModal } from "./projects";

// Loader-less (client-only useQuery, same as communities.$slug.tsx and
// offerings.$id.tsx) — `data` is never actually populated; this just
// matches those two routes' existing convention rather than inventing one.
export function meta({ data }: { data?: { title?: string } }) {
  return [
    { title: data?.title ? `${data.title} — Projects` : "Project — creatives.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <PageShell>
      <p className="text-sm" style={{ color: "var(--garden-dim)" }}>
        This project isn't here — check back soon.
      </p>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">{children}</div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div
        className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--garden-citron)", borderTopColor: "transparent" }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/projects"
      className="inline-block text-sm mb-5 hover:opacity-80"
      style={{ color: "var(--garden-citron)" }}
    >
      ← Projects
    </Link>
  );
}

function DetailCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-4 mb-6"
      style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-3"
        style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const project = useQuery(api.garden.projects.getProject, id ? { projectId: id } : "skip");
  const myProfile = useQuery(api.profiles.getMyProfile);
  const [showSupportModal, setShowSupportModal] = useState(false);

  if (project === undefined) {
    return (
      <PageShell>
        <BackLink />
        <Loading />
      </PageShell>
    );
  }

  if (project === null) {
    return (
      <PageShell>
        <BackLink />
        <p className="text-sm" style={{ color: "var(--garden-dim)" }}>
          Check the link — this project isn't here anymore.
        </p>
      </PageShell>
    );
  }

  const isOwner = !!myProfile && project.userId === myProfile.userId;
  const kindWord = project.kind === "paid" ? budgetKindLabel(project) : "Passion";
  const moneyWord = project.kind === "paid" ? budgetAmountLabel(project) : null;
  const hasMoney = project.kind === "paid" && kindWord === "Paid";
  const thumb = project.media.find((m: any) => m.resolvedMediaUrl)?.resolvedMediaUrl;

  return (
    <PageShell>
      <BackLink />

      {/* Same overlay spot as the card and Classes' detail page: kind
          top-left, money top-right, whether or not there's a photo. */}
      <div
        className="relative rounded-2xl overflow-hidden border aspect-[16/9] flex items-center justify-center mb-6"
        style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
      >
        {thumb ? (
          <img src={thumb} alt={project.title} className="w-full h-full object-cover" />
        ) : (
          <svg
            className="w-14 h-14"
            style={{ color: "var(--garden-hairline-raised)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        )}
        <span
          className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.06em]"
          style={{ fontFamily: "var(--garden-font-mono)", backgroundColor: "rgba(20,20,18,0.72)", color: "var(--garden-paper)" }}
        >
          {kindWord}
        </span>
        {hasMoney && moneyWord && (
          <span
            className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-sm font-bold"
            style={{ fontFamily: "var(--garden-font-mono)", backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            {moneyWord}
          </span>
        )}
      </div>

      <h1
        className="text-2xl sm:text-3xl font-semibold mb-2"
        style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
      >
        {project.title}
      </h1>

      {project.creator && (
        <Link to={`/profile/${project.creator._id}`} className="flex items-center gap-2 mb-4 w-fit hover:opacity-80">
          {project.creator.imageUrl ? (
            <img
              src={project.creator.imageUrl}
              alt={project.creator.name}
              className="w-6 h-6 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ backgroundColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
            >
              {project.creator.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm" style={{ color: "var(--garden-muted)" }}>
            {project.creator.name}
            {project.community && (
              <span style={{ color: "var(--garden-dim)" }}> · in {project.community.name}</span>
            )}
          </span>
        </Link>
      )}

      {project.status && project.status !== "active" && (
        <span
          className="inline-block mb-4 px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ fontFamily: "var(--garden-font-mono)", backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)" }}
        >
          {STATUS_LABELS[project.status] ?? project.status}
        </span>
      )}

      {project.interests && project.interests.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {project.interests.map((tag: string) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ fontFamily: "var(--garden-font-body)", backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)" }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {project.blurb && (
        <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--garden-body)" }}>
          {project.blurb}
        </p>
      )}

      {project.benefitsNonprofit && (
        <DetailCard label="Nonprofit">
          <p className="text-sm" style={{ color: "var(--garden-body)" }}>
            Supports {project.nonprofitName || "a nonprofit"} — self-declared, not verified.
          </p>
        </DetailCard>
      )}

      {!project.remote && project.location && (
        <DetailCard label="Location">
          <p className="text-sm" style={{ color: "var(--garden-body)" }}>{project.location}</p>
        </DetailCard>
      )}

      <div
        className="flex items-center justify-between gap-2 mb-6 pt-4"
        style={{ borderTop: "1px solid var(--garden-hairline)" }}
      >
        <span className="text-sm" style={{ color: "var(--garden-dim)" }}>
          {project.supportCount > 0
            ? `${project.supportCount} ${project.supportCount === 1 ? "supporter" : "supporters"}`
            : "Be the first to support"}
        </span>
        <button
          onClick={() => setShowSupportModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          Support
        </button>
      </div>

      {isOwner && (
        <>
          <DetailCard label="Manage">
            <div className="flex items-center gap-2">
              <label className="text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--garden-dim)" }}>
                Status
              </label>
              <StatusSelect project={project} />
            </div>
          </DetailCard>
          <div className="mb-6">
            <AnnouncementComposer targetType="project" targetId={project._id} heading="Message supporters" />
          </div>
        </>
      )}

      {showSupportModal && <SupportModal project={project} onClose={() => setShowSupportModal(false)} />}
    </PageShell>
  );
}
