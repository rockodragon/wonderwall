// "Invite people", once, right after someone publishes an event or project
// (Rick, 2026-10-07: invites belong where people want others to come, not
// only in Settings → Network). The create flows land on the new page with
// ?new=1 (lib/justPublished.ts); the owner sees this card until "Done" or
// they leave. The link is the page itself carrying their invite
// (lib/carriedInvite.ts), so a friend who signs up from it gets in and it
// counts as theirs.
//
// A finished piece with nothing to look at yet (a project shared as
// "Finished it" with no picture, link or attached piece) asks for that
// first: the owner adds a link, and the invite card takes over once there
// is something to show. The hero's own "Add image" button adds the image.

import { useSearchParams } from "react-router";
import { useInviteLink } from "../lib/useInviteLink";
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
  onAddLink,
}: {
  path: string;
  title: string;
  owner: boolean;
  /** Around the card, so a page's spacing goes with it when it's hidden. */
  className?: string;
  /** A finished project with no picture, link or piece yet. */
  needsMedia?: boolean;
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
      {needsMedia && onAddLink ? (
        <AddMediaCard onAddLink={onAddLink} onDone={done} />
      ) : (
        <InviteCard path={path} title={title} onDone={done} onSayWhoYouNeed={sayWho} />
      )}
    </div>
  );
}

function AddMediaCard({ onAddLink, onDone }: { onAddLink: () => void; onDone: () => void }) {
  return (
    <section
      aria-label="Add an image or a link"
      className="rounded-xl border px-5 py-4"
      style={{ borderColor: "var(--app-hairline-raised)", background: "var(--app-surface-raised)" }}
    >
      <p className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
        It's up. Add an image or a link.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAddLink}
          className={buttonClass}
          style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text)" }}
        >
          Add a link
        </button>
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
          {link.copied ? "Link copied" : "Copy your link"}
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
