// The updates timeline on /projects/:id — the thing a creative posts to
// while the work is happening, and the in-app twin of the read-only
// timeline /story/:slug has always shown (docs/features/rich-project-
// content.md §3).
//
// Updates carry the same rich blocks a project description does, so an
// update can be a photo, a rough cut, a paragraph, or all three. Posting is
// the project OWNER's, unchanged from garden/stories.ts's original rule;
// editing and deleting belong to whoever wrote the row.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { RichContent } from "./RichContent";
import { RichTextEditor } from "./RichTextEditor";
import { isRichDocEmpty, toStoredDoc, type ResolvedRichBlock } from "../lib/richText";
import { formatDate } from "../garden/ui";
import { errorMessage } from "../routes/projects";

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-lg font-semibold disabled:opacity-50"
      style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)", fontSize: 13.5 }}
    >
      {children}
    </button>
  );
}

function QuietButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:opacity-80"
      style={{ color: "var(--garden-dim)", fontSize: 13.5 }}
    >
      {children}
    </button>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="uppercase tracking-[0.06em]"
      style={{
        fontFamily: "var(--garden-font-mono)",
        fontSize: 12,
        color: "var(--garden-dim)",
        margin: 0,
      }}
    >
      {children}
    </h2>
  );
}

// ————— composer —————

function Composer({ projectId }: { projectId: Id<"projects"> }) {
  const postStoryUpdate = useMutation(api.garden.stories.postStoryUpdate);
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<ResolvedRichBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    if (isRichDocEmpty(blocks)) return;
    setSaving(true);
    setError(null);
    try {
      await postStoryUpdate({ projectId, bodyDoc: toStoredDoc(blocks) });
      setBlocks([]);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left px-4 py-3 rounded-lg hover:opacity-90"
        style={{
          border: "1px dashed var(--garden-hairline-raised)",
          backgroundColor: "var(--garden-ink-raised)",
          color: "var(--garden-body)",
          fontSize: 15,
        }}
      >
        Post an update — a photo, a rough cut, or a few words…
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <RichTextEditor
        value={blocks}
        onChange={setBlocks}
        autoFocus
        placeholder="What happened this week?"
      />
      {error && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--garden-citron)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <PrimaryButton onClick={post} disabled={saving || isRichDocEmpty(blocks)}>
          {saving ? "Posting…" : "Post update"}
        </PrimaryButton>
        <QuietButton
          onClick={() => {
            setBlocks([]);
            setError(null);
            setOpen(false);
          }}
        >
          Cancel
        </QuietButton>
      </div>
    </div>
  );
}

// ————— one row —————

type UpdateRow = {
  _id: Id<"storyUpdates">;
  body: string;
  bodyDoc?: ResolvedRichBlock[];
  mediaUrl?: string;
  createdAt: number;
  editedAt?: number;
  authorUserId: Id<"users">;
  author: { name: string; imageUrl?: string; profileId: string } | null;
};

function UpdateCard({ update, canManage }: { update: UpdateRow; canManage: boolean }) {
  const editStoryUpdate = useMutation(api.garden.stories.editStoryUpdate);
  const deleteStoryUpdate = useMutation(api.garden.stories.deleteStoryUpdate);
  const [editing, setEditing] = useState(false);
  const [blocks, setBlocks] = useState<ResolvedRichBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // A row written before rich updates existed has only plain text. Editing
  // one lifts it into a single text block rather than refusing to open.
  function startEditing() {
    setBlocks(update.bodyDoc ?? (update.body ? [{ type: "text", text: update.body }] : []));
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (isRichDocEmpty(blocks)) return;
    setBusy(true);
    setError(null);
    try {
      await editStoryUpdate({ storyUpdateId: update._id, bodyDoc: toStoredDoc(blocks) });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteStoryUpdate({ storyUpdateId: update._id });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <article
      style={{
        padding: "16px 0",
        borderTop: "1px solid var(--garden-hairline)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {update.author?.imageUrl ? (
            <img
              src={update.author.imageUrl}
              alt=""
              className="w-6 h-6 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{
                backgroundColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {(update.author?.name ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 14, color: "var(--garden-muted)" }} className="truncate">
            {update.author?.profileId ? (
              <Link to={`/profile/${update.author.profileId}`} className="hover:opacity-80">
                {update.author.name}
              </Link>
            ) : (
              (update.author?.name ?? "Someone")
            )}
          </span>
          <span
            style={{ fontSize: 12.5, color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
            className="whitespace-nowrap"
          >
            {formatDate(update.createdAt)}
            {update.editedAt ? " · edited" : ""}
          </span>
        </div>

        {canManage && !editing && (
          <div className="flex items-center gap-3 shrink-0">
            <QuietButton onClick={startEditing}>Edit</QuietButton>
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="hover:opacity-80 disabled:opacity-50"
                  style={{ color: "var(--garden-citron)", fontSize: 13.5 }}
                >
                  {busy ? "Deleting…" : "Really delete"}
                </button>
                <QuietButton onClick={() => setConfirmingDelete(false)}>No</QuietButton>
              </>
            ) : (
              <QuietButton onClick={() => setConfirmingDelete(true)}>Delete</QuietButton>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <RichTextEditor value={blocks} onChange={setBlocks} />
          {error && (
            <p style={{ margin: 0, fontSize: 14, color: "var(--garden-citron)" }}>{error}</p>
          )}
          <div className="flex items-center gap-3">
            <PrimaryButton onClick={save} disabled={busy || isRichDocEmpty(blocks)}>
              {busy ? "Saving…" : "Save"}
            </PrimaryButton>
            <QuietButton onClick={() => setEditing(false)}>Cancel</QuietButton>
          </div>
        </div>
      ) : (
        <>
          {update.bodyDoc?.length ? (
            <RichContent blocks={update.bodyDoc} />
          ) : (
            update.body && (
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: "var(--garden-body)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {update.body}
              </p>
            )
          )}
          {/* The original single-link media field, still on older rows. */}
          {update.mediaUrl && !update.bodyDoc?.length && (
            <a
              href={update.mediaUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              style={{ fontSize: 14, color: "var(--garden-citron)" }}
            >
              View media →
            </a>
          )}
          {error && <p style={{ margin: 0, fontSize: 14, color: "var(--garden-citron)" }}>{error}</p>}
        </>
      )}
    </article>
  );
}

// ————— the section —————

export function ProjectUpdates({
  projectId,
  isOwner,
  myUserId,
}: {
  projectId: Id<"projects">;
  isOwner: boolean;
  /** The signed-in user, so an author can manage their own row. */
  myUserId?: string;
}) {
  const updates = useQuery(api.garden.stories.listProjectUpdates, { projectId });

  // Nothing posted and nothing the visitor could do about it — the section
  // stays out of the page rather than showing an empty shell.
  if (!isOwner && (updates === undefined || updates.length === 0)) return null;

  return (
    <section className="mb-6" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionHeading>Updates</SectionHeading>

      {isOwner && <Composer projectId={projectId} />}

      {updates === undefined ? (
        <p style={{ margin: 0, fontSize: 14, color: "var(--garden-dim)" }}>Loading…</p>
      ) : updates.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--garden-dim)" }}>
          No updates yet. Supporters and followers see these as you post them.
        </p>
      ) : (
        <div>
          {(updates as UpdateRow[]).map((update) => (
            <UpdateCard
              key={String(update._id)}
              update={update}
              canManage={!!myUserId && String(update.authorUserId) === String(myUserId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
