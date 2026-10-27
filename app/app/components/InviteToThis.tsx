// "Invite people", once, right after someone publishes an event or project
// (Rick, 2026-10-07: invites belong where people want others to come, not
// only in Settings → Network). The create flows land on the new page with
// ?new=1 (lib/justPublished.ts); the owner sees this card until "Done" or
// they leave. The link is the page itself carrying their invite
// (lib/carriedInvite.ts), so a friend who signs up from it gets in and it
// counts as theirs.
//
// A project with nothing to look at yet (no picture, link or attached piece:
// a title and a line are enough to post from onboarding, Rick 2026-10-27)
// asks for that first, at any stage: "Add a picture" uploads right here (the
// same upload as the hero's "Add image"), "Add a link" opens the edit on its
// Show it screen, and the invite card takes over once there is something to
// show (lib/justPublished.ts needsPictureOrLink).

import { useRef } from "react";
import type { ChangeEvent } from "react";
import { useSearchParams } from "react-router";
import { useInviteLink } from "../lib/useInviteLink";
import type { CoverPick } from "../lib/useCoverPick";
import { JUST_PUBLISHED_PARAM } from "../lib/justPublished";
import { InviteIcon } from "./InviteCTA";

const buttonClass =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13.5px] font-medium border transition-colors hover:bg-[var(--app-hairline)] disabled:opacity-50";

export function InviteToThis({
  path,
  title,
  owner,
  className,
  needsMedia,
  picture,
  onAddLink,
}: {
  path: string;
  title: string;
  owner: boolean;
  /** Around the card, so a page's spacing goes with it when it's hidden. */
  className?: string;
  /** A project with no picture, link or piece yet. */
  needsMedia?: boolean;
  /** The project's picture upload: frames, stores and saves what's picked,
   *  and shows `error` when it can't. Without it there's no "Add a picture". */
  picture?: CoverPick;
  /** Opens the project's edit on its Show it step. */
  onAddLink?: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const fresh = params.get(JUST_PUBLISHED_PARAM) === "1";
  if (!owner || !fresh) return null;
  const done = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(JUST_PUBLISHED_PARAM);
        return next;
      },
      { replace: true },
    );
  // A project's page has a form for roles on its Team tab (?tab=team&role=new
  // opens it, routes/projects.$id.tsx).
  const sayWho = path.startsWith("/projects/")
    ? () =>
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("tab", "team");
            next.set("role", "new");
            return next;
          },
          { replace: true, preventScrollReset: true },
        )
    : undefined;
  return (
    <div className={className}>
      {needsMedia && (picture || onAddLink) ? (
        <AddMediaCard picture={picture} onAddLink={onAddLink} onDone={done} />
      ) : (
        <InviteCard path={path} title={title} onDone={done} onSayWhoYouNeed={sayWho} />
      )}
    </div>
  );
}

function AddMediaCard({
  picture,
  onAddLink,
  onDone,
}: {
  picture?: CoverPick;
  onAddLink?: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared so the same file can be picked again after an error.
    e.target.value = "";
    if (file) picture?.pick(file);
  }
  return (
    <section
      aria-label="Add a picture or a link"
      className="rounded-xl border px-5 py-4"
      style={{ borderColor: "var(--app-hairline-raised)", background: "var(--app-surface-raised)" }}
    >
      <p className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
        It's up. Add a picture or a link.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {picture && (
          <>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} hidden />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={picture.busy}
              className={buttonClass}
              style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text)" }}
            >
              {picture.busy ? "Uploading…" : "Add a picture"}
            </button>
          </>
        )}
        {onAddLink && (
          <button
            type="button"
            onClick={onAddLink}
            className={buttonClass}
            style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text)" }}
          >
            Add a link
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-2 text-[13.5px] font-medium hover:underline"
          style={{ color: "var(--app-text-muted)" }}
        >
          Done
        </button>
      </div>
      {picture?.error && (
        <p role="alert" className="mt-2 text-[14px] text-red-600 dark:text-red-400">
          {picture.error}
        </p>
      )}
      {/* The framer, when the picture isn't 4:5. */}
      {picture?.picker}
    </section>
  );
}

function InviteCard({
  path,
  title,
  onDone,
  onSayWhoYouNeed,
}: {
  path: string;
  title: string;
  onDone: () => void;
  onSayWhoYouNeed?: () => void;
}) {
  const link = useInviteLink("published", { path, title });
  return (
    <section
      aria-label="Invite people"
      className="rounded-xl border px-5 py-4"
      style={{ borderColor: "var(--app-hairline-raised)", background: "var(--app-surface-raised)" }}
    >
      <p className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
        It's up. Invite people.
      </p>
      <p className="mt-1 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
        People who sign up from your link join as your invite.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={link.copy}
          title={link.url ? `Copy ${link.url}` : undefined}
          disabled={link.loading || !link.url}
          className={buttonClass}
          style={{
            borderColor: link.copied ? "var(--app-accent-ink)" : "var(--app-hairline-raised)",
            color: link.copied ? "var(--app-accent-ink)" : "var(--app-text)",
          }}
        >
          <InviteIcon className="w-4 h-4" />
          {link.copied ? "Link copied" : "Invite a friend"}
        </button>
        {link.canShare && (
          <button
            type="button"
            onClick={link.share}
            disabled={link.loading || !link.url}
            className={buttonClass}
            style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text)" }}
          >
            Share…
          </button>
        )}
        {onSayWhoYouNeed && (
          <button
            type="button"
            onClick={onSayWhoYouNeed}
            className={buttonClass}
            style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text)" }}
          >
            Say who you need
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-2 text-[13.5px] font-medium hover:underline"
          style={{ color: "var(--app-text-muted)" }}
        >
          Done
        </button>
      </div>
    </section>
  );
}
