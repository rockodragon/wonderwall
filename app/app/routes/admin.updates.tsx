// /admin/updates — write the Updates members see on their desk
// (docs/features/desk-updates.md). The list shows each Update's status,
// audience, dates and how many people opened it, pressed its button and
// archived it; each can be edited, published, archived, or sent now. Sending
// puts a notification and an email in front of everyone in the audience, once.
//
// Admin detection mirrors admin.showcase.tsx: the client-checkable
// profile.isAdmin flag, so a non-admin gets a message instead of a stuck
// loading state, and the admin queries stay skipped until it is true. Hooks
// stay above every return.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { UpdateEditor, type AdminUpdate } from "../components/UpdateEditor";
import { errorMessage } from "../lib/convexError";
import {
  audienceLabel,
  datesLabel,
  nextOrder,
  peopleLabel,
  sentLabel,
  statsLine,
  statusWord,
  type StatusWord,
  type UpdateStatus,
} from "../lib/updates";

export const meta: MetaFunction = () => [{ title: "Updates | TheCreative.exchange" }];

const buttonClass =
  "rounded-lg px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `${buttonClass} bg-blue-700 text-white hover:bg-blue-800`;
const quietButton = `${buttonClass} border border-gray-400 bg-white text-gray-900 hover:border-gray-600`;

const STATUS_STYLE: Record<StatusWord, string> = {
  Draft: "bg-gray-200 text-gray-900",
  Published: "bg-green-100 text-green-900",
  Scheduled: "bg-amber-100 text-amber-900",
  Ended: "bg-gray-200 text-gray-900",
  Archived: "bg-gray-100 text-gray-700",
};

type Editing = "new" | Id<"updates"> | null;

export default function AdminUpdatesPage() {
  const profile = useQuery(api.profiles.getMyProfile);
  const isAdmin = profile?.isAdmin === true;
  const updates = useQuery(api.updates.adminList, isAdmin ? {} : "skip");
  const communities = useQuery(api.garden.communities.listCommunities, isAdmin ? {} : "skip");
  const addStarterDrafts = useMutation(api.updates.addStarterDrafts);

  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const communityList = useMemo(() => (communities ?? []).map((c) => ({ _id: String(c._id), name: c.name })), [communities]);
  const communityName = useMemo(() => new Map(communityList.map((c) => [c._id, c.name])), [communityList]);

  async function onAddStarters() {
    setAdding(true);
    setNotice("");
    setError("");
    try {
      const { added } = await addStarterDrafts({});
      setNotice(added === 0 ? "Already added." : `Added ${added} ${added === 1 ? "draft" : "drafts"}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  if (profile === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-700">Checking access…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Access Denied</h1>
          <p className="text-gray-700">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  const all = updates ?? [];
  const live = all.filter((u) => u.status !== "archived");
  const archived = all.filter((u) => u.status === "archived");
  const editingUpdate = editing && editing !== "new" ? (all.find((u) => u._id === editing) ?? null) : null;
  // An Update that was deleted while it was being edited has nothing to edit.
  const showEditor = editing === "new" || (editing !== null && editingUpdate !== null);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <Link to="/admin" className="text-sm text-blue-800 hover:text-blue-900">
            ← Admin Dashboard
          </Link>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-bold text-gray-900">{showEditor ? (editing === "new" ? "New update" : "Edit update") : "Updates"}</h1>
            {!showEditor && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onAddStarters} disabled={adding} className={quietButton}>
                  {adding ? "Adding…" : "Add starter drafts"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotice("");
                    setError("");
                    setEditing("new");
                  }}
                  className={primaryButton}
                >
                  New update
                </button>
              </div>
            )}
          </div>
          {!showEditor && <p className="mt-1 text-sm text-gray-700">Cards members see on their desk until they've read them.</p>}
        </div>

        {notice && (
          <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-900">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {showEditor ? (
          <UpdateEditor
            key={editing ?? "none"}
            update={editingUpdate}
            order={nextOrder(all)}
            communities={communityList}
            onClose={() => setEditing(null)}
            onSaved={(message) => {
              setNotice(message);
              setEditing(null);
            }}
          />
        ) : updates === undefined ? (
          <div className="text-gray-700">Loading updates…</div>
        ) : all.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center text-gray-700 shadow-sm">
            No updates yet. Add the starter drafts, or write a new one.
          </div>
        ) : (
          <div className="space-y-6">
            <ul className="space-y-3">
              {live.map((u) => (
                <UpdateRow
                  key={u._id}
                  update={u}
                  communityName={u.hostOrgId ? communityName.get(String(u.hostOrgId)) : undefined}
                  onEdit={() => {
                    setNotice("");
                    setError("");
                    setEditing(u._id);
                  }}
                  onNotice={setNotice}
                  onError={setError}
                />
              ))}
            </ul>
            {archived.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-gray-900">Archived ({archived.length})</summary>
                <ul className="mt-3 space-y-3">
                  {archived.map((u) => (
                    <UpdateRow
                      key={u._id}
                      update={u}
                      communityName={u.hostOrgId ? communityName.get(String(u.hostOrgId)) : undefined}
                      onEdit={() => {
                        setNotice("");
                        setError("");
                        setEditing(u._id);
                      }}
                      onNotice={setNotice}
                      onError={setError}
                    />
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// One Update in the list
// ——————————————————————————————————————————————————————————————

function UpdateRow({
  update,
  communityName,
  onEdit,
  onNotice,
  onError,
}: {
  update: AdminUpdate;
  communityName: string | undefined;
  onEdit: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const setStatus = useMutation(api.updates.setStatus);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const status = statusWord(update, Date.now());
  const sent = update.sentAt !== undefined;
  // Published and not sent yet. Not before it starts or after it ends: the
  // card the notification opens wouldn't be on anyone's desk.
  const canSend = status === "Published" && !sent;

  async function change(next: UpdateStatus) {
    setBusy(true);
    onNotice("");
    onError("");
    try {
      await setStatus({ updateId: update._id, status: next });
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`rounded-lg border bg-white p-4 shadow-sm sm:p-5 ${update.status === "archived" ? "border-gray-200" : "border-gray-300"}`}>
      <div className="flex gap-4">
        {update.imageUrl && <img src={update.imageUrl} alt="" className="hidden h-16 w-16 shrink-0 rounded-md border border-gray-300 object-cover sm:block" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{update.title}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-medium ${STATUS_STYLE[status]}`}>{status}</span>
            <span className="text-[13px] text-gray-700">Order {update.order}</span>
          </div>
          <p className="mt-1 text-sm text-gray-700">
            {audienceLabel(update, communityName)} · {datesLabel(update.startsAt, update.endsAt)}
          </p>
          <p className="mt-1 text-sm text-gray-900">{statsLine(update)}</p>
          {update.sentAt !== undefined && <p className="mt-1 text-sm text-gray-900">{sentLabel(update.sentCount, update.sentAt)}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} disabled={busy} className={quietButton}>
          Edit
        </button>
        {update.status === "draft" && (
          <button type="button" onClick={() => change("published")} disabled={busy} className={quietButton}>
            Publish
          </button>
        )}
        {update.status === "published" && (
          <button type="button" onClick={() => change("draft")} disabled={busy} className={quietButton}>
            Unpublish
          </button>
        )}
        {update.status === "archived" ? (
          <button type="button" onClick={() => change("draft")} disabled={busy} className={quietButton}>
            Restore
          </button>
        ) : (
          <button type="button" onClick={() => change("archived")} disabled={busy} className={quietButton}>
            Archive
          </button>
        )}
        {canSend && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={primaryButton}>
            Send it now
          </button>
        )}
      </div>

      {canSend && confirming && (
        <SendConfirm
          update={update}
          onCancel={() => setConfirming(false)}
          onSent={(recipients) => {
            setConfirming(false);
            onNotice(`Sent to ${recipients}.`);
          }}
          onError={onError}
        />
      )}
    </li>
  );
}

/** "Send to 40 people now?" with the number the server counts for this
 * Update's audience at this moment. Sending is once only. */
function SendConfirm({
  update,
  onCancel,
  onSent,
  onError,
}: {
  update: AdminUpdate;
  onCancel: () => void;
  onSent: (recipients: number) => void;
  onError: (message: string) => void;
}) {
  const count = useQuery(api.updates.audienceCount, {
    audience: update.audience,
    hostOrgId: update.hostOrgId,
    newForDays: update.newForDays,
  });
  const sendNow = useMutation(api.updates.sendNow);
  const [sending, setSending] = useState(false);

  async function onSend() {
    setSending(true);
    onError("");
    try {
      const { recipients } = await sendNow({ updateId: update._id });
      onSent(recipients);
    } catch (err) {
      onError(errorMessage(err));
      onCancel();
    }
  }

  return (
    <div role="alertdialog" aria-label="Send it now" className="mt-3 rounded-lg border border-gray-300 bg-gray-50 p-4">
      <p className="text-sm text-gray-900">
        {count === undefined ? "Counting…" : `Send to ${peopleLabel(count)} now? They'll get a notification and an email.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onSend} disabled={count === undefined || sending} className={primaryButton}>
          {sending ? "Sending…" : "Send"}
        </button>
        <button type="button" onClick={onCancel} disabled={sending} className={quietButton}>
          Cancel
        </button>
      </div>
    </div>
  );
}
