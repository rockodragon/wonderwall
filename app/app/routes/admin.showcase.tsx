// /admin/showcase — the jury sheet for the November 6 showcase.
//
// The jury votes on PROJECTS: every project people have put in that the
// browse grid shows (convex/showcase.ts adminList). The open call never got
// an apply button, so there are no applications to judge. Any Garden admin
// can vote; a committee beyond admins is a later step. A vote is yes /
// maybe / no plus an optional note, upserted per (project, admin) by
// castVote, so changing your mind revises your own row and never touches
// anyone else's. The sheet shows the tally, who voted which way, and your
// own vote held selected — it is also where the standings are read.
//
// Voting and deciding are separate on purpose (see projects.showcaseStatus
// in schema.ts): the tally is the jury's opinion, the status is the
// commitment to give someone wall space, and the second stays an explicit
// act. So the status control sits apart from the vote buttons and nothing
// flips it automatically, however lopsided a tally gets.
//
// Admin detection mirrors admin.tsx: useIsAdmin gates the query, so a
// non-admin gets a message instead of a server refusal.
//
// Deliberately not a sortable table. The server already orders these (jury
// enthusiasm, then newest) and the useful unit here is a CARD — a picture,
// a title, who it's by, a paragraph and four people's opinions, which does
// not fit a row you can read.

import { useState } from "react";
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
import { errorMessage } from "../lib/convexError";
import { stageLabel } from "../lib/stage";
import { useIsAdmin } from "../lib/useIsAdmin";

export const meta: MetaFunction = () => [
  { title: "Showcase jury | TheCreative.exchange" },
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
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const p = project;
  const statusLabel = STATUSES.find((s) => s.value === p.status)?.label ?? p.status;

  return (
    <div
      className={`rounded-xl border bg-[var(--app-surface-raised)] p-5 ${
        p.status === "selected"
          ? "border-green-300/60"
          : "border-[color:var(--app-hairline)]"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Square and cropped to fill, as the project lists show it. */}
        {p.photoUrl ? (
          <img
            src={p.photoUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-lg bg-[var(--app-surface)] object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="h-20 w-20 shrink-0 rounded-lg bg-[var(--app-surface)]"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className={admin.h2}>
                  <Link to={`/projects/${p._id}`} className={admin.link}>
                    {p.title}
                  </Link>
                </h2>
                <span className={STATUS_STYLE[p.status]}>{statusLabel}</span>
              </div>
              <p className={`mt-1 ${admin.meta}`}>
                {p.byName} · {stageLabel(p.stage)}
              </p>
            </div>

            <select
              value={p.status}
              disabled={busy}
              onChange={(e) => onStatus(p._id, e.target.value as Status)}
              className={admin.select}
              aria-label={`Decision for ${p.title}`}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {p.blurb && (
            <p className={`mt-3 whitespace-pre-wrap ${admin.body}`}>{p.blurb}</p>
          )}
        </div>
      </div>

      {/* Voting */}
      <div className={`mt-4 pt-4 ${admin.ruleTop}`}>
        <div className="flex items-center gap-2 flex-wrap">
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
              Clear my vote
            </button>
          )}

          <button
            type="button"
            onClick={() => setNoteOpen((open) => !open)}
            className={`ml-auto ${admin.btnText}`}
          >
            {noteOpen ? "Hide note" : "Add a note"}
          </button>
        </div>

        {noteOpen && (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why — saved with your next vote on this one"
            aria-label="Note for your vote"
            className={`mt-3 ${admin.input}`}
          />
        )}

        <div className={`mt-3 ${admin.meta}`}>
          <span className="font-medium text-[color:var(--app-text)]">
            {p.tally.yes} yes · {p.tally.maybe} maybe · {p.tally.no} no
          </span>
          {p.votes.length > 0 && (
            <ul className="mt-2 space-y-1">
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

export default function AdminShowcasePage() {
  const isAdmin = useIsAdmin();
  const projects = useQuery(api.showcase.adminList, isAdmin === true ? {} : "skip");
  const castVote = useMutation(api.showcase.castVote);
  const clearVote = useMutation(api.showcase.clearVote);
  const setStatus = useMutation(api.showcase.setStatus);

  const [busyId, setBusyId] = useState<Id<"projects"> | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");

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
  const shown = filter === "all" ? all : all.filter((p) => p.status === filter);
  const selected = all.filter((p) => p.status === "selected").length;

  return (
    // A column of cards, not a table, so the narrower list width.
    <AdminFrame width="list">
      <AdminHeader
        back
        title="Showcase jury"
        sub={
          projects === undefined
            ? "Loading…"
            : `${all.length} projects · ${selected} selected`
        }
      />
      <p className={`-mt-3 mb-6 max-w-2xl ${admin.body}`}>
        Every project on the site is on the ballot. Any admin can vote; votes
        don't decide anything on their own — set the decision yourself once
        the room agrees.{" "}
        <Link to="/projects" className={admin.link}>
          Browse projects
        </Link>
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {(["all", ...STATUSES.map((s) => s.value)] as const).map((value) => {
          const count =
            value === "all"
              ? all.length
              : all.filter((p) => p.status === value).length;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={filter === value ? admin.pillOn : admin.pillOff}
            >
              {value === "all"
                ? "All"
                : STATUSES.find((s) => s.value === value)?.label}{" "}
              ({count})
            </button>
          );
        })}
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
          {all.length === 0 ? "No projects to vote on yet." : "Nothing in this bucket."}
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
