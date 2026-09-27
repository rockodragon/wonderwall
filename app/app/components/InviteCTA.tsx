import { Link } from "react-router";
import { inviteAllowanceLabel, useInviteLink } from "../lib/useInviteLink";

// Lives in the sidebar (docs/the-exchange-v1-prd.md §5 nav note). Always
// open, one click to copy: the link is shown in full (wrapping, no
// truncation) so you can see what you're sending, and "Your network" goes
// to the Settings tab with the people behind it.
export function InviteCTA() {
  const { loading, inviteLink, url, displayUrl, hasUsesLeft, copied, copy } =
    useInviteLink("sidebar");

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background:
          "radial-gradient(120% 100% at 0% 0%, rgba(215,242,90,0.12) 0%, var(--garden-ink-raised) 60%)",
        borderColor: "rgba(215,242,90,0.24)",
      }}
    >
      <h3 className="text-[15px] font-semibold mb-2" style={{ color: "var(--garden-paper)" }}>
        Invite someone
      </h3>

      {loading ? (
        <p className="text-xs" style={{ color: "var(--garden-dim)" }}>
          Getting your link…
        </p>
      ) : !hasUsesLeft ? (
        <p className="text-xs" style={{ color: "var(--garden-dim)" }}>
          You've used all {inviteLink?.currentLimit} invites. More unlock as
          the people you invited join and invite others.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={copy}
            title="Copy your invite link"
            className="block w-full text-left text-xs leading-snug break-all rounded-lg px-2.5 py-2 mb-2 transition-colors hover:opacity-90"
            style={{
              fontFamily: "var(--garden-font-mono)",
              color: "var(--garden-muted)",
              backgroundColor: "var(--garden-ink)",
            }}
          >
            {displayUrl}
          </button>
          <button
            type="button"
            onClick={copy}
            disabled={!url}
            className="w-full rounded-lg py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: copied ? "var(--garden-citron)" : "var(--garden-hairline)",
              color: copied ? "var(--garden-ink)" : "var(--garden-paper)",
            }}
          >
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </>
      )}

      <div className="mt-2 flex items-center justify-between text-xs" style={{ color: "var(--garden-dim)" }}>
        <span>{inviteAllowanceLabel(inviteLink)}</span>
        <Link
          to="/settings?tab=network"
          className="font-medium hover:underline"
          style={{ color: "var(--garden-citron)" }}
        >
          Your network →
        </Link>
      </div>
    </div>
  );
}
