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

export const meta: MetaFunction = () => [
  { title: "Showcase jury | creatives.exchange" },
];

type Applications = NonNullable<
  ReturnType<typeof useQuery<typeof api.showcase.adminList>>
>;
type Application = Applications[number];
type Vote = "yes" | "maybe" | "no";
type Status = "new" | "shortlisted" | "selected" | "declined";

const DISCIPLINE_LABEL: Record<string, string> = {
  apparel: "Apparel / textiles",
  visual: "Painting / illustration",
  music: "Music / sound",
  photography: "Photography",
  film: "Film / video",
  writing: "Writing / poetry",
  spokenword: "Spoken word",
  design: "Design / objects",
  other: "Other",
};

const PARTICIPATION_LABEL: Record<string, string> = {
  exhibit: "Wants to hang work",
  perform: "Wants to play (paid slot)",
  vend: "Wants a table",
  document: "Offers to photograph",
};

const STATUSES: { value: Status; label: string }[] = [
  { value: "new", label: "Undecided" },
  { value: "shortlisted", label: "Shortlist" },
  { value: "selected", label: "Selected" },
  { value: "declined", label: "Declined" },
];

const STATUS_STYLE: Record<Status, string> = {
  new: "bg-gray-100 text-gray-700",
  shortlisted: "bg-amber-100 text-amber-800",
  selected: "bg-green-100 text-green-800",
  declined: "bg-gray-100 text-gray-400 line-through",
};

const VOTE_STYLE: Record<Vote, { on: string; off: string }> = {
  yes: {
    on: "bg-green-600 text-white border-green-600",
    off: "bg-white text-green-700 border-gray-300 hover:border-green-600",
  },
  maybe: {
    on: "bg-amber-500 text-white border-amber-500",
    off: "bg-white text-amber-700 border-gray-300 hover:border-amber-500",
  },
  no: {
    on: "bg-gray-700 text-white border-gray-700",
    off: "bg-white text-gray-600 border-gray-300 hover:border-gray-700",
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
  if (!safe) return <span className="text-gray-600 break-all">{url}</span>;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:text-blue-800 break-all"
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
      className={`bg-white shadow-sm rounded-lg p-5 border ${
        a.status === "selected" ? "border-green-400" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-gray-900">
              {a.name || a.email}
            </h2>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[a.status as Status]}`}
            >
              {STATUSES.find((s) => s.value === a.status)?.label ?? a.status}
            </span>
            {incomplete && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                Email only — never finished
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {a.email}
            {a.city ? ` · ${a.city}` : ""}
            {a.discipline ? ` · ${DISCIPLINE_LABEL[a.discipline]}` : ""}
          </p>
          {a.instagram && (
            <p className="text-sm mt-1">
              <a
                href={`https://instagram.com/${a.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
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
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white disabled:opacity-50"
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
        <p className="text-sm mt-3">
          <WorkLink url={a.portfolioUrl} />
        </p>
      )}

      {a.workDescription && (
        <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">
          {a.workDescription}
        </p>
      )}

      {a.participation && a.participation.length > 0 && (
        <div className="flex gap-2 flex-wrap mt-3">
          {a.participation.map((p) => (
            <span
              key={p}
              className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-800"
            >
              {PARTICIPATION_LABEL[p] ?? p}
            </span>
          ))}
        </div>
      )}

      {/* Voting */}
      <div className="mt-4 pt-4 border-t border-gray-100">
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
                className={`text-sm px-3 py-1.5 rounded-md border font-medium disabled:opacity-50 ${
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
              className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
            >
              Clear my vote
            </button>
          )}

          <button
            type="button"
            onClick={() => setNoteOpen((open) => !open)}
            className="text-sm text-gray-500 hover:text-gray-700 underline ml-auto"
          >
            {noteOpen ? "Hide note" : "Add a note"}
          </button>
        </div>

        {noteOpen && (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why — saved with your next vote on this one"
            className="mt-3 w-full text-sm border border-gray-300 rounded-md px-3 py-2"
          />
        )}

        <div className="mt-3 text-sm text-gray-600">
          <span className="font-medium text-gray-900">
            {a.tally.yes} yes · {a.tally.maybe} maybe · {a.tally.no} no
          </span>
          {a.votes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {a.votes.map((v) => (
                <li key={v.userId} className="text-gray-600">
                  <span className="font-medium">{v.voter}</span>{" "}
                  <span className="text-gray-500">{VOTE_LABEL[v.vote]}</span>
                  {v.note ? (
                    <span className="text-gray-500"> — {v.note}</span>
                  ) : null}
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
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Checking access…</div>
      </div>
    );
  }

  if (!profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-500">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  const all = applications ?? [];
  const shown = filter === "all" ? all : all.filter((a) => a.status === filter);
  const completed = all.filter((a) => a.answeredAt).length;
  const selected = all.filter((a) => a.status === "selected").length;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link to="/admin" className="text-sm text-blue-600 hover:text-blue-800">
            ← Admin Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">
            Showcase jury
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {applications === undefined
              ? "Loading…"
              : `${all.length} applications · ${completed} complete · ${selected} of 20 selected`}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Any admin can vote. Votes don't decide anything on their own — set
            the decision yourself once the room agrees.{" "}
            <Link to="/showcase" className="text-blue-600 hover:text-blue-800">
              View the public call
            </Link>
          </p>
        </div>

        <div className="mb-5 flex gap-2 flex-wrap">
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
                className={`text-sm px-3 py-1.5 rounded-md border ${
                  filter === value
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                }`}
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
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {applications === undefined ? (
          <div className="text-gray-500">Loading applications…</div>
        ) : shown.length === 0 ? (
          <div className="bg-white shadow-sm rounded-lg p-8 text-center text-gray-500">
            {all.length === 0
              ? "No applications yet."
              : "Nothing in this bucket."}
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
      </div>
    </div>
  );
}
