// /admin/showcase — the jury sheet for the November 6 open call.
//
// Any Garden admin can vote. A vote is yes / maybe / no plus an optional
// note, upserted per (application, admin) by convex/showcase.ts's castVote,
// so changing your mind revises your own row and never touches anyone
// else's. The sheet shows the tally, who voted which way, and your own vote
// held selected.
//
// Voting and deciding are separate on purpose (see the showcaseVotes
// comment in schema.ts): the tally is the jury's opinion, `status` is the
// commitment to give someone wall space, and the second stays an explicit
// act. So the status control sits apart from the vote buttons and nothing
// flips it automatically, however lopsided a tally gets.
//
// Admin detection mirrors admin.waitlist.tsx: the client-checkable
// profile.isAdmin flag rather than a server-side throw, so a non-admin gets
// a message instead of a stuck loading state.
//
// Deliberately not a sortable table. The server already orders these
// (completed first, then jury enthusiasm, then newest) and the useful unit
// here is a CARD — an application is a name, a link, a paragraph about the
// work and four people's opinions, which does not fit a row you can read.

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

export const meta: MetaFunction = () => [
  { title: "Showcase jury | TheCreative.exchange" },
];

type Applications = NonNullable<
  ReturnType<typeof useQuery<typeof api.showcase.adminList>>
>;
type Application = Applications[number];
type Vote = "yes" | "maybe" | "no";
type Status = "new" | "shortlisted" | "selected" | "declined";

const PARTICIPATION_LABEL: Record<string, string> = {
  exhibit: "Wants to hang work",
  perform: "Wants to play (paid slot)",
  vend: "Wants a table",
  document: "Offers to shoot photo/video",
  back: "Wants to back creatives",
  volunteer: "Offers to volunteer",
};

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

/** A link an applicant typed. Rendered as a link only when it parses as
    http(s) — an applicant pasting "instagram: @me" shouldn't produce an
    anchor to a relative path on our own admin page. */
function WorkLink({ url }: { url: string }) {
  let safe: string | null = null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      safe = parsed.toString();
    }
  } catch {
    safe = null;
  }
  if (!safe)
    return (
      <span className="text-[color:var(--app-text-muted)] break-all">{url}</span>
    );
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={`break-all ${admin.link}`}
    >
      {url}
    </a>
  );
}

function ApplicationCard({
  application,
  onVote,
  onClearVote,
  onStatus,
  busy,
}: {
  application: Application;
  onVote: (id: Id<"showcaseApplications">, vote: Vote, note: string) => void;
  onClearVote: (id: Id<"showcaseApplications">) => void;
  onStatus: (id: Id<"showcaseApplications">, status: Status) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const a = application;
  const incomplete = !a.answeredAt;

  return (
    <div
      className={`rounded-xl border bg-[var(--app-surface-raised)] p-5 ${
        a.status === "selected"
          ? "border-green-300/60"
          : "border-[color:var(--app-hairline)]"
      }`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={admin.h2}>
              {a.name || a.email}
            </h2>
            <span className={STATUS_STYLE[a.status as Status]}>
              {STATUSES.find((s) => s.value === a.status)?.label ?? a.status}
            </span>
            {incomplete && (
              <span className={admin.chip.neutral}>
                Email only — never finished
              </span>
            )}
          </div>
          <p className={`mt-1 ${admin.meta}`}>
            {a.email}
            {a.city ? ` · ${a.city}` : ""}
            {a.interests?.length ? ` · ${a.interests.join(", ")}` : ""}
          </p>
          {a.instagram && (
            <p className="mt-1 text-[14px]">
              <a
                href={`https://instagram.com/${a.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className={admin.link}
              >
                @{a.instagram}
              </a>
            </p>
          )}
        </div>

        <select
          value={a.status}
          disabled={busy}
          onChange={(e) => onStatus(a._id, e.target.value as Status)}
          className={admin.select}
          aria-label={`Decision for ${a.name || a.email}`}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {a.portfolioUrl && (
        <p className="mt-3 text-[14px]">
          <WorkLink url={a.portfolioUrl} />
        </p>
      )}

      {a.workDescription && (
        <p className={`mt-3 whitespace-pre-wrap ${admin.body}`}>
          {a.workDescription}
        </p>
      )}

      {a.participation && a.participation.length > 0 && (
        <div className="flex gap-2 flex-wrap mt-3">
          {a.participation.map((p) => (
            <span key={p} className={admin.chip.sky}>
              {PARTICIPATION_LABEL[p] ?? p}
            </span>
          ))}
        </div>
      )}

      {/* Voting */}
      <div className={`mt-4 pt-4 ${admin.ruleTop}`}>
        <div className="flex items-center gap-2 flex-wrap">
          {(["yes", "maybe", "no"] as Vote[]).map((vote) => {
            const on = a.myVote === vote;
            return (
              <button
                key={vote}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => onVote(a._id, vote, note)}
                className={`rounded-lg border px-3 py-1.5 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${admin.focus} ${
                  on ? VOTE_STYLE[vote].on : VOTE_STYLE[vote].off
                }`}
              >
                {VOTE_LABEL[vote]}
              </button>
            );
          })}

          {a.myVote && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onClearVote(a._id)}
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
            {a.tally.yes} yes · {a.tally.maybe} maybe · {a.tally.no} no
          </span>
          {a.votes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {a.votes.map((v) => (
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
  const profile = useQuery(api.profiles.getMyProfile);
  const applications = useQuery(api.showcase.adminList);
  const castVote = useMutation(api.showcase.castVote);
  const clearVote = useMutation(api.showcase.clearVote);
  const setStatus = useMutation(api.showcase.setStatus);

  const [busyId, setBusyId] = useState<Id<"showcaseApplications"> | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");

  async function run(
    id: Id<"showcaseApplications">,
    fn: () => Promise<unknown>,
  ) {
    setBusyId(id);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  if (profile === undefined) {
    return <AdminLoading>Checking access…</AdminLoading>;
  }

  if (!profile?.isAdmin) {
    return <AdminAccessDenied />;
  }

  const all = applications ?? [];
  const shown = filter === "all" ? all : all.filter((a) => a.status === filter);
  const completed = all.filter((a) => a.answeredAt).length;
  const selected = all.filter((a) => a.status === "selected").length;

  return (
    // A column of cards, not a table, so the narrower list width.
    <AdminFrame width="list">
      <AdminHeader
        back
        title="Showcase jury"
        sub={
          applications === undefined
            ? "Loading…"
            : `${all.length} applications · ${completed} complete · ${selected} of 20 selected`
        }
      />
      <p className={`-mt-3 mb-6 max-w-2xl ${admin.body}`}>
        Any admin can vote. Votes don't decide anything on their own — set the
        decision yourself once the room agrees.{" "}
        <Link to="/showcase" className={admin.link}>
          View the public call
        </Link>
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {(["all", ...STATUSES.map((s) => s.value)] as const).map((value) => {
          const count =
            value === "all"
              ? all.length
              : all.filter((a) => a.status === value).length;
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

      {applications === undefined ? (
        <p className={admin.meta}>Loading applications…</p>
      ) : shown.length === 0 ? (
        <div className={`${admin.panel} text-center ${admin.meta}`}>
          {all.length === 0 ? "No applications yet." : "Nothing in this bucket."}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((application) => (
            <ApplicationCard
              key={application._id}
              application={application}
              busy={busyId === application._id}
              onVote={(id, vote, note) =>
                run(id, () =>
                  castVote({
                    applicationId: id,
                    vote,
                    note: note.trim() || undefined,
                  }),
                )
              }
              onClearVote={(id) =>
                run(id, () => clearVote({ applicationId: id }))
              }
              onStatus={(id, status) =>
                run(id, () => setStatus({ id, status }))
              }
            />
          ))}
        </div>
      )}
    </AdminFrame>
  );
}
