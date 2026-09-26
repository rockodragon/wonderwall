// /today — the signed-in home. Replaces landing on /search (People) after
// sign-in: the first thing a member sees is The Garden itself — Creator
// Notes, the project worth looking at this week, what's open to join, and
// the paid work on offer — built from the "Garden Home v2" design, set
// inside the garden-first rail (routes/_app.tsx).
//
// Every number and badge here comes from a real row. Where the design had
// sample content with no data behind it (viewer counts, host name tags,
// open-role and application counts) the element is left out rather than
// faked. Money wording goes through CLAIMS or the shared budget helpers, the
// same as the /projects cards.
//
// Hooks stay above every return — a Rules-of-Hooks violation crashed a
// Garden page before.

import { useQuery } from "convex/react";
import { Link } from "react-router";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { formatMoney } from "../garden/ui";
import { budgetAmountLabel, budgetKindLabel } from "../lib/budgetLabel";
import { CLAIMS } from "../constants/claims";
import { YOUTUBE_CHANNEL_URL, YOUTUBE_LIVE_URL } from "../constants/broadcast";

export function meta() {
  return [{ title: "Today — The Garden" }];
}

const MONO: CSSProperties = { fontFamily: "var(--garden-font-mono)" };
const DISPLAY: CSSProperties = { fontFamily: "var(--garden-font-display)" };
const CARD: CSSProperties = {
  backgroundColor: "var(--app-surface-raised)",
  borderColor: "var(--app-hairline)",
};
// The empty-cover hatch from the garden-first mocks: a picture-shaped space
// that says "no picture yet" without pretending to be one.
const HATCH: CSSProperties = {
  backgroundColor: "var(--app-surface-raised)",
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--app-hairline) 0 14px, transparent 14px 28px)",
};

const COLLAPSE_KEY = "today.creatorNotes.collapsed";
const LIST_LIMIT = 6;
// An event with no end time is treated as running this long after it starts.
const DEFAULT_EPISODE_MS = 2 * 60 * 60 * 1000;

type Project = NonNullable<ReturnType<typeof useProjects>>[number];

function useProjects() {
  return useQuery(api.garden.projects.listProjects);
}

export default function Today() {
  const projects = useProjects();
  const events = useQuery(api.events.list, {});
  const profile = useQuery(api.profiles.getMyProfile);
  const [genre, setGenre] = useState<string>("all");

  const episode = useMemo(() => pickEpisode(events ?? []), [events]);

  const { featured, open, gigs } = useMemo(() => {
    const all = projects ?? [];
    const passion = all.filter((p) => p.kind === "passion" && p.status !== "completed");
    const paid = all.filter(
      (p) =>
        p.kind === "paid" &&
        p.status !== "completed" &&
        budgetKindLabel(p) === "Paid" &&
        (!p.gig || p.gig.status === "open"),
    );
    const featured =
      passion.find((p) => (p.goal ?? 0) > 0 && coverOf(p)) ??
      [...passion, ...paid].find((p) => coverOf(p)) ??
      passion[0] ??
      paid[0] ??
      null;
    return {
      featured,
      open: passion.filter((p) => p._id !== featured?._id),
      gigs: paid.filter((p) => p._id !== featured?._id),
    };
  }, [projects]);

  // Genre chips come from the tags the open projects actually carry — a
  // chip that filters to nothing is never offered.
  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of open) for (const t of topicsOf(p)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  }, [open]);
  const shownOpen = (genre === "all" ? open : open.filter((p) => topicsOf(p).includes(genre))).slice(0, LIST_LIMIT);

  const profileEmpty = profile !== undefined && profile !== null && !profile.bio && !profile.imageUrl;
  const loading = projects === undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-10 pt-6 md:pt-10 pb-16" style={{ color: "var(--app-text)" }}>
      <div className="flex items-baseline justify-between gap-4 mb-6">
        <MonoLabel as="h1">Today in The Garden</MonoLabel>
        <MonoLabel>{formatToday()}</MonoLabel>
      </div>

      <CreatorNotes episode={episode} />

      <Section
        title="Featured project"
        mono
        action={<SectionLink to="/projects">All projects →</SectionLink>}
      >
        {loading ? (
          <Skeleton height={320} />
        ) : featured ? (
          <FeaturedProject project={featured} />
        ) : (
          <EmptyNote>
            Nothing posted yet. <Link to="/projects" className="underline">Post the first project</Link>.
          </EmptyNote>
        )}
      </Section>

      {(loading || open.length > 0) && (
        <Section
          title="Open projects"
          action={
            genres.length > 1 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by discipline">
                {["all", ...genres].map((g) => (
                  <Chip key={g} active={genre === g} onClick={() => setGenre(g)}>
                    {g === "all" ? "All" : g}
                  </Chip>
                ))}
              </div>
            ) : undefined
          }
        >
          {loading ? (
            <Skeleton height={140} />
          ) : shownOpen.length > 0 ? (
            <div className="space-y-3">
              {shownOpen.map((p) => (
                <ProjectRow key={p._id} project={p} />
              ))}
            </div>
          ) : (
            <EmptyNote>No open projects in {genre} yet.</EmptyNote>
          )}
        </Section>
      )}

      {(loading || gigs.length > 0) && (
        <Section title="Paid gigs" action={<SectionLink to="/projects">All gigs →</SectionLink>}>
          {loading ? (
            <Skeleton height={64} />
          ) : (
            <div className="rounded-xl border divide-y" style={{ ...CARD, borderColor: "var(--app-hairline)" }}>
              {gigs.slice(0, LIST_LIMIT).map((p) => (
                <GigRow key={p._id} project={p} />
              ))}
            </div>
          )}
        </Section>
      )}

      <div className={`mt-14 grid gap-4 ${profileEmpty ? "md:grid-cols-2" : ""}`}>
        {profileEmpty && <EmptyProfileCard />}
        <BackersCard />
      </div>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// Creator Notes
// ——————————————————————————————————————————————————————————————

type EventRow = {
  _id: string;
  title: string;
  datetime: number;
  endTime?: number;
  coverImageUrl: string | null;
  mediaPreviewUrl?: string;
};
type Episode = { event: EventRow; live: boolean } | null;

/** The Creator Notes episode on air now, else the next one scheduled. Read
 * off the ordinary events list by title — the show is posted as events. */
function pickEpisode(events: readonly EventRow[]): Episode {
  const now = Date.now();
  const shows = events.filter((e) => /creator notes/i.test(e.title));
  const onAir = shows.find((e) => e.datetime <= now && now < (e.endTime ?? e.datetime + DEFAULT_EPISODE_MS));
  if (onAir) return { event: onAir, live: true };
  const next = shows.filter((e) => e.datetime > now).sort((a, b) => a.datetime - b.datetime)[0];
  return next ? { event: next, live: false } : null;
}

function CreatorNotes({ episode }: { episode: Episode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage blocked — the show just stays open.
    }
  }, []);
  function setAndStore(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      // Nothing to remember it in; the choice lasts for this visit.
    }
  }

  const live = !!episode?.live;
  const watchUrl = live ? YOUTUBE_LIVE_URL : YOUTUBE_CHANNEL_URL;
  const when = episode && !live ? formatShowTime(episode.event.datetime) : null;
  const cover = episode ? (episode.event.coverImageUrl ?? episode.event.mediaPreviewUrl ?? null) : null;

  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3" style={CARD}>
        <StatusPill live={live} when={when} />
        <MonoLabel strong>Creator Notes</MonoLabel>
        {episode && (
          <span className="text-sm truncate min-w-0" style={{ color: "var(--app-text-muted)" }}>
            {episode.event.title}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="text-xs uppercase tracking-[0.1em] hover:underline" style={{ ...MONO, color: "var(--app-accent-ink)" }}>
            {live ? "Watch live →" : "YouTube →"}
          </a>
          <GhostButton onClick={() => setAndStore(false)}>Expand</GhostButton>
        </span>
      </div>
    );
  }

  return (
    <section className="grid gap-8 md:grid-cols-2 md:items-center" aria-label="Creator Notes">
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <StatusPill live={live} when={when} />
          <MonoLabel>Creator Notes</MonoLabel>
        </div>
        <h2 className="text-[40px] md:text-[52px] leading-[1.02] font-semibold tracking-[-0.02em]" style={DISPLAY}>
          Building in public. <span style={{ color: "var(--app-accent-ink)" }}>Join us.</span>
        </h2>
        <p className="mt-5 text-base leading-relaxed max-w-md" style={{ color: "var(--app-text-muted)" }}>
          Creator Notes is our video podcast. We talk with filmmakers, musicians and artists, and we work
          out loud on what we're making together, live, with the community in the room.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <PrimaryLink href={watchUrl} external>
            <PlayGlyph /> {live ? "Watch live on YouTube" : "Watch on YouTube"}
          </PrimaryLink>
          <SecondaryLink href={`${YOUTUBE_CHANNEL_URL}/streams`} external>
            Past episodes
          </SecondaryLink>
          {episode && <SecondaryLink to={`/events/${episode.event._id}`}>Episode page</SecondaryLink>}
        </div>
      </div>

      <div className="relative">
        <div className="flex justify-end mb-2">
          <GhostButton onClick={() => setAndStore(true)} label="Close Creator Notes">
            × Close
          </GhostButton>
        </div>
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block aspect-video overflow-hidden rounded-xl border"
          style={{ ...(cover ? { backgroundColor: "#121212" } : HATCH), borderColor: live ? "var(--app-accent)" : "var(--app-hairline)" }}
          aria-label={live ? "Watch Creator Notes live on YouTube" : "Creator Notes on YouTube"}
        >
          {cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 35%, transparent 60%, rgba(0,0,0,0.7) 100%)" }} />
          <div className="absolute top-3 left-3 flex items-center gap-2">
            {live ? (
              <span className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold uppercase tracking-[0.1em]" style={{ ...MONO, backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> Live
              </span>
            ) : (
              <span className="rounded px-2 py-1 text-xs uppercase tracking-[0.1em]" style={{ ...MONO, backgroundColor: "rgba(18,18,18,0.8)", color: "#f7f7f4" }}>
                {when ? `Starts ${when}` : "On YouTube"}
              </span>
            )}
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-105" style={{ backgroundColor: "rgba(247,247,244,0.92)", color: "#121212" }}>
              <PlayGlyph />
            </span>
            <span className="h-1 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(247,247,244,0.25)" }}>
              <span className="block h-full" style={{ width: live ? "100%" : "0%", backgroundColor: "var(--garden-citron)" }} />
            </span>
            <span className="text-xs uppercase tracking-[0.1em]" style={{ ...MONO, color: "#f7f7f4" }}>
              {live ? "Live" : episode ? "Up next" : "Watch"}
            </span>
          </div>
        </a>
      </div>
    </section>
  );
}

function StatusPill({ live, when }: { live: boolean; when: string | null }) {
  if (live) {
    return (
      <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.1em]" style={{ ...MONO, backgroundColor: "var(--app-accent-wash)", color: "var(--app-accent-ink)" }}>
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> Live now
      </span>
    );
  }
  if (!when) return null;
  return (
    <span className="rounded-full border px-2.5 py-1 text-xs uppercase tracking-[0.1em]" style={{ ...MONO, borderColor: "var(--app-hairline-raised)", color: "var(--app-text-muted)" }}>
      Next live · {when}
    </span>
  );
}

// ——————————————————————————————————————————————————————————————
// Projects
// ——————————————————————————————————————————————————————————————

function FeaturedProject({ project }: { project: Project }) {
  const cover = coverOf(project);
  const funded = fundingOf(project);
  const deadline = project.kind === "passion" && project.raiseByDate && project.raiseByDate > Date.now() ? project.raiseByDate : null;
  const facts: { label: string; value: string }[] = [];
  if (deadline) facts.push({ label: "Deadline", value: formatDay(deadline) });
  if (project.supportCount > 0) facts.push({ label: "Backers", value: String(project.supportCount) });
  if (project.creator) facts.push({ label: "By", value: project.creator.name });
  if (project.kind === "paid") {
    const money = moneyOf(project);
    if (money) facts.unshift({ label: "Pay", value: money });
  }

  return (
    <article className="grid overflow-hidden rounded-xl border md:grid-cols-2" style={CARD}>
      <Link to={`/projects/${project._id}`} className="block aspect-[4/3] md:aspect-auto md:min-h-[320px]" style={cover ? { backgroundColor: "#121212" } : HATCH} tabIndex={-1} aria-hidden>
        {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
      </Link>
      <div className="flex flex-col p-6 md:p-8">
        <Badges project={project} />
        <h3 className="mt-4 text-[32px] leading-tight font-semibold tracking-[-0.01em]" style={DISPLAY}>
          <Link to={`/projects/${project._id}`} className="hover:underline">
            {project.title}
          </Link>
        </h3>
        {project.blurb && (
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            {project.blurb}
          </p>
        )}
        {funded && (
          <div className="mt-5">
            <div className="flex justify-between text-xs mb-2" style={{ ...MONO, color: "var(--app-text-dim)" }}>
              <span>
                {funded.raised} of {funded.goal} raised
              </span>
              <span style={{ color: "var(--app-accent-ink)" }}>{funded.pct}%</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--app-hairline)" }}>
              <div className="h-full" style={{ width: `${funded.pct}%`, backgroundColor: "var(--app-accent)" }} />
            </div>
          </div>
        )}
        {facts.length > 0 && (
          <dl className="mt-5 grid grid-cols-3 gap-4">
            {facts.slice(0, 3).map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-xs uppercase tracking-[0.1em]" style={{ ...MONO, color: "var(--app-text-dim)" }}>
                  {f.label}
                </dt>
                <dd className="mt-1 text-[15px] truncate">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-auto pt-6 flex flex-wrap gap-2">
          <PrimaryLink to={`/projects/${project._id}`}>{ctaOf(project)}</PrimaryLink>
          {project.creator && <SecondaryLink to={`/profile/${project.creator._id}`}>About {firstName(project.creator.name)}</SecondaryLink>}
        </div>
      </div>
    </article>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const cover = coverOf(project);
  const funded = fundingOf(project);
  const daysLeft = project.raiseByDate && project.raiseByDate > Date.now() ? Math.max(1, Math.ceil((project.raiseByDate - Date.now()) / 86400000)) : null;
  return (
    <Link
      to={`/projects/${project._id}`}
      className="group grid gap-4 rounded-xl border p-3 transition-colors hover:border-[var(--app-hairline-raised)] sm:grid-cols-[180px_1fr]"
      style={CARD}
    >
      <div className="hidden sm:block aspect-[16/10] overflow-hidden rounded-lg" style={cover ? { backgroundColor: "#121212" } : HATCH}>
        {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="flex min-w-0 flex-col py-1 pr-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h3 className="text-lg font-semibold leading-snug group-hover:underline" style={DISPLAY}>
            {project.title}
          </h3>
          <Badges project={project} />
        </div>
        {project.blurb && (
          <p className="mt-1 text-sm line-clamp-2" style={{ color: "var(--app-text-muted)" }}>
            {project.blurb}
          </p>
        )}
        <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.08em]" style={{ ...MONO, color: "var(--app-text-dim)" }}>
          <span>
            {project.creator?.name ?? "A Garden creative"}
            {funded ? ` · ${funded.raised} of ${funded.goal}` : ""}
            {daysLeft ? ` · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left` : ""}
          </span>
          <span style={{ color: "var(--app-accent-ink)" }}>{ctaOf(project)} →</span>
        </div>
      </div>
    </Link>
  );
}

function GigRow({ project }: { project: Project }) {
  const topic = topicsOf(project)[0];
  const when = project.gig ? (project.gig.nextDateLabel ? `${project.gig.schedule} · next ${project.gig.nextDateLabel}` : project.gig.schedule) : project.location;
  const money = moneyOf(project);
  return (
    <div className="grid items-center gap-3 px-4 py-3.5 sm:grid-cols-[1fr_auto_auto_auto]" style={{ borderColor: "var(--app-hairline)" }}>
      <div className="min-w-0">
        <Link to={`/projects/${project._id}`} className="block truncate text-[15px] font-medium hover:underline">
          {project.title}
        </Link>
        <p className="truncate text-[13px]" style={{ color: "var(--app-text-dim)" }}>
          {[project.creator?.name, when].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {topic && <Tag>{topic}</Tag>}
        <Tag>{project.remote === false ? "In person" : "Remote OK"}</Tag>
      </div>
      <span className="text-lg font-semibold whitespace-nowrap sm:text-right" style={{ ...DISPLAY, color: "var(--app-accent-ink)" }}>
        {money ?? ""}
      </span>
      <SecondaryLink to={`/projects/${project._id}`} small>
        {project.gig ? "Respond" : "Apply"}
      </SecondaryLink>
    </div>
  );
}

function Badges({ project }: { project: Project }) {
  const topic = topicsOf(project)[0];
  return (
    <div className="flex flex-wrap gap-1.5">
      <Tag accent={project.kind === "paid"}>{project.kind === "paid" ? (project.gig ? "Gig" : "Paid") : "Passion"}</Tag>
      {topic && <Tag>{topic}</Tag>}
      {project.community && <Tag>{project.community.name}</Tag>}
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// You + backers
// ——————————————————————————————————————————————————————————————

function EmptyProfileCard() {
  return (
    <section className="flex flex-col rounded-xl border border-dashed p-6 md:p-7" style={{ borderColor: "var(--app-hairline-raised)" }}>
      <div className="flex items-start gap-4">
        <div className="shrink-0 text-center">
          <svg viewBox="0 0 72 72" width="68" height="68" fill="none" aria-hidden style={{ color: "var(--app-text-dim)" }}>
            <circle cx="36" cy="36" r="35" stroke="currentColor" strokeDasharray="3 3" />
            <circle cx="36" cy="29" r="9" stroke="currentColor" strokeWidth="1.5" />
            <path d="M16 62c3-11 11-17 20-17s17 6 20 17" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="mt-1 block text-xs uppercase tracking-[0.2em]" style={{ ...MONO, color: "var(--app-accent-ink)" }}>
            You
          </span>
        </div>
        <div>
          <h2 className="text-2xl font-semibold" style={DISPLAY}>
            Your profile is empty.
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            Add your work, your craft and what you're open to: paid gigs, collabs or passion projects.
          </p>
        </div>
      </div>
      <p className="mt-5 text-sm leading-relaxed">{CLAIMS.theGarden}</p>
      <div className="mt-auto pt-6 flex flex-wrap gap-2">
        <PrimaryLink to="/settings">Start your profile</PrimaryLink>
        <SecondaryLink to="/projects">Post a project</SecondaryLink>
      </div>
    </section>
  );
}

function BackersCard() {
  return (
    <section className="flex flex-col rounded-xl border p-6 md:p-7" style={CARD}>
      <MonoLabel>For patrons & backers</MonoLabel>
      <h2 className="mt-3 text-2xl font-semibold" style={DISPLAY}>
        Back the work, not the algorithm.
      </h2>
      <p className="mt-2 text-sm leading-relaxed max-w-md" style={{ color: "var(--app-text-muted)" }}>
        {CLAIMS.patron} {CLAIMS.coverage}
      </p>
      <div className="mt-auto pt-6 flex flex-wrap gap-2">
        <PrimaryLink to="/projects">Back a project</PrimaryLink>
        <SecondaryLink to="/coverage">Cover a membership</SecondaryLink>
      </div>
    </section>
  );
}

// ——————————————————————————————————————————————————————————————
// Small pieces
// ——————————————————————————————————————————————————————————————

function Section({ title, mono, action, children }: { title: string; mono?: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-14">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        {mono ? (
          <MonoLabel as="h2">{title}</MonoLabel>
        ) : (
          <h2 className="text-[28px] font-semibold tracking-[-0.01em]" style={DISPLAY}>
            {title}
          </h2>
        )}
        {action}
      </div>
      {children}
    </section>
  );
}

function MonoLabel({ children, as = "span", strong }: { children: ReactNode; as?: "span" | "h1" | "h2"; strong?: boolean }) {
  const Tag = as;
  return (
    <Tag className="text-xs uppercase tracking-[0.16em] font-normal" style={{ ...MONO, color: strong ? "var(--app-text)" : "var(--app-text-dim)" }}>
      {children}
    </Tag>
  );
}

function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-xs uppercase tracking-[0.12em] hover:underline" style={{ ...MONO, color: "var(--app-accent-ink)" }}>
      {children}
    </Link>
  );
}

function Tag({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className="rounded px-2 py-0.5 text-xs uppercase tracking-[0.08em] whitespace-nowrap border"
      style={{
        ...MONO,
        borderColor: accent ? "transparent" : "var(--app-hairline-raised)",
        backgroundColor: accent ? "var(--app-accent-wash)" : "transparent",
        color: accent ? "var(--app-accent-ink)" : "var(--app-text-muted)",
      }}
    >
      {children}
    </span>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-[13.5px] transition-colors"
      style={{
        borderColor: active ? "var(--app-accent)" : "var(--app-hairline-raised)",
        backgroundColor: active ? "var(--app-accent-wash)" : "transparent",
        color: active ? "var(--app-accent-ink)" : "var(--app-text-muted)",
      }}
    >
      {children}
    </button>
  );
}

const BUTTON = "inline-flex items-center gap-2 rounded-lg font-semibold transition-opacity hover:opacity-90";

function PrimaryLink({ to, href, external, children }: { to?: string; href?: string; external?: boolean; children: ReactNode }) {
  const className = `${BUTTON} px-4 py-2.5 text-[13.5px]`;
  const style = { backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" };
  if (href) {
    return (
      <a href={href} className={className} style={style} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to!} className={className} style={style}>
      {children}
    </Link>
  );
}

function SecondaryLink({ to, href, external, small, children }: { to?: string; href?: string; external?: boolean; small?: boolean; children: ReactNode }) {
  const className = `${BUTTON} border ${small ? "px-3 py-1.5" : "px-4 py-2.5"} text-[13.5px] font-medium hover:bg-[var(--app-hairline)]`;
  const style = { borderColor: "var(--app-hairline-raised)", color: "var(--app-text)" };
  if (href) {
    return (
      <a href={href} className={className} style={style} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to!} className={className} style={style}>
      {children}
    </Link>
  );
}

function GhostButton({ onClick, label, children }: { onClick: () => void; label?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded border px-2.5 py-1 text-xs uppercase tracking-[0.1em] transition-colors hover:bg-[var(--app-hairline)]"
      style={{ ...MONO, borderColor: "var(--app-hairline-raised)", color: "var(--app-text-muted)" }}
    >
      {children}
    </button>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border px-5 py-6 text-sm" style={{ ...CARD, color: "var(--app-text-muted)" }}>
      {children}
    </p>
  );
}

function Skeleton({ height }: { height: number }) {
  return <div className="rounded-xl border animate-pulse" style={{ ...CARD, height }} aria-hidden />;
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor" aria-hidden>
      <path d="M3 1.5v9l7.5-4.5z" />
    </svg>
  );
}

// ——————————————————————————————————————————————————————————————
// Helpers
// ——————————————————————————————————————————————————————————————

function coverOf(p: Project): string | null {
  return p.resolvedPhotoUrl ?? p.mediaPreviewUrl ?? p.media.find((m) => m.resolvedMediaUrl && m.type === "image")?.resolvedMediaUrl ?? null;
}

function topicsOf(p: Project): string[] {
  return (p.interests?.length ? p.interests : (p.creator?.interests ?? [])).filter((t) => !t.startsWith("other:"));
}

function fundingOf(p: Project): { raised: string; goal: string; pct: number } | null {
  if (p.kind !== "passion" || !p.goal || p.goal <= 0) return null;
  const raisedCents = p.raisedCents ?? 0;
  return {
    raised: formatMoney(raisedCents),
    goal: formatMoney(p.goal * 100),
    pct: Math.min(100, Math.round((raisedCents / (p.goal * 100)) * 100)),
  };
}

/** Same money half the /projects cards print; a gig's pay is per date. */
function moneyOf(p: Project): string | null {
  const amount = budgetAmountLabel(p);
  return amount && p.gig && p.budgetType === "amount" ? `${amount}/date` : amount;
}

function ctaOf(p: Project): string {
  if (p.kind === "paid") return p.gig ? "Respond to the gig" : "Apply";
  return p.goal && p.goal > 0 ? "Back this project" : "See the project";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Thu 7pm" — the show's local start, in the viewer's time zone. */
function formatShowTime(ms: number): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
  return `${day} ${time}`;
}
