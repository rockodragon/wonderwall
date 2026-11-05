// /admin/voting — project voting, for the showcase, a grant or a community
// fund. (/admin/showcase was its first address and still lands here.)
//
// The ballot is every project the browse grid lists (convex/showcase.ts
// adminList). Any Garden admin votes; a committee beyond admins is a later
// step. A vote is yes / maybe / no plus a note, upserted per (project,
// admin) by castVote, so changing your mind revises your own row and never
// touches anyone else's. Each card shows the tally, who voted which way,
// and your own vote held selected.
//
// A card is two columns: the work on the left — the picture a quarter of
// the width and flush to the card's edge, shown whole (convex/projectCover.ts,
// the same picture its page shows; on a phone, the full-width 4:5 cover on
// top), title, who it's by, and what people did about
// it, since cheers and backers are the public's vote — and everything the
// jury does on the right: your vote, your note, the decision. Voting and deciding stay separate
// (projects.showcaseStatus in schema.ts): the tally is the jury's opinion,
// the decision is the commitment, and nothing flips it however lopsided a
// tally gets.
//
// Sorting and filtering are client-side (lib/projectVoting.ts): the server
// hands over every row in jury order and a few hundred rows is nothing.
//
// Admin detection mirrors admin.tsx: useIsAdmin gates the query, so a
// non-admin gets a message instead of a server refusal.

import { useState } from "react";
import { CurrencyDollar, Heart } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { admin } from "../components/admin/adminStyles";
import {
  AdminAccessDenied,
  AdminFrame,
  AdminHeader,
  AdminLoading,
  AdminNotice,
} from "../components/admin/AdminUi";
import { ProjectCover } from "../components/ProjectPost";
import { errorMessage } from "../lib/convexError";
import {
  SORTS,
  filterVotingRows,
  sortVotingRows,
  type VoteFilter,
  type VotingSort,
} from "../lib/projectVoting";
import { stageLabel } from "../lib/stage";
import { useIsAdmin } from "../lib/useIsAdmin";

export const meta: MetaFunction = () => [
  { title: "Project voting | TheCreative.exchange" },
];

type Projects = NonNullable<
  ReturnType<typeof useQuery<typeof api.showcase.adminList>>
>;
type Project = Projects[number];
type Vote = "yes" | "maybe" | "no";
type Status = Project["status"];

const STATUSES: { value: Status; label: string }[] = [
  { value: "new", label: "Undecided" },
  { value: "shortlisted", label: "Shortlist" },
  { value: "selected", label: "Selected" },
  { value: "declined", label: "Declined" },
];

const STATUS_STYLE: Record<Status, string> = {
  new: admin.chip.neutral,
  shortlisted: admin.chip.amber,
  selected: admin.chip.green,
  declined: `${admin.chip.neutral} line-through`,
};

// A vote you have cast is a filled button; one you have not is an outline in
// its own colour. Filled ones carry ink text, as the citron buttons do.
const VOTE_STYLE: Record<Vote, { on: string; off: string }> = {
  yes: {
    on: "bg-green-300 text-[color:var(--garden-ink)] border-green-300",
    off: "text-green-300 border-[color:var(--app-hairline-raised)] hover:border-green-300",
  },
  maybe: {
    on: "bg-amber-300 text-[color:var(--garden-ink)] border-amber-300",
    off: "text-amber-300 border-[color:var(--app-hairline-raised)] hover:border-amber-300",
  },
  no: {
    on: "bg-[var(--app-text-muted)] text-[color:var(--garden-ink)] border-[color:var(--app-text-muted)]",
    off: "text-[color:var(--app-text-muted)] border-[color:var(--app-hairline-raised)] hover:border-[color:var(--app-text-muted)]",
  },
};

const VOTE_LABEL: Record<Vote, string> = {
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
};

function ProjectCard({
  project,
  onVote,
  onClearVote,
  onStatus,
  busy,
}: {
  project: Project;
  onVote: (id: Id<"projects">, vote: Vote, note: string) => void;
  onClearVote: (id: Id<"projects">) => void;
  onStatus: (id: Id<"projects">, status: Status) => void;
  busy: boolean;
}) {
  const p = project;
  const [note, setNote] = useState(p.myNote ?? "");

  // A note rides with a vote: typed before voting, it goes with the next
  // vote click; typed after, leaving the field saves it against the vote
  // already cast.
  function saveNote() {
    if (p.myVote && note.trim() !== (p.myNote ?? "")) onVote(p._id, p.myVote, note);
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-[var(--app-surface-raised)] md:flex ${
        p.status === "selected"
          ? "border-green-300/60"
          : "border-[color:var(--app-hairline)]"
      }`}
    >
      {/* The work. The picture shown whole (ProjectCover): the full-width
          4:5 cover on a phone, filling its column from md up. A project
          with no picture gets the abstract cover the Projects tab gives it,
          never an empty box (Rick, 2026-11-04: a strip on a phone cropped
          the picture and a project without one was a black box). */}
      <div className="relative w-full shrink-0 md:w-1/4 md:self-stretch">
        <ProjectCover
          cover={p.photoUrl}
          seed={p._id}
          className="md:absolute md:inset-0 md:aspect-auto"
        />
      </div>
      <div className="min-w-0 flex-1 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={admin.h2}>
              <Link to={`/projects/${p._id}`} className={admin.link}>
                {p.title}
              </Link>
            </h2>
            {p.status !== "new" && (
              <span className={STATUS_STYLE[p.status]}>
                {STATUSES.find((s) => s.value === p.status)?.label}
              </span>
            )}
          </div>
          <p className={`mt-1 flex flex-wrap items-center gap-x-1.5 ${admin.meta}`}>
            <span>
              {p.byName} · {stageLabel(p.stage)} ·
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart size={14} weight="fill" aria-hidden="true" />
              {p.cheers}
              <span className="sr-only">{p.cheers === 1 ? "cheer" : "cheers"}</span>
            </span>
            {p.backers > 0 && (
              <span className="inline-flex items-center gap-1">
                <CurrencyDollar size={14} aria-hidden="true" />
                {p.backers}
                <span className="sr-only">{p.backers === 1 ? "backer" : "backers"}</span>
              </span>
            )}
          </p>
          {p.blurb && (
            <p className={`mt-3 whitespace-pre-wrap ${admin.body}`}>{p.blurb}</p>
          )}
      </div>

      {/* The jury */}
      <div className="space-y-3 border-t border-[color:var(--app-hairline)] p-5 md:w-64 md:shrink-0 md:border-l md:border-t-0">
        <div className="flex flex-wrap items-center gap-2">
          {(["yes", "maybe", "no"] as Vote[]).map((vote) => {
            const on = p.myVote === vote;
            return (
              <button
                key={vote}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => onVote(p._id, vote, note)}
                className={`rounded-lg border px-3 py-1.5 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${admin.focus} ${
                  on ? VOTE_STYLE[vote].on : VOTE_STYLE[vote].off
                }`}
              >
                {VOTE_LABEL[vote]}
              </button>
            );
          })}
          {p.myVote && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onClearVote(p._id)}
              className={admin.btnText}
            >
              Clear
            </button>
          )}
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          disabled={busy}
          placeholder={p.myVote ? "Add a note" : "Note — saved with your vote"}
          aria-label={`Note on ${p.title}`}
          className={admin.input}
        />

        <select
          value={p.status}
          disabled={busy}
          onChange={(e) => onStatus(p._id, e.target.value as Status)}
          className={`${admin.select} w-full`}
          aria-label={`Decision for ${p.title}`}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <div className={admin.meta}>
          <span className="font-medium text-[color:var(--app-text)]">
            {p.tally.yes} yes · {p.tally.maybe} maybe · {p.tally.no} no
          </span>
          {p.votes.length > 0 && (
            <ul className="mt-1 space-y-1">
              {p.votes.map((v) => (
                <li key={v.userId}>
                  <span className="font-medium text-[color:var(--app-text)]">
                    {v.voter}
                  </span>{" "}
                  <span>{VOTE_LABEL[v.vote]}</span>
                  {v.note ? <span> — {v.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminVotingPage() {
  const isAdmin = useIsAdmin();
  const projects = useQuery(api.showcase.adminList, isAdmin === true ? {} : "skip");
  const castVote = useMutation(api.showcase.castVote);
  const clearVote = useMutation(api.showcase.clearVote);
  const setStatus = useMutation(api.showcase.setStatus);

  const [busyId, setBusyId] = useState<Id<"projects"> | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [voteFilter, setVoteFilter] = useState<VoteFilter>("all");
  const [sort, setSort] = useState<VotingSort>("jury");

  async function run(id: Id<"projects">, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, "Something went wrong"));
    } finally {
      setBusyId(null);
    }
  }

  if (isAdmin === undefined) {
    return <AdminLoading>Checking access…</AdminLoading>;
  }

  if (!isAdmin) {
    return <AdminAccessDenied />;
  }

  const all = projects ?? [];
  const shown = sortVotingRows(filterVotingRows(all, statusFilter, voteFilter), sort);
  const selected = all.filter((p) => p.status === "selected").length;
  const unvoted = all.filter((p) => p.myVote === null).length;

  return (
    // Two-column cards want the room: the wider admin width.
    <AdminFrame>
      <AdminHeader
        back
        title="Project voting"
        sub={
          projects === undefined
            ? "Loading…"
            : `${all.length} projects · ${selected} selected`
        }
      />
      <p className={`-mt-3 mb-6 max-w-2xl ${admin.body}`}>
        Every project is on the ballot — for the showcase, a grant or a
        community fund. Votes are opinions; the decision is set by hand once
        the room agrees.{" "}
        <Link to="/projects" className={admin.link}>
          Browse projects
        </Link>
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["all", ...STATUSES.map((s) => s.value)] as const).map((value) => {
          const count =
            value === "all"
              ? all.length
              : all.filter((p) => p.status === value).length;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              aria-pressed={statusFilter === value}
              className={statusFilter === value ? admin.pillOn : admin.pillOff}
            >
              {value === "all"
                ? "All"
                : STATUSES.find((s) => s.value === value)?.label}{" "}
              ({count})
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setVoteFilter((f) => (f === "unvoted" ? "all" : "unvoted"))}
          aria-pressed={voteFilter === "unvoted"}
          className={voteFilter === "unvoted" ? admin.pillOn : admin.pillOff}
        >
          Needs my vote ({unvoted})
        </button>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as VotingSort)}
          className={`${admin.select} ml-auto`}
          aria-label="Sort"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <AdminNotice tone="error" className="mb-4">
          {error}
        </AdminNotice>
      )}

      {projects === undefined ? (
        <p className={admin.meta}>Loading projects…</p>
      ) : shown.length === 0 ? (
        <div className={`${admin.panel} text-center ${admin.meta}`}>
          {all.length === 0 ? "No projects to vote on yet." : "Nothing here."}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((project) => (
            <ProjectCard
              key={project._id}
              project={project}
              busy={busyId === project._id}
              onVote={(id, vote, note) =>
                run(id, () =>
                  castVote({ projectId: id, vote, note: note.trim() || undefined }),
                )
              }
              onClearVote={(id) => run(id, () => clearVote({ projectId: id }))}
              onStatus={(id, status) =>
                run(id, () => setStatus({ projectId: id, status }))
              }
            />
          ))}
        </div>
      )}
    </AdminFrame>
  );
}
