// "Invite people", once, right after someone publishes an event or project
// (Rick, 2026-10-07: invites belong where people want others to come, not
// only in Settings → Network). The create flows land on the new page with
// ?new=1 (lib/justPublished.ts); the owner sees this card until "Done" or
// they leave. The link is the page itself carrying their invite
// (lib/carriedInvite.ts), so a friend who signs up from it gets in and it
// counts as theirs.

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
}: {
  path: string;
  title: string;
  owner: boolean;
  /** Around the card, so a page's spacing goes with it when it's hidden. */
  className?: string;
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
  return (
    <div className={className}>
      <InviteCard path={path} title={title} onDone={done} />
    </div>
  );
}

function InviteCard({ path, title, onDone }: { path: string; title: string; onDone: () => void }) {
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
