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

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AnnouncementComposer } from "../components/AnnouncementComposer";
import { FavoriteButton } from "../components/FavoriteButton";
import { budgetAmountLabel, budgetKindLabel } from "../lib/budgetLabel";
import { resolveStage, stageLabel } from "../lib/stage";
import { errorMessage, STATUS_LABELS, StageSelect, SupportModal } from "./projects";

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

function PencilIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-[rgba(198,198,190,0.15)] transition-colors"
      style={{ color: "var(--garden-dim)" }}
    >
      <PencilIcon size={13} />
    </button>
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
  const thumb = project.resolvedPhotoUrl || project.media.find((m: any) => m.resolvedMediaUrl)?.resolvedMediaUrl;

  return (
    <PageShell>
      <BackLink />

      <ProjectHero
        thumb={thumb}
        title={project.title}
        kindWord={kindWord}
        hasMoney={hasMoney}
        moneyWord={moneyWord}
        projectId={project._id}
        isOwner={isOwner}
      />

      <InlineEditableTitle project={project} isOwner={isOwner} />

      {project.creator && (
        <div className="flex items-center gap-3 mb-4">
          <Link to={`/profile/${project.creator._id}`} className="flex items-center gap-2 w-fit hover:opacity-80">
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
          {!isOwner && (
            <FavoriteButton targetType="profile" targetId={project.creator._id} size="sm" />
          )}
        </div>
      )}

      {project.status === "archived" && (
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

      <InlineEditableBlurb project={project} isOwner={isOwner} />

      <TeamCard project={project} isOwner={isOwner} myProfile={myProfile} />

      {project.benefitsNonprofit && (
        <DetailCard label="Nonprofit">
          <p className="text-sm" style={{ color: "var(--garden-body)" }}>
            Funded via {project.nonprofitName || "a nonprofit"}, a 501(c)(3).
          </p>
        </DetailCard>
      )}

      <InlineEditableLocation project={project} isOwner={isOwner} />

      <div
        className="flex items-center justify-between gap-2 pt-4"
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
      <SupportersList projectId={project._id} />

      {isOwner && (
        <>
          <DetailCard label="Manage">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--garden-dim)" }}>
                  Stage
                </label>
                <StageSelect project={project} />
              </div>
              <ArchiveButton project={project} />
            </div>
          </DetailCard>
          <TierManager projectId={project._id} />
          <div className="mb-6">
            <AnnouncementComposer targetType="project" targetId={project._id} heading="Message team and supporters" />
          </div>
        </>
      )}

      {showSupportModal && <SupportModal project={project} onClose={() => setShowSupportModal(false)} />}
    </PageShell>
  );
}

// Minimal utility control, same convention as StatusSelect/StageSelect in
// routes/projects.tsx — a creator moving their own project to archived via
// the existing updateProjectStatus mutation. Kept as a separate action from
// stage: stage is a label on live work, archiving changes lifecycle/
// visibility (docs/features/project-teams.md §1).
function ArchiveButton({ project }: { project: any }) {
  const updateProjectStatus = useMutation(api.garden.projects.updateProjectStatus);
  const [saving, setSaving] = useState(false);

  async function handleClick() {
    if (!window.confirm(`Archive "${project.title}"? It'll stop showing on /projects.`)) return;
    setSaving(true);
    try {
      await updateProjectStatus({ projectId: project._id, status: "archived" });
    } finally {
      setSaving(false);
    }
  }

  if (project.status === "archived") return null;

  return (
    <button
      onClick={handleClick}
      disabled={saving}
      className="text-xs underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
      style={{ color: "var(--garden-dim)" }}
    >
      Archive
    </button>
  );
}

function ProjectHero({
  thumb,
  title,
  kindWord,
  hasMoney,
  moneyWord,
  projectId,
  isOwner,
}: {
  thumb: string | null | undefined;
  title: string;
  kindWord: string;
  hasMoney: boolean;
  moneyWord: string | null;
  projectId: Id<"projects">;
  isOwner: boolean;
}) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveProjectImage = useMutation((api as any).files.saveProjectImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      await saveProjectImage({ projectId, storageId });
    } catch {
      alert("Upload failed — try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (thumb) {
    return (
      <div
        className="group relative rounded-2xl overflow-hidden border aspect-[16/9] flex items-center justify-center mb-6"
        style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
      >
        <img src={thumb} alt={title} className="w-full h-full object-cover" />
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
        {isOwner && (
          <>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} hidden />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "rgba(20,20,18,0.72)", color: "var(--garden-paper)" }}
            >
              <PencilIcon size={12} />
              {uploading ? "Uploading…" : "Change image"}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span
        className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.06em]"
        style={{ fontFamily: "var(--garden-font-mono)", backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)" }}
      >
        {kindWord}
      </span>
      {hasMoney && moneyWord && (
        <span
          className="px-3 py-1 rounded-full text-sm font-bold"
          style={{ fontFamily: "var(--garden-font-mono)", backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          {moneyWord}
        </span>
      )}
      {isOwner && (
        <>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} hidden />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)" }}
          >
            <PencilIcon size={12} />
            {uploading ? "Uploading…" : "Add image"}
          </button>
        </>
      )}
    </div>
  );
}

function InlineEditableTitle({ project, isOwner }: { project: any; isOwner: boolean }) {
  const updateProject = useMutation((api as any).garden.projects.updateProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.title);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft.trim() || draft.trim() === project.title) {
      setEditing(false);
      setDraft(project.title);
      return;
    }
    setSaving(true);
    try {
      await updateProject({ projectId: project._id, title: draft.trim() });
      setEditing(false);
    } catch {
      setDraft(project.title);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setDraft(project.title); setEditing(false); } }}
          disabled={saving}
          className="text-2xl sm:text-3xl font-semibold px-1 rounded border outline-none min-w-0 flex-1"
          style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        />
      ) : (
        <h1
          className="text-2xl sm:text-3xl font-semibold"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          {project.title}
        </h1>
      )}
      <span
        className="px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-[0.06em]"
        style={{ fontFamily: "var(--garden-font-mono)", backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)" }}
      >
        {stageLabel(resolveStage(project), project.kind)}
      </span>
      {isOwner && !editing && <EditButton onClick={() => { setDraft(project.title); setEditing(true); }} label="Edit title" />}
    </div>
  );
}

function InlineEditableBlurb({ project, isOwner }: { project: any; isOwner: boolean }) {
  const updateProject = useMutation((api as any).garden.projects.updateProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.blurb ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed === (project.blurb ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateProject({ projectId: project._id, blurb: trimmed || undefined });
      setEditing(false);
    } catch {
      setDraft(project.blurb ?? "");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mb-6">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          disabled={saving}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none leading-relaxed"
          style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
        />
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => { setDraft(project.blurb ?? ""); setEditing(false); }}
            className="text-xs hover:opacity-80"
            style={{ color: "var(--garden-dim)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!project.blurb && !isOwner) return null;

  return (
    <div className="flex items-start gap-1 mb-6">
      <p className="text-sm leading-relaxed flex-1" style={{ color: "var(--garden-body)" }}>
        {project.blurb || (isOwner ? "No description yet" : "")}
      </p>
      {isOwner && <EditButton onClick={() => { setDraft(project.blurb ?? ""); setEditing(true); }} label="Edit description" />}
    </div>
  );
}

function InlineEditableLocation({ project, isOwner }: { project: any; isOwner: boolean }) {
  const updateProject = useMutation((api as any).garden.projects.updateProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.location ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed === (project.location ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateProject({ projectId: project._id, location: trimmed || undefined });
      setEditing(false);
    } catch {
      setDraft(project.location ?? "");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (project.remote && !isOwner) return null;

  if (editing) {
    return (
      <DetailCard label="Location">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setDraft(project.location ?? ""); setEditing(false); } }}
            disabled={saving}
            placeholder="City, State"
            className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
          />
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            {saving ? "…" : "Save"}
          </button>
          <button
            onClick={() => { setDraft(project.location ?? ""); setEditing(false); }}
            className="text-xs hover:opacity-80"
            style={{ color: "var(--garden-dim)" }}
          >
            Cancel
          </button>
        </div>
      </DetailCard>
    );
  }

  if (!project.remote && project.location) {
    return (
      <DetailCard label="Location">
        <div className="flex items-center gap-1">
          <p className="text-sm flex-1" style={{ color: "var(--garden-body)" }}>{project.location}</p>
          {isOwner && <EditButton onClick={() => { setDraft(project.location ?? ""); setEditing(true); }} label="Edit location" />}
        </div>
      </DetailCard>
    );
  }

  if (isOwner) {
    return (
      <DetailCard label="Location">
        <div className="flex items-center gap-1">
          <p className="text-sm flex-1" style={{ color: "var(--garden-dim)" }}>No location set</p>
          <EditButton onClick={() => { setDraft(""); setEditing(true); }} label="Add location" />
        </div>
      </DetailCard>
    );
  }

  return null;
}

// Small avatar, same fallback-initial pattern as the creator block above —
// pulled out here since the team card repeats it for the lead, every
// accepted member, and every pending request.
function Avatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  return imageUrl ? (
    <img src={imageUrl} alt={name} className="w-6 h-6 rounded-full object-cover shrink-0" />
  ) : (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
      style={{ backgroundColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// The existing profile-page Message button, copied here rather than shared:
// it navigates via getOrCreateConversation the same way (routes/profile.tsx
// ~136-161), just without PostHog (this page doesn't fire those events).
function MessageButton({ userId }: { userId: string }) {
  const getOrCreateConversation = useMutation(api.messaging.getOrCreateConversation);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  async function handleClick() {
    if (starting) return;
    setStarting(true);
    try {
      const conversation = await getOrCreateConversation({ otherUserId: userId as any });
      if (conversation) navigate(`/messages/${conversation._id}`);
    } catch {
      // Quiet failure, same as profile.tsx's Message button — nothing
      // useful to surface inline on a compact team row.
    } finally {
      setStarting(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={starting}
      className="ml-auto text-xs underline underline-offset-2 hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
      style={{ color: "var(--garden-citron)" }}
    >
      Message
    </button>
  );
}

function TeamMemberRow({
  name,
  imageUrl,
  profileId,
  roleLabel,
  userId,
  showMessage,
  memberId,
}: {
  name: string;
  imageUrl?: string | null;
  profileId?: string | null;
  roleLabel: string;
  userId?: string;
  showMessage?: boolean;
  memberId?: string;
}) {
  const updateMemberRole = useMutation((api as any).garden.projectTeam.updateMemberRole);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(roleLabel);
  const [saving, setSaving] = useState(false);

  async function saveRole() {
    if (!draft.trim() || draft.trim() === roleLabel) {
      setEditing(false);
      setDraft(roleLabel);
      return;
    }
    setSaving(true);
    try {
      await updateMemberRole({ memberId, role: draft.trim() });
      setEditing(false);
    } catch {
      setDraft(roleLabel);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Avatar name={name} imageUrl={imageUrl} />
      {profileId ? (
        <Link to={`/profile/${profileId}`} className="hover:opacity-80" style={{ color: "var(--garden-paper)" }}>
          {name}
        </Link>
      ) : (
        <span style={{ color: "var(--garden-paper)" }}>{name}</span>
      )}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveRole}
          onKeyDown={(e) => { if (e.key === "Enter") saveRole(); if (e.key === "Escape") { setDraft(roleLabel); setEditing(false); } }}
          disabled={saving}
          className="px-1.5 py-0.5 rounded border text-sm outline-none min-w-0"
          style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)", maxWidth: "14rem" }}
        />
      ) : (
        <span
          style={{ color: "var(--garden-dim)", cursor: memberId ? "pointer" : undefined }}
          onClick={memberId ? () => { setDraft(roleLabel); setEditing(true); } : undefined}
          title={memberId ? "Click to edit role" : undefined}
        >
          — {roleLabel}
        </span>
      )}
      {showMessage && userId && <MessageButton userId={userId} />}
    </div>
  );
}

// Team card — lead, accepted members, off-platform credits, the viewer's
// own membership actions, and (lead-only) requests/invited/add-someone
// tools. See docs/features/project-teams.md §2-4 and §7.
function TeamCard({
  project,
  isOwner,
  myProfile,
}: {
  project: any;
  isOwner: boolean;
  myProfile: any;
}) {
  const team = useQuery(api.garden.projectTeam.getTeam, { projectId: project._id });

  if (!team) return null;

  const myUserId = myProfile?.userId;

  return (
    <DetailCard label="Team">
      <div className="flex flex-col gap-2.5">
        <TeamMemberRow
          name={team.lead.name}
          imageUrl={team.lead.imageUrl}
          profileId={team.lead.profileId}
          roleLabel="Lead"
          userId={team.lead.userId}
          showMessage={!!myUserId && myUserId !== team.lead.userId}
        />
        {team.accepted.map((m: any) => (
          <TeamMemberRow
            key={m.memberId}
            name={m.name}
            imageUrl={m.imageUrl}
            profileId={m.profileId}
            roleLabel={m.role}
            userId={m.userId}
            showMessage={!!myUserId && myUserId !== m.userId}
            memberId={isOwner ? m.memberId : undefined}
          />
        ))}
        {team.credits.map((c: any) => (
          <div key={c.memberId} className="flex items-center gap-2 text-sm">
            <span style={{ color: "var(--garden-paper)" }}>{c.name}</span>
            <span style={{ color: "var(--garden-dim)" }}>— {c.role}</span>
            <span
              className="text-[10px] uppercase tracking-[0.06em]"
              style={{ fontFamily: "var(--garden-font-mono)", color: "var(--garden-dim)" }}
            >
              invited
            </span>
          </div>
        ))}
      </div>

      {!isOwner && (
        <ViewerTeamActions project={project} mine={team.mine} leadName={team.lead.name} />
      )}

      {isOwner && <LeadTeamTools project={project} pending={team.pending} invited={team.invited} />}
    </DetailCard>
  );
}

// Not-on-the-team viewer actions: apply/ask, or the state of an existing
// request/invite/membership. Hidden for the lead — they get LeadTeamTools
// instead. See docs/features/project-teams.md §3, §7.
function ViewerTeamActions({
  project,
  mine,
  leadName,
}: {
  project: any;
  mine: { memberId: string; status: string; role: string } | undefined;
  leadName: string;
}) {
  const withdrawRequest = useMutation(api.garden.projectTeam.withdrawRequest);
  const respondToInvite = useMutation(api.garden.projectTeam.respondToInvite);
  const leaveProject = useMutation(api.garden.projectTeam.leaveProject);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-3 mt-2.5" style={{ borderTop: "1px solid var(--garden-hairline)" }}>
      {!mine && (
        <button
          onClick={() => setShowJoinModal(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          {project.kind === "paid" ? "Apply" : "Ask to join"}
        </button>
      )}

      {mine?.status === "pending" && (
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--garden-body)" }}>
          <span>Requested as {mine.role}</span>
          <button
            disabled={busy}
            onClick={() => run(() => withdrawRequest({ projectId: project._id }))}
            className="text-xs underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--garden-dim)" }}
          >
            Withdraw
          </button>
        </div>
      )}

      {mine?.status === "invited" && (
        <div className="flex items-center gap-3 text-sm flex-wrap" style={{ color: "var(--garden-body)" }}>
          <span>
            {leadName} invited you as {mine.role}
          </span>
          <button
            disabled={busy}
            onClick={() => run(() => respondToInvite({ projectId: project._id, accept: true }))}
            className="text-xs px-2.5 py-1 rounded-lg font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            Accept
          </button>
          <button
            disabled={busy}
            onClick={() => run(() => respondToInvite({ projectId: project._id, accept: false }))}
            className="text-xs underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--garden-dim)" }}
          >
            Decline
          </button>
        </div>
      )}

      {mine?.status === "accepted" && (
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--garden-body)" }}>
          <span>You're on this project as {mine.role}</span>
          <button
            disabled={busy}
            onClick={() => {
              if (window.confirm("Leave this project's team?")) {
                run(() => leaveProject({ projectId: project._id }));
              }
            }}
            className="text-xs underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--garden-dim)" }}
          >
            Leave
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}

      {showJoinModal && <JoinRequestModal project={project} onClose={() => setShowJoinModal(false)} />}
    </div>
  );
}

// Same visual style as SupportModal in routes/projects.tsx — a small modal,
// not a page, for the one thing it does: ask to join, or apply.
function JoinRequestModal({ project, onClose }: { project: any; onClose: () => void }) {
  const requestToJoin = useMutation(api.garden.projectTeam.requestToJoin);
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const isPaid = project.kind === "paid";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!role.trim()) {
      setError("Say what role you'd take on.");
      return;
    }
    setSubmitting(true);
    try {
      await requestToJoin({
        projectId: project._id,
        role: role.trim(),
        message: message.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 my-8"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          {isPaid ? "Apply to" : "Ask to join"} "{project.title}"
        </h2>

        {done ? (
          <div className="py-4">
            <p className="text-sm mb-4" style={{ color: "var(--garden-body)" }}>
              Sent — the lead will follow up.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Role
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value.slice(0, 60))}
                placeholder="Editor"
                maxLength={60}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Note (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                placeholder="Why you'd be good for this"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                style={{
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ color: "var(--garden-dim)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
              >
                {submitting ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Lead-only: requests waiting on a decision, people already invited, and a
// compact way to add someone new. One card section, not a page — see
// docs/features/project-teams.md §4, §7.
function LeadTeamTools({
  project,
  pending,
  invited,
}: {
  project: any;
  pending: any[] | undefined;
  invited: any[] | undefined;
}) {
  const decideRequest = useMutation(api.garden.projectTeam.decideRequest);
  const removeMember = useMutation(api.garden.projectTeam.removeMember);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(memberId: string, action: () => Promise<unknown>) {
    setBusyId(memberId);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pt-4 mt-2.5 flex flex-col gap-4" style={{ borderTop: "1px solid var(--garden-hairline)" }}>
      {pending && pending.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.06em] mb-2" style={{ color: "var(--garden-dim)" }}>
            Requests
          </p>
          <div className="flex flex-col gap-2">
            {pending.map((r: any) => (
              <div key={r.memberId} className="flex items-start gap-2 text-sm">
                <Avatar name={r.name} imageUrl={r.imageUrl} />
                <div className="flex-1 min-w-0">
                  <Link to={`/profile/${r.profileId}`} className="hover:opacity-80" style={{ color: "var(--garden-paper)" }}>
                    {r.name}
                  </Link>
                  <span style={{ color: "var(--garden-dim)" }}> — {r.role}</span>
                  {r.message && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--garden-dim)" }}>
                      "{r.message}"
                    </p>
                  )}
                </div>
                <button
                  disabled={busyId === r.memberId}
                  onClick={() => run(r.memberId, () => decideRequest({ memberId: r.memberId, accept: true }))}
                  className="text-xs px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap disabled:opacity-50"
                  style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
                >
                  Accept
                </button>
                <button
                  disabled={busyId === r.memberId}
                  onClick={() => run(r.memberId, () => decideRequest({ memberId: r.memberId, accept: false }))}
                  className="text-xs underline underline-offset-2 hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
                  style={{ color: "var(--garden-dim)" }}
                >
                  Decline
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {invited && invited.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.06em] mb-2" style={{ color: "var(--garden-dim)" }}>
            Invited
          </p>
          <div className="flex flex-col gap-2">
            {invited.map((inv: any) => (
              <div key={inv.memberId} className="flex items-center gap-2 text-sm">
                {inv.emailed ? (
                  <span style={{ color: "var(--garden-paper)" }}>Invited by email</span>
                ) : inv.profileId ? (
                  <Link to={`/profile/${inv.profileId}`} className="hover:opacity-80" style={{ color: "var(--garden-paper)" }}>
                    {inv.name}
                  </Link>
                ) : (
                  <span style={{ color: "var(--garden-paper)" }}>{inv.name}</span>
                )}
                <span style={{ color: "var(--garden-dim)" }}>— {inv.role}</span>
                <button
                  disabled={busyId === inv.memberId}
                  onClick={() => run(inv.memberId, () => removeMember({ memberId: inv.memberId }))}
                  className="ml-auto text-xs underline underline-offset-2 hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
                  style={{ color: "var(--garden-dim)" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddSomeone projectId={project._id} />

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// Add someone: search people already here, or credit someone who isn't
// (docs/features/project-teams.md §3). Two modes in one compact block
// rather than a separate form — this is one card section, not a page.
function AddSomeone({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<"search" | "credit">("search");
  const [query, setQuery] = useState("");
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [creditRole, setCreditRole] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const results = useQuery(
    api.garden.projectTeam.searchPeopleForInvite,
    query.trim().length >= 2 ? { q: query.trim() } : "skip",
  );
  const inviteMember = useMutation(api.garden.projectTeam.inviteMember);

  async function sendPersonInvite(userId: string) {
    if (!roleDraft.trim()) {
      setError("Say what role you're inviting them for.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await inviteMember({
        projectId: projectId as Id<"projects">,
        userId: userId as Id<"users">,
        role: roleDraft.trim(),
      });
      setInvitingUserId(null);
      setRoleDraft("");
      setQuery("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Add their name.");
      return;
    }
    if (!creditRole.trim()) {
      setError("Say what role they had.");
      return;
    }
    setSubmitting(true);
    try {
      await inviteMember({
        projectId: projectId as Id<"projects">,
        name: name.trim(),
        email: email.trim() || undefined,
        role: creditRole.trim(),
      });
      setName("");
      setEmail("");
      setCreditRole("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    backgroundColor: "var(--garden-ink)",
    borderColor: "var(--garden-hairline-raised)",
    color: "var(--garden-paper)",
  };

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.06em] mb-2" style={{ color: "var(--garden-dim)" }}>
        Add someone
      </p>

      {mode === "search" ? (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people by name"
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={inputStyle}
          />
          {results && results.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              {results.map((p: any) => (
                <div key={p.profileId} className="flex items-center gap-2 text-sm">
                  <Avatar name={p.name} imageUrl={p.imageUrl} />
                  <span className="flex-1 min-w-0 truncate" style={{ color: "var(--garden-paper)" }}>
                    {p.name}
                  </span>
                  {invitingUserId === p.userId ? (
                    <>
                      <input
                        type="text"
                        value={roleDraft}
                        onChange={(e) => setRoleDraft(e.target.value.slice(0, 60))}
                        placeholder="Role"
                        maxLength={60}
                        className="w-24 px-2 py-1 rounded-lg border text-xs outline-none"
                        style={inputStyle}
                      />
                      <button
                        disabled={submitting}
                        onClick={() => sendPersonInvite(p.userId)}
                        className="text-xs px-2 py-1 rounded-lg font-semibold whitespace-nowrap disabled:opacity-50"
                        style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
                      >
                        Send
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setInvitingUserId(p.userId);
                        setRoleDraft("");
                        setError("");
                      }}
                      className="text-xs underline underline-offset-2 hover:opacity-80 whitespace-nowrap"
                      style={{ color: "var(--garden-citron)" }}
                    >
                      Invite
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setMode("credit");
              setError("");
            }}
            className="block text-xs underline underline-offset-2 hover:opacity-80 mt-2"
            style={{ color: "var(--garden-muted)" }}
          >
            Not on the platform yet
          </button>
        </>
      ) : (
        <form onSubmit={handleCreditSubmit} className="flex flex-col gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={inputStyle}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={inputStyle}
          />
          <input
            type="text"
            value={creditRole}
            onChange={(e) => setCreditRole(e.target.value.slice(0, 60))}
            placeholder="Role"
            maxLength={60}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={inputStyle}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setMode("search");
                setError("");
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ color: "var(--garden-dim)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              {submitting ? "Adding…" : "Add credit"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TierManager — owner-only patron tier CRUD, placed inside the isOwner block
// between Manage and AnnouncementComposer.
// ---------------------------------------------------------------------------

function TierForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: { name: string; priceCents: number; description?: string; benefits?: string[] };
  onSave: (data: { name: string; priceCents: number; description?: string; benefits: string[] }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial ? String(initial.priceCents / 100) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [benefits, setBenefits] = useState<string[]>(initial?.benefits ?? []);

  const inputStyle = {
    backgroundColor: "var(--garden-ink)",
    borderColor: "var(--garden-hairline-raised)",
    color: "var(--garden-paper)",
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(price) * 100);
    onSave({
      name: name.trim(),
      priceCents: cents,
      description: description.trim() || undefined,
      benefits: benefits.map((b) => b.trim()).filter(Boolean),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label
          className="block text-xs uppercase tracking-[0.06em] mb-1.5"
          style={{ color: "var(--garden-dim)" }}
        >
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 60))}
          placeholder="e.g. Sustainer, Champion, Partner"
          maxLength={60}
          required
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={inputStyle}
        />
      </div>

      <div>
        <label
          className="block text-xs uppercase tracking-[0.06em] mb-1.5"
          style={{ color: "var(--garden-dim)" }}
        >
          Price ($/mo)
        </label>
        <input
          type="number"
          min="5"
          step="1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="5"
          required
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ ...inputStyle, fontFamily: "var(--garden-font-mono)" }}
        />
      </div>

      <div>
        <label
          className="block text-xs uppercase tracking-[0.06em] mb-1.5"
          style={{ color: "var(--garden-dim)" }}
        >
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 500))}
          rows={2}
          maxLength={500}
          placeholder="What this level of support means"
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
          style={inputStyle}
        />
      </div>

      <div>
        <label
          className="block text-xs uppercase tracking-[0.06em] mb-1.5"
          style={{ color: "var(--garden-dim)" }}
        >
          Benefits
        </label>
        <div className="flex flex-col gap-2">
          {benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={b}
                onChange={(e) => {
                  const next = [...benefits];
                  next[i] = e.target.value.slice(0, 200);
                  setBenefits(next);
                }}
                maxLength={200}
                placeholder={`Benefit ${i + 1}`}
                className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setBenefits(benefits.filter((_, j) => j !== i))}
                className="text-xs underline underline-offset-2 hover:opacity-80 whitespace-nowrap"
                style={{ color: "var(--garden-dim)" }}
              >
                Remove
              </button>
            </div>
          ))}
          {benefits.length < 8 && (
            <button
              type="button"
              onClick={() => setBenefits([...benefits, ""])}
              className="text-xs underline underline-offset-2 hover:opacity-80 w-fit"
              style={{ color: "var(--garden-citron)" }}
            >
              Add benefit
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ color: "var(--garden-dim)" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function TierManager({ projectId }: { projectId: Id<"projects"> }) {
  const tiers = useQuery((api as any).garden.patronTiers.listAllTiers, { projectId });
  const createTier = useMutation((api as any).garden.patronTiers.createTier);
  const updateTier = useMutation((api as any).garden.patronTiers.updateTier);
  const deleteTier = useMutation((api as any).garden.patronTiers.deleteTier);

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(data: {
    name: string;
    priceCents: number;
    description?: string;
    benefits: string[];
  }) {
    setSaving(true);
    setError("");
    try {
      await createTier({
        projectId,
        name: data.name,
        priceCents: data.priceCents,
        description: data.description,
        benefits: data.benefits.length > 0 ? data.benefits : undefined,
      });
      setShowAdd(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(
    tierId: Id<"patronTiers">,
    data: { name: string; priceCents: number; description?: string; benefits: string[] },
  ) {
    setSaving(true);
    setError("");
    try {
      await updateTier({
        tierId,
        name: data.name,
        priceCents: data.priceCents,
        description: data.description,
        benefits: data.benefits.length > 0 ? data.benefits : undefined,
      });
      setEditingId(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tierId: Id<"patronTiers">, tierName: string) {
    if (!window.confirm(`Delete the "${tierName}" tier? This cannot be undone.`)) return;
    setError("");
    try {
      await deleteTier({ tierId });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (tiers === undefined) return null;

  return (
    <DetailCard label="Patron Tiers">
      {tiers.length === 0 && !showAdd && (
        <p className="text-sm mb-3" style={{ color: "var(--garden-dim)" }}>
          No patron tiers yet. Add tiers to let backers choose a level of support.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {tiers.map((tier: any) =>
          editingId === tier._id ? (
            <TierForm
              key={tier._id}
              initial={{
                name: tier.name,
                priceCents: tier.priceCents,
                description: tier.description,
                benefits: tier.benefits,
              }}
              onSave={(data) => handleUpdate(tier._id, data)}
              onCancel={() => {
                setEditingId(null);
                setError("");
              }}
              saving={saving}
            />
          ) : (
            <div
              key={tier._id}
              className="group/tier relative rounded-lg border p-3"
              style={{ borderColor: "var(--garden-hairline)" }}
            >
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/tier:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditingId(tier._id);
                    setShowAdd(false);
                    setError("");
                  }}
                  title="Edit tier"
                  className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[rgba(198,198,190,0.15)] transition-colors"
                  style={{ color: "var(--garden-citron)" }}
                >
                  <PencilIcon size={13} />
                </button>
                <button
                  onClick={() => handleDelete(tier._id, tier.name)}
                  title="Delete tier"
                  className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[rgba(198,198,190,0.15)] transition-colors"
                  style={{ color: "var(--garden-dim)" }}
                >
                  <TrashIcon size={13} />
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap pr-16">
                <span
                  className="font-semibold text-sm"
                  style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
                >
                  {tier.name}
                </span>
                <span
                  className="text-sm"
                  style={{ color: "var(--garden-muted)", fontFamily: "var(--garden-font-mono)" }}
                >
                  ${(tier.priceCents / 100).toFixed(0)}/mo
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-[0.06em]"
                  style={{
                    fontFamily: "var(--garden-font-mono)",
                    backgroundColor: tier.isActive ? "rgba(215,242,90,0.15)" : "rgba(198,198,190,0.1)",
                    color: tier.isActive ? "var(--garden-citron)" : "var(--garden-dim)",
                  }}
                >
                  {tier.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {tier.description && (
                <p className="text-sm mt-1.5" style={{ color: "var(--garden-body)" }}>
                  {tier.description}
                </p>
              )}

              {tier.benefits && tier.benefits.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {tier.benefits.map((b: string, i: number) => (
                    <li
                      key={i}
                      className="text-sm pl-3 relative before:content-['·'] before:absolute before:left-0"
                      style={{ color: "var(--garden-body)" }}
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
      </div>

      {showAdd && (
        <div className={tiers.length > 0 ? "mt-4" : ""}>
          <TierForm
            onSave={handleCreate}
            onCancel={() => {
              setShowAdd(false);
              setError("");
            }}
            saving={saving}
          />
        </div>
      )}

      {!showAdd && !editingId && (
        <button
          onClick={() => {
            setShowAdd(true);
            setError("");
          }}
          className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          Add tier
        </button>
      )}

      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
    </DetailCard>
  );
}

const SUPPORT_TYPE_LABEL: Record<string, string> = {
  financial_one_time: "Backed",
  financial_recurring: "Monthly backer",
  financial_annual: "Annual backer",
  encouragement: "Encouragement",
  resource: "Resource offer",
};

function SupportersList({ projectId }: { projectId: Id<"projects"> }) {
  const supporters = useQuery(
    (api as any).garden.support.listSupportForProject,
    { projectId },
  );
  const [expanded, setExpanded] = useState(false);

  if (!supporters || supporters.length === 0) return <div className="mb-6" />;

  const show = expanded ? supporters : supporters.slice(0, 5);
  const hasMore = supporters.length > 5;

  return (
    <div className="mb-6">
      <div className="space-y-1.5">
        {show.map((s: any) => (
          <div key={s._id} className="flex items-center gap-2 text-sm">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{
                backgroundColor: "var(--garden-muted, #e5e5e5)",
                color: "var(--garden-ink)",
              }}
            >
              {(s.supporterName || "A").charAt(0).toUpperCase()}
            </span>
            <span style={{ color: "var(--garden-body)" }}>
              {s.supporterName}
            </span>
            {s.tierName && (
              <span
                className="text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--garden-muted, #e5e5e5)",
                  color: "var(--garden-dim)",
                }}
              >
                {s.tierName}
              </span>
            )}
            {!s.tierName && s.type && (
              <span className="text-xs" style={{ color: "var(--garden-dim)" }}>
                {SUPPORT_TYPE_LABEL[s.type] ?? ""}
              </span>
            )}
            {s.message && (
              <span className="text-xs truncate max-w-[200px]" style={{ color: "var(--garden-dim)" }}>
                "{s.message}"
              </span>
            )}
          </div>
        ))}
      </div>
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs font-medium hover:underline"
          style={{ color: "var(--garden-dim)" }}
        >
          Show all {supporters.length} supporters
        </button>
      )}
    </div>
  );
}
