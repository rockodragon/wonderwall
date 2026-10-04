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
import { CLAIMS } from "../constants/claims";
import { resolveStage, stageLabel } from "../lib/stage";
import { Dissolve } from "../hooks/useReveal";
import { AbstractCover } from "../components/AbstractCover";
import { coverOf, fundingOf, moneyOf, pickProjects } from "../lib/projectPick";
import { FF_DESK } from "../lib/featureFlags";
import { Desk } from "../desk/Desk";
import { useIsDesktop } from "../hooks/useMediaQuery";
import { UpdatesStack } from "../components/UpdatesStack";
import { PhoneNeedsYou } from "../components/shortlist/PhoneParts";
import { useShortlist } from "../lib/shortlist/useShortlist";
import { GardenLockup } from "../brand/GardenMark";
import { useDeskCommunity } from "../desk/deskState";

export function meta() {
  return [{ title: "Today — The Garden" }];
}

const MONO: CSSProperties = { fontFamily: "var(--garden-font-mono)" };
const DISPLAY: CSSProperties = { fontFamily: "var(--garden-font-display)" };
const CARD: CSSProperties = {
  backgroundColor: "var(--app-surface-raised)",
  borderColor: "var(--app-hairline)",
};

const COLLAPSE_KEY = "today.creatorNotes.collapsed";
const LIST_LIMIT = 5;
// An event with no end time is treated as running this long after it starts.
const DEFAULT_EPISODE_MS = 2 * 60 * 60 * 1000;

type Project = NonNullable<ReturnType<typeof useProjects>>[number];

function useProjects() {
  return useQuery(api.garden.projects.listProjects);
}

// Desktop (md and up) opens on the desk instead of this page, behind FF_DESK
// (docs/features/desktop-desk-palette.md). Phones keep the page below. Both
// branches mount their own hooks, so the switch never changes hook order
// inside either one.
export default function Today() {
  const isDesktop = useIsDesktop();
  return FF_DESK && isDesktop ? <Desk /> : <TodayPage />;
}

function TodayPage() {
  const projects = useProjects();
  const events = useQuery(api.events.list, {});
  const profile = useQuery(api.profiles.getMyProfile);
  // Read defensively: before the backend deploy this query doesn't exist and
  // the card simply doesn't show.
  const giving = useQuery(api.garden.giving.getMyGiving);
  const openGift = giving?.open?.[0];
  // Today is signed-in only (routes/_app.tsx), so there's always a Shortlist.
  const shortlist = useShortlist();

  const episode = useMemo(() => pickEpisode(events ?? []), [events]);

  const { featured, open, gigs } = useMemo(() => pickProjects(projects ?? []), [projects]);

  const shownOpen = open.slice(0, LIST_LIMIT);
  const shownGigs = gigs.slice(0, LIST_LIMIT);

  const garden = useDeskCommunity() === "garden";

  const profileEmpty = profile !== undefined && profile !== null && !profile.bio && !profile.imageUrl;
  const loading = projects === undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-10 pt-8 md:pt-14 pb-24" style={{ color: "var(--app-text)" }}>
      {/* The Garden's lockup leads, never in capitals, on any address
          (docs/features/garden-brand-domains.md); the heading stays for
          screen readers. */}
      {garden ? (
        <div className="flex items-center justify-between gap-4 mb-14">
          <GardenLockup fontSize={16} />
          <h1 className="sr-only">Today</h1>
          <MonoLabel>{formatToday()}</MonoLabel>
        </div>
      ) : (
        <div className="flex items-baseline justify-between gap-4 mb-14">
          <MonoLabel as="h1">Today in The Garden</MonoLabel>
          <MonoLabel>{formatToday()}</MonoLabel>
        </div>
      )}

      {/* Needs you leads (docs/handoff/favorites-redesign/README.md): what
          you owe a reply or an appearance to, the Shortlist's own rows, up to
          three and a way to the rest. Nothing at all when nothing needs you. */}
      {shortlist.status === "ready" && shortlist.needs.length > 0 && (
        <div className="mb-10">
          <PhoneNeedsYou needs={shortlist.needs} money={formatMoney} more="link" />
        </div>
      )}

      {/* Updates come next (docs/features/desk-updates.md). */}
      <UpdatesStack />

      {openGift && <YourHalfCard amountCents={openGift.amountCents} />}

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

      {/* Browsing, not acting (today-page-ux-review-2026-09-26.md): a
          short list, every row a link that says "See →", and the section
          stays on the page when it's empty so a new member learns it
          exists. Backing and responding live on the project page. */}
      <Section title="Open projects" action={<SectionLink to="/projects">{countLabel("project", open.length)} →</SectionLink>}>
        {loading ? (
          <Skeleton height={140} />
        ) : shownOpen.length > 0 ? (
          <div className="space-y-16 md:space-y-20">
            {shownOpen.map((p, i) => (
              <ProjectRow key={p._id} project={p} flip={i % 2 === 1} />
            ))}
          </div>
        ) : (
          <EmptyNote>
            No open projects yet.{" "}
            <Link to="/projects" className="underline">
              Post one
            </Link>
            .
          </EmptyNote>
        )}
      </Section>

      {/* The Jobs and gigs chip, not only its recurring gigs: this list is
          every paid posting, series or not. */}
      <Section title="Paid work" action={<SectionLink to="/projects?show=work">{countLabel("posting", gigs.length)} →</SectionLink>}>
        {loading ? (
          <Skeleton height={64} />
        ) : shownGigs.length > 0 ? (
          <div className="rounded-xl border divide-y" style={{ ...CARD, borderColor: "var(--app-hairline)" }}>
            {shownGigs.map((p) => (
              <GigRow key={p._id} project={p} />
            ))}
          </div>
        ) : (
          <EmptyNote>
            No paid gigs yet.{" "}
            <Link to="/projects" className="underline">
              Post one
            </Link>
            .
          </EmptyNote>
        )}
      </Section>

      <div className={`mt-32 grid gap-8 ${profileEmpty ? "md:grid-cols-2" : ""}`}>
        {profileEmpty && <EmptyProfileCard />}
        <BackersCard />
      </div>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// Monthly grant — shown only while a monthly amount is open to give

function YourHalfCard({ amountCents }: { amountCents: number }) {
  return (
    <section
      className="rounded-xl border px-5 py-6 md:px-7 md:py-7 mb-14"
      style={CARD}
      aria-label="Monthly grant"
    >
      <h2 className="text-2xl md:text-[28px] font-semibold leading-tight" style={{ ...DISPLAY, color: "var(--app-text)" }}>
        You have {formatMoney(amountCents)} to give.
      </h2>
      <div className="mt-4">
        <PrimaryLink to="/give">Pick who gets it</PrimaryLink>
      </div>
    </section>
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
  tags?: string[];
};
type Episode = { event: EventRow; live: boolean } | null;

/** The Creator Notes episode on air now, else the next one scheduled. Read
 * off the ordinary events list — the show is posted as events, found by
 * "Creator Notes" in the title or in the tags (an episode can have its own
 * title, like "What is this and why?"). */
function pickEpisode(events: readonly EventRow[]): Episode {
  const now = Date.now();
  const shows = events.filter((e) => /creator notes/i.test(e.title) || (e.tags ?? []).some((t) => /^creator notes$/i.test(t)));
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
  // With an episode on the calendar, everything opens its event page, where
  // people sign up and the stream plays. There is no direct YouTube link:
  // with nothing scheduled the card is text only.
  const episodePath = episode ? `/events/${episode.event._id}` : null;
  const when = episode && !live ? formatShowTime(episode.event.datetime) : null;

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
          {episodePath && (
            <Link to={episodePath} className="text-xs uppercase tracking-[0.1em] hover:underline" style={{ ...MONO, color: "var(--app-accent-ink)" }}>
              {live ? "Watch live →" : "Sign up →"}
            </Link>
          )}
          <GhostButton onClick={() => setAndStore(false)}>Expand</GhostButton>
        </span>
      </div>
    );
  }

  return (
    <section className="grid gap-10 md:grid-cols-[3fr_2fr] md:items-center" aria-label="Creator Notes">
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <StatusPill live={live} when={when} />
          <MonoLabel>Video podcast</MonoLabel>
        </div>
        <h2 className="text-[44px] md:text-[60px] leading-[1] font-semibold tracking-[-0.02em]" style={DISPLAY}>
          Creator Notes
        </h2>
        <p className="mt-5 text-[17px] leading-relaxed max-w-xl">
          Join us as we sit down for frank discussions with filmmakers, musicians, artists and other
          creatives, and get behind the motivations, struggles and aspirations of the community.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          {episodePath && (
            <PrimaryLink to={episodePath}>
              {live ? (
                <>
                  <PlayGlyph /> Watch live
                </>
              ) : (
                "Sign up"
              )}
            </PrimaryLink>
          )}
        </div>
      </div>

      <div className="relative w-full max-w-sm md:justify-self-end">
        <div className="flex justify-end mb-2">
          <GhostButton onClick={() => setAndStore(true)} label="Close Creator Notes">
            × Close
          </GhostButton>
        </div>
        {/* A drawing of the show's notebook, not a photo: the hosts aren't
            the point of the card, and a frame grab would put a face on the
            home page nobody asked to be there. */}
        <Frame
          to={episodePath}
          className="group relative block aspect-video overflow-hidden rounded-xl border"
          style={{ backgroundColor: "var(--app-surface-raised)", borderColor: live ? "var(--app-accent)" : "var(--app-hairline)" }}
          label={live ? "Watch Creator Notes live" : "Sign up for the next Creator Notes"}
        >
          <NotebookDrawing />
          <div className="absolute top-3 left-3 flex items-center gap-2">
            {live ? (
              <span className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold uppercase tracking-[0.1em]" style={{ ...MONO, backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> Live
              </span>
            ) : (
              <span className="rounded border px-2 py-1 text-xs uppercase tracking-[0.1em]" style={{ ...MONO, borderColor: "var(--app-hairline-raised)", backgroundColor: "var(--app-surface)", color: "var(--app-text-muted)" }}>
                {when ? `Starts ${when}` : "Coming soon"}
              </span>
            )}
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-105" style={{ backgroundColor: "var(--app-text)", color: "var(--app-surface)" }}>
              <PlayGlyph />
            </span>
            <span className="h-1 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--app-hairline-raised)" }}>
              <span className="block h-full" style={{ width: live ? "100%" : "0%", backgroundColor: "var(--garden-citron)" }} />
            </span>
          </div>
        </Frame>
      </div>
    </section>
  );
}

/** The picture frame: a link to the episode page when there is one, else a
    plain box. */
function Frame({ to, className, style, label, children }: { to: string | null; className: string; style: CSSProperties; label: string; children: ReactNode }) {
  if (!to) return <div className={className} style={style}>{children}</div>;
  return (
    <Link to={to} className={className} style={style} aria-label={label}>
      {children}
    </Link>
  );
}

/** An open production notebook beside a clapperboard, in hairline strokes —
    muted on purpose, so it reads as the show's placeholder, not as artwork. */
function NotebookDrawing() {
  return (
    <svg
      viewBox="0 0 320 180"
      className="absolute inset-0 h-full w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ color: "var(--app-text-dim)" }}
    >
      {/* notebook, open, two pages and a spiral */}
      <path d="M58 44h78v96H58zM140 44h78v96h-78z" />
      {[52, 62, 72, 82, 92, 102, 112, 122, 132].map((y) => (
        <circle key={y} cx="138" cy={y} r="2.2" />
      ))}
      {[62, 74, 86, 98, 110].map((y) => (
        <path key={`l${y}`} d={`M68 ${y}h${y === 62 ? 40 : 58}`} opacity="0.7" />
      ))}
      {/* a shot list on the right page: boxes and scribbles */}
      <path d="M150 58h24v16h-24zM180 62h28M180 68h20M150 82h24v16h-24zM180 86h28M180 92h16M150 106h24v16h-24zM180 110h24" opacity="0.7" />
      {/* clapperboard */}
      <path d="M232 88h52v44h-52z" />
      <path d="M232 88l6-16 52 -6 -6 16" />
      <path d="M246 70l-4 16M260 68l-4 16M274 67l-4 16" opacity="0.7" />
      <path d="M240 100h36M240 110h26M240 120h30" opacity="0.6" />
    </svg>
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
  // The team and its open roles are what someone deciding whether to join
  // needs; only the featured card pays for these two lookups.
  const team = useQuery(api.garden.projectTeam.getTeam, { projectId: project._id });
  const roles = useQuery(api.garden.projectTeam.listRoles, { projectId: project._id });
  const cover = coverOf(project);
  const funded = fundingOf(project, formatMoney);
  const deadline = project.raiseByDate && project.raiseByDate > Date.now() ? project.raiseByDate : null;
  const openRoles = roles ? roles.filter((r) => r.status === "open").length : null;

  const facts: { label: string; value: string }[] = [{ label: "Stage", value: stageLabel(resolveStage(project)) }];
  if (project.kind === "paid") {
    const money = moneyOf(project);
    if (money) facts.push({ label: "Pay", value: money });
  }
  if (deadline) facts.push({ label: "Deadline", value: formatDay(deadline) });
  if (team) facts.push({ label: "Team", value: String(1 + team.accepted.length) });
  if (openRoles) facts.push({ label: "Open roles", value: String(openRoles) });
  if (project.supportCount > 0) facts.push({ label: "Backers", value: String(project.supportCount) });
  if (project.creator) facts.push({ label: "Lead", value: project.creator.name });

  return (
    <article className="grid overflow-hidden rounded-xl border md:grid-cols-[2fr_3fr]" style={CARD}>
      <Link to={`/projects/${project._id}`} className="block aspect-[16/9] md:aspect-auto md:min-h-[240px]" style={{ backgroundColor: "#121212" }} tabIndex={-1} aria-hidden>
        <Dissolve className="h-full w-full">
          {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <AbstractCover seed={project._id} />}
        </Dissolve>
      </Link>
      <div className="flex flex-col p-7 md:p-10">
        {/* Badges get their own line. Sharing the title's line squeezed
            "Small Acts: Neighbors" onto two lines for the sake of two pills;
            the title is the thing, the badges are incidental to it. */}
        <Badges project={project} />
        <h3 className="mt-4 text-[32px] leading-tight font-semibold tracking-[-0.01em]" style={DISPLAY}>
          <Link to={`/projects/${project._id}`} className="hover:underline">
            {project.title}
          </Link>
        </h3>
        {project.blurb && (
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            {project.blurb}
          </p>
        )}
        {funded && (
          <div className="mt-7">
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
        <dl className="mt-7 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-xs uppercase tracking-[0.1em]" style={{ ...MONO, color: "var(--app-text-dim)" }}>
                {f.label}
              </dt>
              <dd className="mt-1 text-[15px] truncate">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto pt-8">
          <PrimaryLink to={`/projects/${project._id}`}>See the project</PrimaryLink>
        </div>
      </div>
    </article>
  );
}

/** One open project, set wide: image on one side, words on the other, and
    the sides swap on every other row so a short list reads as a walk past
    a few things rather than a stack of identical cards. No card border —
    the space between rows is the separator. The whole row is the link. */
function ProjectRow({ project, flip }: { project: Project; flip: boolean }) {
  const cover = coverOf(project);
  const funded = fundingOf(project, formatMoney);
  const daysLeft = project.raiseByDate && project.raiseByDate > Date.now() ? Math.max(1, Math.ceil((project.raiseByDate - Date.now()) / 86400000)) : null;
  const meta = [
    stageLabel(resolveStage(project)),
    project.creator?.name ?? "A Garden creative",
    funded ? `${funded.raised} of ${funded.goal}` : null,
    daysLeft ? `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left` : null,
  ].filter(Boolean);
  return (
    <Link
      to={`/projects/${project._id}`}
      className="group grid items-center gap-8 md:grid-cols-2 md:gap-14"
    >
      <Dissolve
        className={`aspect-[4/3] overflow-hidden rounded-xl transition-transform duration-300 group-hover:scale-[1.01] ${flip ? "md:order-2" : ""}`}
        style={{ backgroundColor: "#121212" }}
      >
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <AbstractCover seed={project._id} />}
      </Dissolve>
      <div className={`min-w-0 ${flip ? "md:order-1" : ""}`}>
        <Badges project={project} />
        <h3 className="mt-4 text-[26px] md:text-[30px] leading-tight font-semibold tracking-[-0.01em] group-hover:underline" style={DISPLAY}>
          {project.title}
        </h3>
        {project.blurb && (
          <p className="mt-3 text-[15px] leading-relaxed line-clamp-3" style={{ color: "var(--app-text-muted)" }}>
            {project.blurb}
          </p>
        )}
        <p className="mt-5 text-xs uppercase tracking-[0.08em]" style={{ ...MONO, color: "var(--app-text-dim)" }}>
          {meta.join(" · ")}
        </p>
        <span className="mt-6 inline-block text-xs uppercase tracking-[0.1em]" style={{ ...MONO, color: "var(--app-accent-ink)" }}>
          See →
        </span>
      </div>
    </Link>
  );
}

function GigRow({ project }: { project: Project }) {
  const topic = topicsOf(project)[0];
  const when = project.gig ? (project.gig.nextDateLabel ? `${project.gig.schedule} · next ${project.gig.nextDateLabel}` : project.gig.schedule) : project.location;
  const money = moneyOf(project);
  return (
    <Link
      to={`/projects/${project._id}`}
      className="group grid items-center gap-4 px-5 py-5 transition-colors hover:bg-[var(--app-hairline)] sm:grid-cols-[1fr_auto_auto_auto]"
      style={{ borderColor: "var(--app-hairline)" }}
    >
      <div className="min-w-0">
        <span className="block truncate text-[15px] font-medium group-hover:underline">{project.title}</span>
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
      <span className="text-xs uppercase tracking-[0.08em] whitespace-nowrap" style={{ ...MONO, color: "var(--app-accent-ink)" }}>
        See →
      </span>
    </Link>
  );
}

function Badges({ project }: { project: Project }) {
  const topic = topicsOf(project)[0];
  return (
    <div className="flex flex-wrap gap-1.5">
      <Tag accent>{project.kind === "paid" ? (project.gig ? "Recurring gig" : "Job") : "Passion"}</Tag>
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
            Add your work, your craft and what you're open to: paid work, collabs or passion projects.
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
    <section className="mt-32">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
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

/** A filled pill, so it reads as a badge and not as a bordered label. */
function Tag({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-[0.06em] whitespace-nowrap"
      style={{
        ...MONO,
        backgroundColor: accent ? "var(--app-accent-wash)" : "var(--app-hairline)",
        color: accent ? "var(--app-accent-ink)" : "var(--app-text)",
      }}
    >
      {children}
    </span>
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

function topicsOf(p: Project): string[] {
  return (p.interests?.length ? p.interests : (p.creator?.interests ?? [])).filter((t) => !t.startsWith("other:"));
}

/** "All 12 projects" / "All gigs" while loading or empty. */
function countLabel(noun: string, n: number): string {
  return n > 0 ? `All ${n} ${noun}${n === 1 ? "" : "s"}` : `All ${noun}s`;
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
