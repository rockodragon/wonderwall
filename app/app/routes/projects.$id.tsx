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

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams, useRouteError, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { EMBED_PROVIDER_LABEL, toEmbedUrl } from "../lib/videoEmbed";
import type { Id } from "../../convex/_generated/dataModel";
import { AnnouncementComposer } from "../components/AnnouncementComposer";
import { AdminMenu, HiddenNotice } from "../components/AdminMenu";
import { EmbedPlayer } from "../components/EmbedPlayer";
import { describeMediaLink, MediaLinkField } from "../components/MediaLinkField";
import { FavoriteButton } from "../components/FavoriteButton";
import { LocationAutocomplete, LocationVerifiedHint } from "../components/LocationAutocomplete";
import { ProjectMenu } from "../components/project/ProjectMenu";
import { StageChip } from "../components/project/StageChip";
import { TabPanel, Tabs } from "../components/project/Tabs";
import { ProjectUpdates } from "../components/ProjectUpdates";
import { ProjectModal } from "../components/ProjectModal";
import { RichContent } from "../components/RichContent";
import { RichTextEditor } from "../components/RichTextEditor";
import { useLocationField } from "../lib/useLocationField";
import { isRichDocEmpty, toStoredDoc, type ResolvedRichBlock } from "../lib/richText";
import { budgetAmountLabel, budgetKindLabel, budgetLabel } from "../lib/budgetLabel";
import { GigSchedule } from "../components/GigSchedule";
import { projectTabs, readProjectTab, withProjectTab, type ProjectTab } from "../lib/projectTabs";
import { useBack } from "../lib/useBack";
import { INTERESTS } from "../constants/interests";
import { errorMessage } from "../lib/convexError";
import {
  STATUS_LABELS,
  SupportModal,
  SupportButtons,
  GoalProgress,
  isRaising,
  type SupportMode,
} from "./projects";
import { PAGE_WIDTH } from "../lib/pageWidth";

// Loader-less (client-only useQuery, same as communities.$slug.tsx and
// offerings.$id.tsx) — `data` is never actually populated; this just
// matches those two routes' existing convention rather than inventing one.
export function meta({ data }: { data?: { title?: string } }) {
  return [
    { title: data?.title ? `${data.title} — Projects` : "Project — TheCreative.exchange" },
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
      <div className={`p-4 sm:p-6 ${PAGE_WIDTH.reading} mx-auto`}>{children}</div>
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
  const back = useBack("/projects");
  return (
    <Link
      {...back}
      className="inline-block text-sm mb-5 hover:opacity-80"
      style={{ color: "var(--garden-citron)" }}
    >
      ← Back
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
        className="text-xs font-semibold uppercase tracking-[0.08em] mb-3"
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

// A still for the hero when the page has nothing to play: the pasted link's
// fetched still (`mediaPreviewUrl`, convex/linkPreview.ts), else the first
// attached media's cover or fetched preview (`ogImageUrl`), the provider's
// own thumbnail for a YouTube link, or the file itself. A pasted reel's page
// URL is never an <img src> (convex/videoEmbed.ts) — before this, a video
// link rendered a broken image.
function mediaThumb(project: { mediaPreviewUrl?: string | null; media?: any[] }): string | null {
  if (project.mediaPreviewUrl) return project.mediaPreviewUrl;
  for (const m of project.media ?? []) {
    if (m.ogImageUrl) return m.ogImageUrl;
    const embed = toEmbedUrl(m.mediaUrl ?? undefined);
    if (embed) {
      if (embed.thumbnailUrl) return embed.thumbnailUrl;
      continue;
    }
    if (m.resolvedMediaUrl) return m.resolvedMediaUrl;
  }
  return null;
}

// The page's sections are tabs (lib/projectTabs.ts): About, Team (Dates for a
// gig), Updates, and Support for a project. The chosen one lives in ?tab=.
const TABS_BASE = "project";
const TABS_ROW_ID = "project-tabs";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const project = useQuery(api.garden.projects.getProject, id ? { projectId: id } : "skip");
  const myProfile = useQuery(api.profiles.getMyProfile);
  // The team is read here, once, so the Team tab can say how many requests are
  // waiting; TeamCard draws from the same answer.
  const team = useQuery(api.garden.projectTeam.getTeam, id ? { projectId: id as Id<"projects"> } : "skip");
  const [searchParams, setSearchParams] = useSearchParams();
  const [supportMode, setSupportMode] = useState<SupportMode | null>(null);
  // Lifted so the owner's "Next steps" nudge can open the support editor.
  const [editingSupport, setEditingSupport] = useState(false);
  // The same three-step modal "Start a project" uses, opened on this project.
  const [editingProject, setEditingProject] = useState(false);
  // "Next steps" switches tab, then scrolls to the tabs once they've changed.
  const scrollAfterTab = useRef(false);
  const rawTab = searchParams.get("tab");
  useEffect(() => {
    if (!scrollAfterTab.current) return;
    scrollAfterTab.current = false;
    document.getElementById(TABS_ROW_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [rawTab]);

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
  const raising = isRaising(project);
  const isPassion = project.kind === "passion";
  const kindWord =
    project.kind === "paid" ? budgetKindLabel(project) : raising ? "Seeking funding" : "Project";
  const moneyAmount = project.kind === "paid" ? budgetAmountLabel(project) : null;
  // Live booking (docs/features/live-booking.md): a gig's money is per date.
  const isGig = !!project.gig;
  const moneyWord = moneyAmount && isGig && project.budgetType === "amount" ? `${moneyAmount}/date` : moneyAmount;
  const hasMoney = project.kind === "paid" && kindWord === "Paid";
  // A pasted link plays on the page itself (docs/features/creator-media-
  // cross-post.md, Round 2): beneath the photo when there is one, in the
  // hero's place when there isn't. Its still is for cards, not for here.
  const mediaEmbed = toEmbedUrl(project.mediaUrl);
  // Attached pieces play in their own section below, so a still of the
  // first one isn't repeated as the hero.
  const hasPieces = (project.media?.length ?? 0) > 0;
  const thumb = project.resolvedPhotoUrl || (mediaEmbed || hasPieces ? null : mediaThumb(project));

  const hiddenByAdmin = project.status === "hidden";
  const showGoal = raising && (project.goal ?? 0) > 0;

  // Requests waiting on the owner are the one thing worth a number on a tab.
  const requests = isOwner ? (team?.pending?.length ?? 0) : 0;
  const tabs = projectTabs({ isGig, isPassion, requests });
  const tab = readProjectTab(rawTab, tabs);
  function selectTab(next: ProjectTab) {
    // Replace the history entry, and stay where the page is scrolled.
    setSearchParams(withProjectTab(searchParams, next), { replace: true, preventScrollReset: true });
  }
  // The owner's "Next steps" buttons: show the tab first, then scroll to it.
  function showTab(next: ProjectTab) {
    if (next === tab) {
      document.getElementById(TABS_ROW_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    scrollAfterTab.current = true;
    selectTab(next);
  }

  return (
    <PageShell>
      <div className="flex items-start justify-between gap-3">
        <BackLink />
        <div className="flex items-center gap-1">
          {isOwner && <ProjectMenu project={project} />}
          <AdminMenu target={{ kind: "project", id: project._id }} title={project.title} hidden={hiddenByAdmin} />
        </div>
      </div>

      {hiddenByAdmin && (
        <div className="mb-5">
          <HiddenNotice kind="project" />
        </div>
      )}

      <ProjectHero
        thumb={thumb}
        title={project.title}
        kindWord={kindWord}
        hasMoney={hasMoney}
        moneyWord={moneyWord}
        projectId={project._id}
        isOwner={isOwner}
      />

      {mediaEmbed && (
        <EmbedPlayer
          embed={mediaEmbed}
          title={project.title}
          className="mb-6 rounded-2xl overflow-hidden"
          style={{ backgroundColor: "var(--garden-ink-raised)" }}
        />
      )}

      {isOwner && <InlineEditableMediaLink project={project} />}

      {isOwner && isPassion && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setEditingProject(true)}
            className="text-[13.5px] font-medium underline underline-offset-2 hover:opacity-80"
            style={{ color: "var(--garden-citron)" }}
          >
            Edit project
          </button>
        </div>
      )}
      {editingProject && (
        <ProjectModal
          edit={{
            projectId: project._id,
            title: project.title,
            blurb: project.blurb,
            mediaUrl: project.mediaUrl,
            interests: project.interests,
            remote: project.remote,
            location: project.location,
            locationType: project.locationType,
            address: project.address,
            coordinates: project.coordinates,
            placeId: project.placeId,
            hostOrgId: project.hostOrgId,
          }}
          onClose={() => setEditingProject(false)}
        />
      )}

      {/* The pencil sits right after the title and edits only the title; the
          stage is its own chip beside it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
        <InlineEditableTitle project={project} isOwner={isOwner} />
        <StageChip project={project} isOwner={isOwner} />
      </div>

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
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
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
          className="inline-block mb-4 px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-[0.06em]"
          style={{ fontFamily: "var(--garden-font-mono)", backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)" }}
        >
          {STATUS_LABELS[project.status] ?? project.status}
        </span>
      )}

      <InlineEditableBlurb project={project} isOwner={isOwner} />

      <InlineEditableInterests project={project} isOwner={isOwner} />

      {/* How it's going, and the two ways to show up. Support is for
          projects, not hires: a job or a gig is paid, not backed. */}
      {isPassion && (showGoal || !isOwner) && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          {showGoal && (
            <div className="min-w-[14rem] flex-1 [&>div]:mb-0">
              <GoalProgress raisedCents={project.raisedCents ?? 0} goal={project.goal!} />
            </div>
          )}
          {!isOwner && <SupportButtons raising={raising} onSupport={setSupportMode} />}
        </div>
      )}

      {isOwner && isPassion && !raising && (project.openRoles?.length ?? 0) === 0 && (
        <NextSteps
          onFindPeople={() => showTab("team")}
          onAskForSupport={() => {
            setEditingSupport(true);
            showTab("support");
          }}
        />
      )}

      <Tabs tabs={tabs} selected={tab} onSelect={selectTab} label="Project sections" base={TABS_BASE} id={TABS_ROW_ID} />

      <TabPanel base={TABS_BASE} id="about" selected={tab === "about"}>
        <InlineEditableStory project={project} isOwner={isOwner} />

        {/* Pieces play and sound; they stop when you leave the tab. */}
        {tab === "about" && hasPieces && <AttachedPieces project={project} />}

        <InlineEditableLocation project={project} isOwner={isOwner} />

        {project.benefitsNonprofit && (
          <DetailCard label="Nonprofit">
            <p className="text-sm" style={{ color: "var(--garden-body)" }}>
              Funded via {project.nonprofitName || "a nonprofit"}, a 501(c)(3).
            </p>
          </DetailCard>
        )}
      </TabPanel>

      {isGig ? (
        <TabPanel base={TABS_BASE} id="dates" selected={tab === "dates"}>
          <GigSchedule project={project} isOwner={isOwner} myProfile={myProfile} />
        </TabPanel>
      ) : (
        <TabPanel base={TABS_BASE} id="team" selected={tab === "team"}>
          <TeamCard project={project} team={team} isOwner={isOwner} myProfile={myProfile} />
        </TabPanel>
      )}

      <TabPanel base={TABS_BASE} id="updates" selected={tab === "updates"}>
        <ProjectUpdates projectId={project._id} isOwner={isOwner} myUserId={myProfile?.userId} />
        {isOwner && (
          <div className="mt-8 mb-6">
            <AnnouncementComposer targetType="project" targetId={project._id} heading="Message team and supporters" />
          </div>
        )}
      </TabPanel>

      {isPassion && (
        <TabPanel base={TABS_BASE} id="support" selected={tab === "support"}>
          {isOwner && (
            <AskForSupport project={project} raising={raising} editing={editingSupport} setEditing={setEditingSupport} />
          )}
          {isOwner && raising && <TierManager projectId={project._id} />}
          <p className="mb-3 text-sm" style={{ color: "var(--garden-dim)" }}>
            {project.supportCount > 0
              ? `${project.supportCount} ${project.supportCount === 1 ? "supporter" : "supporters"}`
              : "No supporters yet"}
          </p>
          <SupportersList projectId={project._id} />
        </TabPanel>
      )}

      {supportMode && (
        <SupportModal project={project} mode={supportMode} onClose={() => setSupportMode(null)} />
      )}
    </PageShell>
  );
}

function ensureHttps(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function hostOf(url: string): string {
  try {
    return new URL(ensureHttps(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// The pieces attached to a project (artifacts.projectId) — the work itself,
// shown here now that a shared piece IS a project and /works/:id redirects
// to it (docs/features/project-ia.md). What the hero or the blurb already
// shows is skipped: a shared image is also the project's photo, and a
// shared text post is also its blurb.
function AttachedPieces({ project }: { project: any }) {
  const pieces = (project.media ?? []).filter((m: any) => {
    if (m.type === "image" && m.resolvedMediaUrl && m.resolvedMediaUrl === project.resolvedPhotoUrl) return false;
    if (m.type === "text" && (m.content ?? "").trim() === (project.blurb ?? "").trim()) return false;
    return true;
  });
  if (pieces.length === 0) return null;
  const frame = { backgroundColor: "var(--garden-ink-raised)" };
  return (
    <div className="flex flex-col gap-4 mb-6">
      {pieces.map((m: any) => {
        const embed = toEmbedUrl(m.mediaUrl ?? undefined);
        if (embed) {
          return (
            <EmbedPlayer key={m._id} embed={embed} title={m.title ?? project.title} className="rounded-2xl overflow-hidden" style={frame} />
          );
        }
        if (m.type === "video" && m.resolvedMediaUrl) {
          return (
            <video key={m._id} src={m.resolvedMediaUrl} controls playsInline className="w-full rounded-2xl" style={frame} />
          );
        }
        if (m.type === "audio" && m.resolvedMediaUrl) {
          return (
            <div key={m._id} className="rounded-2xl p-4" style={frame}>
              {m.title && (
                <p className="text-sm mb-2" style={{ color: "var(--garden-paper)" }}>
                  {m.title}
                </p>
              )}
              <audio src={m.resolvedMediaUrl} controls className="w-full" />
            </div>
          );
        }
        if (m.type === "image" && m.resolvedMediaUrl) {
          return (
            <img key={m._id} src={m.resolvedMediaUrl} alt={m.title ?? ""} className="w-full max-h-[70vh] object-contain rounded-2xl" style={frame} />
          );
        }
        if (m.type === "text" && m.content) {
          return (
            <div key={m._id} className="rounded-2xl p-5 text-[15px] whitespace-pre-wrap" style={{ ...frame, color: "var(--garden-body)" }}>
              {m.content}
            </div>
          );
        }
        if (m.mediaUrl) {
          return (
            <a
              key={m._id}
              href={ensureHttps(m.mediaUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl p-3 hover:opacity-90"
              style={frame}
            >
              {m.ogImageUrl && <img src={m.ogImageUrl} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />}
              <span className="min-w-0">
                <span className="block text-sm font-medium break-words" style={{ color: "var(--garden-paper)" }}>
                  {m.title || hostOf(m.mediaUrl)}
                </span>
                <span className="block text-[13px]" style={{ color: "var(--garden-muted)" }}>
                  {hostOf(m.mediaUrl)} ↗
                </span>
              </span>
            </a>
          );
        }
        return null;
      })}
    </div>
  );
}

// Shown to the owner of a fresh project that has asked for nothing yet —
// posting is step one, and these are the two optional steps after it
// (docs/features/project-ia.md).
function NextSteps({
  onFindPeople,
  onAskForSupport,
}: {
  onFindPeople: () => void;
  onAskForSupport: () => void;
}) {
  const steps = [
    { label: "Find people", hint: "Post the roles you need, paid or volunteer.", onClick: onFindPeople },
    { label: "Ask for support", hint: "Set a goal so people can back it.", onClick: onAskForSupport },
  ];
  return (
    <DetailCard label="Next steps">
      <p className="text-sm mb-3" style={{ color: "var(--garden-body)" }}>
        Your project is up. Both of these are optional.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {steps.map((step) => (
          <button
            key={step.label}
            type="button"
            onClick={step.onClick}
            className="text-left rounded-xl border p-3 transition-colors hover:opacity-90"
            style={{ borderColor: "var(--garden-hairline-raised)", backgroundColor: "var(--garden-ink)" }}
          >
            <span className="block text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>
              {step.label}
            </span>
            <span className="block text-[13px] mt-0.5" style={{ color: "var(--garden-body)" }}>
              {step.hint}
            </span>
          </button>
        ))}
      </div>
    </DetailCard>
  );
}

function toDateInput(ms: number | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The owner's side of support: step three of posting, done here rather than
// in the create form. Setting a goal is what turns the "Back this" button on.
function AskForSupport({
  project,
  raising,
  editing,
  setEditing,
}: {
  project: any;
  raising: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  const updateProject = useMutation((api as any).garden.projects.updateProject);
  const [goal, setGoal] = useState(project.goal ? String(project.goal) : "");
  const [raiseBy, setRaiseBy] = useState(toDateInput(project.raiseByDate));
  const [benefitsNonprofit, setBenefitsNonprofit] = useState(!!project.benefitsNonprofit);
  const [nonprofitName, setNonprofitName] = useState(project.nonprofitName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const inputStyle = {
    backgroundColor: "var(--garden-ink)",
    borderColor: "var(--garden-hairline-raised)",
    color: "var(--garden-paper)",
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const goalNum = Number(goal);
    if (!goal.trim() || !Number.isFinite(goalNum) || goalNum <= 0) {
      setError("A goal needs a real number bigger than zero.");
      return;
    }
    if (benefitsNonprofit && !nonprofitName.trim()) {
      setError("Add the nonprofit's name, or uncheck if you're not sure yet.");
      return;
    }
    setBusy(true);
    try {
      await updateProject({
        projectId: project._id,
        goal: goalNum,
        // Noon local, so the date reads the same in every US time zone.
        raiseByDate: raiseBy ? new Date(`${raiseBy}T12:00:00`).getTime() : null,
        benefitsNonprofit,
        nonprofitName: benefitsNonprofit ? nonprofitName.trim() : "",
      });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError("");
    try {
      await updateProject({ projectId: project._id, goal: null, raiseByDate: null });
      setGoal("");
      setRaiseBy("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-3 mb-5">
        <div>
          <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
            Goal (USD)
          </label>
          <input
            type="number"
            min="1"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="1000"
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ ...inputStyle, fontFamily: "var(--garden-font-mono)" }}
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
            Raise by (optional)
          </label>
          <input
            type="date"
            value={raiseBy}
            onChange={(e) => setRaiseBy(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={inputStyle}
          />
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--garden-body)" }}>
          <input
            type="checkbox"
            checked={benefitsNonprofit}
            onChange={(e) => setBenefitsNonprofit(e.target.checked)}
          />
          This supports a registered nonprofit
        </label>
        {benefitsNonprofit && (
          <div>
            <input
              type="text"
              value={nonprofitName}
              onChange={(e) => setNonprofitName(e.target.value)}
              placeholder="Nonprofit name, e.g. Second Harvest Food Bank"
              aria-label="Nonprofit name"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
            />
            <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
              Self-declared, not verified.
            </p>
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-4 py-2 rounded-lg text-[13.5px] font-medium"
            style={{ color: "var(--garden-muted)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg text-[13.5px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            {busy ? "Saving…" : raising ? "Save" : "Start asking"}
          </button>
        </div>
      </form>
    );
  }

  if (!raising) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-sm" style={{ color: "var(--garden-body)" }}>
          Want money toward this? Set a goal and people can back it.
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="px-4 py-2 rounded-lg text-[13.5px] font-semibold whitespace-nowrap"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          Ask for support
        </button>
      </div>
    );
  }

  return (
    <div className="mb-5">
      {/* How much has come in is the bar above the tabs. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[13.5px] underline underline-offset-2 hover:opacity-80"
          style={{ color: "var(--garden-citron)" }}
        >
          Edit goal
        </button>
        {(project.goal ?? 0) > 0 && (
          <button
            type="button"
            onClick={stop}
            disabled={busy}
            className="text-[13.5px] underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--garden-muted)" }}
          >
            Stop asking
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
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
            {/* Hidden until hover only where hover exists — on a phone there
                is no hover, and the button used to be unreachable there. */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
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

// The pasted link, edited in place like the title and blurb below, by the
// owner only — a visitor sees the player (or nothing), never this row. The
// image button in ProjectHero stays the way to add a photo; this is the
// "or paste a link" beside it. Saving a blank field clears the link:
// updateProject reads "" as clear, and takes the fetched still with it.
function InlineEditableMediaLink({ project }: { project: any }) {
  const updateProject = useMutation((api as any).garden.projects.updateProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.mediaUrl ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const hasLink = !!project.mediaUrl;
  const current = toEmbedUrl(project.mediaUrl);

  function open() {
    setDraft(project.mediaUrl ?? "");
    setError("");
    setEditing(true);
  }

  async function save(next: string) {
    const link = describeMediaLink(next);
    if (link.state === "invalid") {
      setError(link.message);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateProject({
        projectId: project._id,
        mediaUrl: link.state === "ok" ? link.url : "",
      });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {hasLink ? (
          <>
            <span className="text-xs" style={{ color: "var(--garden-dim)" }}>
              {current ? `${EMBED_PROVIDER_LABEL[current.kind]} link` : "Link"}
            </span>
            <EditButton onClick={open} label="Change link" />
            <button
              onClick={() => save("")}
              disabled={saving}
              title="Remove link"
              className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-[rgba(198,198,190,0.15)] transition-colors disabled:opacity-50"
              style={{ color: "var(--garden-dim)" }}
            >
              <TrashIcon size={13} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={open}
            className="text-xs underline underline-offset-2 hover:opacity-80"
            style={{ color: "var(--garden-citron)" }}
          >
            + Paste a link (Instagram post or reel, TikTok, YouTube or Vimeo)
          </button>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <form
      className="mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(draft);
      }}
    >
      <MediaLinkField
        variant="garden"
        label="Link"
        placeholder="Instagram post or reel, TikTok, YouTube or Vimeo"
        value={draft}
        onChange={setDraft}
        autoFocus
      />
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      <div className="flex gap-2 mt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ color: "var(--garden-dim)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// The title and, right after it, the pencil that edits it. Only the title:
// the stage is its own chip (components/project/StageChip.tsx).
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
    <div className={`flex items-center gap-2 min-w-0 ${editing ? "w-full" : ""}`}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setDraft(project.title); setEditing(false); } }}
          disabled={saving}
          aria-label="Project title"
          className="text-2xl sm:text-3xl font-semibold px-1 rounded border outline-none min-w-0 flex-1"
          style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        />
      ) : (
        <h1
          className="text-2xl sm:text-3xl font-semibold min-w-0 break-words"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          {project.title}
        </h1>
      )}
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

// The full project page — headings, formatted text, images and video
// embeds (docs/features/rich-project-content.md §2). Distinct from `blurb`
// directly above it, which stays the one-line summary every card and search
// result shows; this is the part a visitor reads once they've clicked in.
//
// Saves the whole document at once rather than per block: a project page is
// a thing an author composes and then publishes, not a live surface, and
// autosaving half-written blocks onto a public page would be worse.
function InlineEditableStory({ project, isOwner }: { project: any; isOwner: boolean }) {
  const updateProject = useMutation((api as any).garden.projects.updateProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ResolvedRichBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body: ResolvedRichBlock[] = project.body ?? [];
  const hasBody = body.length > 0;

  function startEditing() {
    setDraft(body);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // [] is how the editor says "I cleared this" — v.optional would read a
      // missing field as "leave it alone" (garden/projects.ts).
      await updateProject({ projectId: project._id, body: toStoredDoc(draft) });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mb-6" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <RichTextEditor
          value={draft}
          onChange={setDraft}
          autoFocus
          placeholder="Tell people what you're making, who it's for, and where it's going…"
        />
        {error && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--garden-citron)" }}>
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)", fontSize: 13.5 }}
          >
            {saving ? "Saving…" : isRichDocEmpty(draft) && hasBody ? "Clear page" : "Save"}
          </button>
          <button
            onClick={() => {
              setDraft(body);
              setError(null);
              setEditing(false);
            }}
            className="hover:opacity-80"
            style={{ color: "var(--garden-dim)", fontSize: 13.5 }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!hasBody) {
    if (!isOwner) return null;
    return (
      <button
        onClick={startEditing}
        className="w-full text-left px-4 py-3 rounded-lg mb-6 hover:opacity-90"
        style={{
          border: "1px dashed var(--garden-hairline-raised)",
          backgroundColor: "var(--garden-ink-raised)",
          color: "var(--garden-body)",
          fontSize: 15,
        }}
      >
        Add a full description — headings, photos, video, the whole page.
      </button>
    );
  }

  return (
    <div className="mb-6">
      {isOwner && (
        <div className="flex justify-end mb-1">
          <EditButton onClick={startEditing} label="Edit the project page" />
        </div>
      )}
      <RichContent blocks={body} />
    </div>
  );
}

function InlineEditableLocation({ project, isOwner }: { project: any; isOwner: boolean }) {
  const updateProject = useMutation((api as any).garden.projects.updateProject);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same wiring as the create forms in projects.tsx: the shared picker
  // resolves a Places suggestion (type/address/coordinates) alongside the
  // display string, and drops it the moment the text is edited away from
  // the pick. Seeded from the project so "open, don't touch, save" keeps
  // what was there.
  const location = useLocationField(project);
  const [remote, setRemote] = useState<boolean>(project.remote !== false);

  function open() {
    location.hydrate(project);
    setRemote(project.remote !== false);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const args = location.toArgs();
    if (!remote && !args.location) {
      setError('Pick a location, or check "This can be done remotely."');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // `location: ""` (not undefined) tells updateProject to clear the
      // whole location group when the field was emptied.
      await updateProject({ projectId: project._id, ...args, location: args.location ?? "", remote });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <DetailCard label="Location">
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--garden-body)" }}>
            <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} disabled={saving} />
            This can be done remotely
          </label>
          {!remote && (
            <div>
              <LocationAutocomplete
                value={location.value}
                onChange={location.onChange}
                onSelect={location.onSelect}
                placeholder="Search for a location, type 'Online', or 'TBD'"
                disabled={saving}
              />
              <LocationVerifiedHint value={location.value} selected={location.selected} />
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex items-center gap-2 justify-end">
            <button onClick={cancel} disabled={saving} className="text-xs hover:opacity-80" style={{ color: "var(--garden-dim)" }}>
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </DetailCard>
    );
  }

  const isRemote = project.remote !== false;
  const summary = isRemote
    ? project.location
      ? `${project.location} · remote-friendly`
      : "Remote-friendly — anywhere"
    : project.location || null;

  if (summary) {
    return (
      <DetailCard label="Location">
        <div className="flex items-center gap-1">
          <p className="text-sm flex-1" style={{ color: "var(--garden-body)" }}>{summary}</p>
          {isOwner && <EditButton onClick={open} label="Edit location" />}
        </div>
      </DetailCard>
    );
  }

  if (isOwner) {
    return (
      <DetailCard label="Location">
        <div className="flex items-center gap-1">
          <p className="text-sm flex-1" style={{ color: "var(--garden-dim)" }}>No location set</p>
          <EditButton onClick={open} label="Add location" />
        </div>
      </DetailCard>
    );
  }

  return null;
}

function InlineEditableInterests({ project, isOwner }: { project: any; isOwner: boolean }) {
  const updateProject = useMutation((api as any).garden.projects.updateProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(project.interests ?? []);
  const [saving, setSaving] = useState(false);

  function toggle(interest: string) {
    setDraft((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  }

  async function save() {
    if (JSON.stringify(draft.slice().sort()) === JSON.stringify((project.interests ?? []).slice().sort())) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateProject({ projectId: project._id, interests: draft });
      setEditing(false);
    } catch {
      setDraft(project.interests ?? []);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mb-4">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {INTERESTS.map((interest) => {
            const active = draft.includes(interest);
            return (
              <button
                key={interest}
                type="button"
                onClick={() => toggle(interest)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  fontFamily: "var(--garden-font-body)",
                  backgroundColor: active ? "rgba(254,226,104,0.2)" : "rgba(198,198,190,0.1)",
                  color: active ? "var(--garden-citron)" : "var(--garden-muted)",
                  border: active ? "1px solid var(--garden-citron)" : "1px solid transparent",
                }}
              >
                {interest}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => { setDraft(project.interests ?? []); setEditing(false); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: "var(--garden-dim)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const tags = project.interests ?? [];
  if (tags.length === 0 && !isOwner) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4">
      {tags.map((tag: string) => (
        <span
          key={tag}
          className="px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ fontFamily: "var(--garden-font-body)", backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)" }}
        >
          {tag}
        </span>
      ))}
      {isOwner && (
        <EditButton onClick={() => { setDraft(tags); setEditing(true); }} label="Edit tags" />
      )}
    </div>
  );
}

// Small avatar, same fallback-initial pattern as the creator block above —
// pulled out here since the team card repeats it for the lead, every
// accepted member, and every pending request.
function Avatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  return imageUrl ? (
    <img src={imageUrl} alt={name} className="w-6 h-6 rounded-full object-cover shrink-0" />
  ) : (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
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
  team,
  isOwner,
  myProfile,
}: {
  project: any;
  /** api.garden.projectTeam.getTeam, read by the page (which also counts the
   * requests on the tab). Undefined while loading. */
  team: any;
  isOwner: boolean;
  myProfile: any;
}) {
  // null = closed; {} = the free-text flow (generic Apply/Ask-to-join
  // button); {roleId,title} = applying for a specific posted role (from
  // RolesSection's Apply button) — TeamCard owns this so both entry points
  // share the one modal instance instead of each opening their own.
  const [joinModal, setJoinModal] = useState<{ roleId?: string; title?: string } | null>(null);

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
              className="text-xs uppercase tracking-[0.06em]"
              style={{ fontFamily: "var(--garden-font-mono)", color: "var(--garden-dim)" }}
            >
              invited
            </span>
          </div>
        ))}
      </div>

      <RolesSection
        project={project}
        isOwner={isOwner}
        mine={team.mine}
        onApply={(role) => setJoinModal(role)}
        apply={team.apply}
      />

      {!isOwner && (
        <ViewerTeamActions
          project={project}
          mine={team.mine}
          leadName={team.lead.name}
          onOpenJoinModal={() => setJoinModal({})}
          apply={team.apply}
          acceptingPeople={team.acceptingPeople}
        />
      )}

      {isOwner && <LeadTeamTools project={project} pending={team.pending} invited={team.invited} />}

      {joinModal && (
        <JoinRequestModal
          project={project}
          preset={joinModal.roleId ? { roleId: joinModal.roleId, title: joinModal.title! } : null}
          onClose={() => setJoinModal(null)}
        />
      )}
    </DetailCard>
  );
}

// Open role postings — what the lead is actually looking for, separate from
// the invited-people list above. Anyone can see open/filled roles; only the
// lead can post/close one, and only a viewer with no existing relationship
// to the project (no `mine` row) gets an Apply button per role — the
// project already caps everyone at one pending/invited/accepted row
// (projectTeam.ts's nextStatusForRequest), so a second "Apply" while one is
// already in flight would just silently no-op rather than switch roles;
// ViewerTeamActions below already shows that existing relationship's state.
// See docs/features/project-teams.md §2-4 and §7.
// Past-date-just-hides-it, same convention as projects.tsx's raiseByDate
// daysLeft — no separate "overdue" state to build for a role that's now
// late; the badge simply stops showing.
function daysUntil(neededBy: number | null): number | null {
  if (!neededBy || neededBy <= Date.now()) return null;
  return Math.max(1, Math.ceil((neededBy - Date.now()) / 86400000));
}

// Same four states as projects.tsx's BUDGET_TYPE_OPTIONS, plus
// "confidential" — a role's payment picker, not a project's, so it isn't
// the exact same constant (that one doesn't offer confidential and
// probably shouldn't; see budgetLabel.ts's BudgetType comment).
const ROLE_BUDGET_TYPE_OPTIONS = [
  { value: "amount", label: "Set amount" },
  { value: "range", label: "Range" },
  { value: "proposals", label: "Open to proposals" },
  { value: "confidential", label: "Confidential" },
  { value: "volunteer", label: "Volunteer" },
] as const;

function RolesSection({
  project,
  isOwner,
  mine,
  onApply,
  apply,
}: {
  project: any;
  isOwner: boolean;
  /** Whether the viewer may apply — getTeam's read of the same
   * project.applyPaid rule requestToJoin enforces. Absent while loading. */
  apply?: { allowed: boolean; reason: string | null; upgradePath: string | null };
  mine: { memberId: string; status: string; role: string } | undefined;
  onApply: (role: { roleId: string; title: string }) => void;
}) {
  const roles = useQuery(api.garden.projectTeam.listRoles, { projectId: project._id });
  const addRole = useMutation(api.garden.projectTeam.addRole);
  const closeRole = useMutation(api.garden.projectTeam.closeRole);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [neededByStr, setNeededByStr] = useState("");
  const [budgetType, setBudgetType] = useState(""); // "" = not specified
  const [budget, setBudget] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (roles === undefined) return null;
  if (!isOwner && roles.length === 0) return null;

  const inputStyle = {
    backgroundColor: "var(--garden-ink)",
    borderColor: "var(--garden-hairline-raised)",
    color: "var(--garden-paper)",
  };

  function toggleInterest(tag: string) {
    setInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Say what role you need.");
      return;
    }
    // Light client-side check so a typo doesn't round-trip to the server
    // just to bounce back — validateRoleBudget (projectTeam.ts) is still
    // the real authority and re-checks everything on save.
    if (budgetType === "amount" && (!budget.trim() || !Number.isFinite(Number(budget)) || Number(budget) <= 0)) {
      setError("A set amount needs a real number bigger than zero.");
      return;
    }
    if (budgetType === "range") {
      if (!budget.trim() || !budgetMax.trim()) {
        setError("A range needs both a low and a high number.");
        return;
      }
      if (Number(budgetMax) <= Number(budget)) {
        setError("A range needs a high number bigger than the low one.");
        return;
      }
    }
    setBusy(true);
    try {
      await addRole({
        projectId: project._id,
        title: title.trim(),
        description: description.trim() || undefined,
        interests: interests.length > 0 ? interests : undefined,
        neededBy: neededByStr ? new Date(neededByStr).getTime() : undefined,
        budgetType: budgetType || undefined,
        budget: budgetType === "amount" || budgetType === "range" ? Number(budget) : undefined,
        budgetMax: budgetType === "range" ? Number(budgetMax) : undefined,
      });
      setTitle("");
      setDescription("");
      setInterests([]);
      setNeededByStr("");
      setBudgetType("");
      setBudget("");
      setBudgetMax("");
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(roleId: string) {
    setBusy(true);
    setError("");
    try {
      await closeRole({ roleId: roleId as Id<"projectRoles"> });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-3 mt-2.5" style={{ borderTop: "1px solid var(--garden-hairline)" }}>
      {roles.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-[0.06em] mb-2" style={{ color: "var(--garden-dim)" }}>
            Roles needed
          </p>
          <div className="flex flex-col gap-2.5 mb-2">
            {roles.map((r: any) => {
              const days = daysUntil(r.neededBy);
              return (
                <div key={r.roleId} className="flex items-start gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span style={{ color: "var(--garden-paper)" }}>{r.title}</span>
                      {r.budgetType && (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-[0.06em]"
                          style={{
                            fontFamily: "var(--garden-font-mono)",
                            backgroundColor: "rgba(254,226,104,0.14)",
                            color: "var(--garden-citron)",
                          }}
                        >
                          {budgetLabel(r)}
                        </span>
                      )}
                      {days !== null && (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-[0.06em]"
                          style={{
                            fontFamily: "var(--garden-font-mono)",
                            backgroundColor: "rgba(198,198,190,0.1)",
                            color: "var(--garden-dim)",
                          }}
                        >
                          {days} {days === 1 ? "day" : "days"} left
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <span className="block text-xs mt-0.5" style={{ color: "var(--garden-dim)" }}>
                        {r.description}
                      </span>
                    )}
                    {r.interests.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.interests.map((tag: string) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)" }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {r.status === "filled" ? (
                    <span className="text-xs whitespace-nowrap pt-0.5" style={{ color: "var(--garden-dim)" }}>
                      Filled — {r.filledBy?.name ?? "someone"}
                    </span>
                  ) : isOwner ? (
                    <button
                      disabled={busy}
                      onClick={() => handleClose(r.roleId)}
                      className="text-xs underline underline-offset-2 hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
                      style={{ color: "var(--garden-dim)" }}
                    >
                      Close
                    </button>
                  ) : !mine && apply && !apply.allowed ? (
                    <Link
                      to="/join"
                      className="text-xs underline underline-offset-2 whitespace-nowrap pt-0.5"
                      style={{ color: "var(--garden-citron)" }}
                    >
                      Join to apply
                    </Link>
                  ) : !mine ? (
                    <button
                      onClick={() => onApply({ roleId: r.roleId, title: r.title })}
                      className="text-xs px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
                      style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
                    >
                      Apply
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      {isOwner &&
        (adding ? (
          <form onSubmit={handleAdd} className="flex flex-col gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 60))}
              placeholder="Role, e.g. Sound Mixer"
              maxLength={60}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              rows={2}
              maxLength={500}
              placeholder="What this role involves (optional)"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={inputStyle}
            />
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Payment (optional)
              </label>
              <div role="radiogroup" aria-label="Payment" className="flex flex-wrap gap-1.5">
                {ROLE_BUDGET_TYPE_OPTIONS.map((opt) => {
                  const active = budgetType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      // Clicking the active pill again clears back to "not
                      // specified" — the one state with no pill of its own.
                      onClick={() => setBudgetType(active ? "" : opt.value)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                      style={{
                        fontFamily: "var(--garden-font-body)",
                        backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink)",
                        color: active ? "var(--garden-ink)" : "var(--garden-muted)",
                        border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {budgetType === "amount" && (
                <input
                  type="number"
                  min="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="500"
                  aria-label="Amount in US dollars"
                  className="w-full mt-2 px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ fontFamily: "var(--garden-font-mono)", ...inputStyle }}
                />
              )}
              {budgetType === "range" && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min="1"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="300"
                    aria-label="Low end, in US dollars"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ fontFamily: "var(--garden-font-mono)", ...inputStyle }}
                  />
                  <span style={{ color: "var(--garden-dim)" }}>–</span>
                  <input
                    type="number"
                    min="1"
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    placeholder="600"
                    aria-label="High end, in US dollars"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ fontFamily: "var(--garden-font-mono)", ...inputStyle }}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Needed by (optional)
              </label>
              <input
                type="date"
                value={neededByStr}
                onChange={(e) => setNeededByStr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Skills/interests (optional)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {INTERESTS.map((tag) => {
                  const active = interests.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleInterest(tag)}
                      className="px-2 py-0.5 rounded-full text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: active ? "rgba(254,226,104,0.2)" : "rgba(198,198,190,0.1)",
                        color: active ? "var(--garden-citron)" : "var(--garden-muted)",
                        border: active ? "1px solid var(--garden-citron)" : "1px solid transparent",
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setTitle("");
                  setDescription("");
                  setInterests([]);
                  setNeededByStr("");
                  setBudgetType("");
                  setBudget("");
                  setBudgetMax("");
                  setError("");
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ color: "var(--garden-dim)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
              >
                {busy ? "Posting…" : "Post role"}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs underline underline-offset-2 hover:opacity-80"
            style={{ color: "var(--garden-citron)" }}
          >
            + Add a role
          </button>
        ))}

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}

// Not-on-the-team viewer actions: apply/ask, or the state of an existing
// request/invite/membership. Hidden for the lead — they get LeadTeamTools
// instead. See docs/features/project-teams.md §3, §7.
function ViewerTeamActions({
  project,
  mine,
  leadName,
  onOpenJoinModal,
  apply,
  acceptingPeople,
}: {
  project: any;
  mine: { memberId: string; status: string; role: string } | undefined;
  leadName: string;
  /** See RolesSection's `apply`. */
  apply?: { allowed: boolean; reason: string | null; upgradePath: string | null };
  /** getTeam's isAcceptingPeople read — false on a finished project, where
   * requestToJoin would refuse. Absent while loading (treated as open). */
  acceptingPeople?: boolean;
  /** Opens the shared JoinRequestModal TeamCard owns — with no preset,
   * this is the original free-text "propose your own role" flow. */
  onOpenJoinModal: () => void;
}) {
  const withdrawRequest = useMutation(api.garden.projectTeam.withdrawRequest);
  const respondToInvite = useMutation(api.garden.projectTeam.respondToInvite);
  const leaveProject = useMutation(api.garden.projectTeam.leaveProject);
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
      {!mine && acceptingPeople === false ? (
        // Checked before the membership gate below: "Join to apply" on
        // finished work would send someone to pay for something they still
        // couldn't do.
        <p className="text-sm" style={{ color: "var(--garden-body)" }}>
          This project is finished and isn't taking new people.
        </p>
      ) : !mine && apply && !apply.allowed ? (
        // Applying to paid work takes membership (docs/features/live-booking.md
        // §8). The text is the server's own denial for project.applyPaid.
        <p className="text-sm" style={{ color: "var(--garden-body)" }}>
          {apply.reason ?? "Applying to paid work takes membership."}{" "}
          <Link to="/join" className="underline underline-offset-2 font-medium" style={{ color: "var(--garden-citron)" }}>
            {apply.upgradePath ?? "Join to apply"}
          </Link>
        </p>
      ) : !mine ? (
        <button
          onClick={onOpenJoinModal}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          {project.kind === "paid" ? "Apply" : "Ask to join"}
        </button>
      ) : null}

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
    </div>
  );
}

// Same visual style as SupportModal in routes/projects.tsx — a small modal,
// not a page, for the one thing it does: ask to join, or apply. `preset`
// carries a specific open role (from RolesSection's "Apply" button) — the
// Role field locks to its title and the request carries roleId, instead of
// the free-text "propose your own role" flow this modal always used to be.
function JoinRequestModal({
  project,
  preset,
  onClose,
}: {
  project: any;
  preset?: { roleId: string; title: string } | null;
  onClose: () => void;
}) {
  const requestToJoin = useMutation(api.garden.projectTeam.requestToJoin);
  const [role, setRole] = useState(preset?.title ?? "");
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
        roleId: preset?.roleId as Id<"projectRoles"> | undefined,
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
          {preset
            ? `Apply for "${preset.title}" on "${project.title}"`
            : `${isPaid ? "Apply to" : "Ask to join"} "${project.title}"`}
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
                disabled={!!preset}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none disabled:opacity-70"
                style={{
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
              {preset && (
                <p className="text-xs mt-1" style={{ color: "var(--garden-dim)" }}>
                  Applying for the role as posted.
                </p>
              )}
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
  // A short note back to the applicant, mostly for declines ("not the right
  // fit for this one, but...") — never persisted, just what decideRequest
  // sends as the notification text. Keyed by memberId so each pending
  // request's draft is independent.
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  async function run(memberId: string, action: () => Promise<unknown>) {
    setBusyId(memberId);
    setError("");
    try {
      await action();
      setDecisionNotes((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
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
          <p className="text-xs uppercase tracking-[0.06em] mb-2" style={{ color: "var(--garden-dim)" }}>
            Requests
          </p>
          <div className="flex flex-col gap-2">
            {pending.map((r: any) => (
              <div key={r.memberId} className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-start gap-2">
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
                </div>
                <div className="flex items-center gap-3 pl-7 flex-wrap">
                  <button
                    disabled={busyId === r.memberId}
                    onClick={() =>
                      run(r.memberId, () =>
                        decideRequest({ memberId: r.memberId, accept: true, message: decisionNotes[r.memberId]?.trim() || undefined }),
                      )
                    }
                    className="text-xs px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap disabled:opacity-50"
                    style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
                  >
                    Accept
                  </button>
                  <button
                    disabled={busyId === r.memberId}
                    onClick={() =>
                      run(r.memberId, () =>
                        decideRequest({ memberId: r.memberId, accept: false, message: decisionNotes[r.memberId]?.trim() || undefined }),
                      )
                    }
                    className="text-xs underline underline-offset-2 hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
                    style={{ color: "var(--garden-dim)" }}
                  >
                    Decline
                  </button>
                  {/* The note is optional and mostly for declines, so it's a
                      link until wanted — an open box on every request made the
                      list read as a form. A key present in decisionNotes (even
                      "") is what marks it open; run() clears it after. */}
                  {!(r.memberId in decisionNotes) && (
                    <button
                      type="button"
                      onClick={() => setDecisionNotes((prev) => ({ ...prev, [r.memberId]: "" }))}
                      className="hover:opacity-80 whitespace-nowrap"
                      style={{ color: "var(--garden-dim)", fontSize: 13 }}
                    >
                      Add a note
                    </button>
                  )}
                </div>
                {r.memberId in decisionNotes && (
                  <div className="pl-7">
                    <input
                      type="text"
                      autoFocus
                      value={decisionNotes[r.memberId] ?? ""}
                      onChange={(e) =>
                        setDecisionNotes((prev) => ({ ...prev, [r.memberId]: e.target.value.slice(0, 500) }))
                      }
                      placeholder="Note back to them — sent with Accept or Decline"
                      maxLength={500}
                      className="w-full px-2.5 py-1.5 rounded-lg border outline-none"
                      style={{
                        backgroundColor: "var(--garden-ink)",
                        borderColor: "var(--garden-hairline-raised)",
                        color: "var(--garden-paper)",
                        fontSize: 14,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {invited && invited.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-[0.06em] mb-2" style={{ color: "var(--garden-dim)" }}>
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
  // Closed until the lead asks for it — search, role pickers and the credit
  // form were all on screen at once for a lead who'd only come to read.
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "credit">("search");
  const [query, setQuery] = useState("");
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState(""); // "" = custom/free-text role
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [creditRole, setCreditRole] = useState("");
  const [creditRoleId, setCreditRoleId] = useState(""); // "" = custom/free-text role
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const results = useQuery(
    api.garden.projectTeam.searchPeopleForInvite,
    query.trim().length >= 2 ? { q: query.trim() } : "skip",
  );
  // Open postings this project's already declared (RolesSection above) —
  // offered here as a picker so inviting/crediting someone can fill one
  // directly instead of only ever re-typing the same title as free text.
  const roles = useQuery(api.garden.projectTeam.listRoles, { projectId: projectId as Id<"projects"> });
  const openRoles = (roles ?? []).filter((r: any) => r.status === "open");
  const inviteMember = useMutation(api.garden.projectTeam.inviteMember);

  async function sendPersonInvite(userId: string) {
    const picked = openRoles.find((r: any) => r.roleId === selectedRoleId);
    const role = picked ? picked.title : roleDraft.trim();
    if (!role) {
      setError("Say what role you're inviting them for.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await inviteMember({
        projectId: projectId as Id<"projects">,
        userId: userId as Id<"users">,
        role,
        roleId: picked ? (picked.roleId as Id<"projectRoles">) : undefined,
      });
      setInvitingUserId(null);
      setRoleDraft("");
      setSelectedRoleId("");
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
    const picked = openRoles.find((r: any) => r.roleId === creditRoleId);
    const role = picked ? picked.title : creditRole.trim();
    if (!role) {
      setError("Say what role they had.");
      return;
    }
    setSubmitting(true);
    try {
      await inviteMember({
        projectId: projectId as Id<"projects">,
        name: name.trim(),
        email: email.trim() || undefined,
        role,
        roleId: picked ? (picked.roleId as Id<"projectRoles">) : undefined,
      });
      setName("");
      setEmail("");
      setCreditRole("");
      setCreditRoleId("");
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

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 rounded-lg font-semibold border hover:opacity-90"
          style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)", fontSize: 13.5 }}
        >
          + Add someone
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="uppercase tracking-[0.06em]" style={{ color: "var(--garden-dim)", fontSize: 12 }}>
          Add someone
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMode("search");
            setQuery("");
            setInvitingUserId(null);
            setError("");
          }}
          className="hover:opacity-80"
          style={{ color: "var(--garden-dim)", fontSize: 13.5 }}
        >
          Done
        </button>
      </div>

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
                <div key={p.profileId} className="flex flex-col gap-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Avatar name={p.name} imageUrl={p.imageUrl} />
                    <span className="flex-1 min-w-0 truncate" style={{ color: "var(--garden-paper)" }}>
                      {p.name}
                    </span>
                    {invitingUserId !== p.userId && (
                      <button
                        onClick={() => {
                          setInvitingUserId(p.userId);
                          setRoleDraft("");
                          setSelectedRoleId("");
                          setError("");
                        }}
                        className="text-xs underline underline-offset-2 hover:opacity-80 whitespace-nowrap"
                        style={{ color: "var(--garden-citron)" }}
                      >
                        Invite
                      </button>
                    )}
                  </div>
                  {invitingUserId === p.userId && (
                    <div className="flex items-center gap-2 pl-7">
                      {openRoles.length > 0 && (
                        <select
                          value={selectedRoleId}
                          onChange={(e) => setSelectedRoleId(e.target.value)}
                          className="px-2 py-1 rounded-lg border text-xs outline-none"
                          style={inputStyle}
                        >
                          <option value="">Custom role…</option>
                          {openRoles.map((r: any) => (
                            <option key={r.roleId} value={r.roleId}>
                              {r.title}
                            </option>
                          ))}
                        </select>
                      )}
                      {(openRoles.length === 0 || !selectedRoleId) && (
                        <input
                          type="text"
                          value={roleDraft}
                          onChange={(e) => setRoleDraft(e.target.value.slice(0, 60))}
                          placeholder="Role"
                          maxLength={60}
                          className="w-24 px-2 py-1 rounded-lg border text-xs outline-none"
                          style={inputStyle}
                        />
                      )}
                      <button
                        disabled={submitting}
                        onClick={() => sendPersonInvite(p.userId)}
                        className="text-xs px-2 py-1 rounded-lg font-semibold whitespace-nowrap disabled:opacity-50"
                        style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
                      >
                        Send
                      </button>
                    </div>
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
          {openRoles.length > 0 && (
            <select
              value={creditRoleId}
              onChange={(e) => setCreditRoleId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
            >
              <option value="">Custom role…</option>
              {openRoles.map((r: any) => (
                <option key={r.roleId} value={r.roleId}>
                  {r.title}
                </option>
              ))}
            </select>
          )}
          {(openRoles.length === 0 || !creditRoleId) && (
            <input
              type="text"
              value={creditRole}
              onChange={(e) => setCreditRole(e.target.value.slice(0, 60))}
              placeholder="Role"
              maxLength={60}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
            />
          )}
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
  initial?: { name: string; priceCents: number; billing?: string; description?: string; benefits?: string[] };
  onSave: (data: { name: string; priceCents: number; billing: "one_time" | "monthly"; description?: string; benefits: string[] }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial ? String(initial.priceCents / 100) : "");
  const [billing, setBilling] = useState<"one_time" | "monthly">((initial?.billing as "one_time" | "monthly") ?? "monthly");
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
      billing,
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
          Type
        </label>
        <div className="flex gap-2">
          {([["monthly", "Monthly"], ["one_time", "One-time"]] as const).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setBilling(val)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: billing === val ? "var(--garden-citron)" : "var(--garden-ink)",
                color: billing === val ? "var(--garden-ink)" : "var(--garden-muted)",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          className="block text-xs uppercase tracking-[0.06em] mb-1.5"
          style={{ color: "var(--garden-dim)" }}
        >
          {billing === "one_time" ? "Price ($)" : "Price ($/mo)"}
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
    billing: "one_time" | "monthly";
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
        billing: data.billing,
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
    data: { name: string; priceCents: number; billing: "one_time" | "monthly"; description?: string; benefits: string[] },
  ) {
    setSaving(true);
    setError("");
    try {
      await updateTier({
        tierId,
        name: data.name,
        priceCents: data.priceCents,
        billing: data.billing,
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
                billing: tier.billing,
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
                  ${(tier.priceCents / 100).toFixed(0)}{tier.billing === "one_time" ? "" : "/mo"}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-[0.06em]"
                  style={{
                    fontFamily: "var(--garden-font-mono)",
                    backgroundColor: tier.isActive ? "rgba(254,226,104,0.15)" : "rgba(198,198,190,0.1)",
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
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
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
                className="text-xs uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
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
