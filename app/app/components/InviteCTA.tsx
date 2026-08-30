import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useState, useEffect } from "react";
import { api } from "../../convex/_generated/api";

type InviteCTAVariant =
  | "profile"
  | "works"
  | "discover"
  | "events"
  | "favorites"
  | "sidebar";

// V1 (2026-08-30): dropped the per-page rainbow gradients — citron is
// reserved for real actions, not decoration (public/tokens.css header
// rule), and five different saturated gradients across one app read as
// noisy, not distinctive. One consistent minimal treatment now; copy still
// varies by placement.
const VARIANTS: Record<InviteCTAVariant, { headline: string; subtitle: string }> = {
  profile: {
    headline: "Invite someone",
    subtitle: "Share your personal invite link with people you know.",
  },
  works: {
    headline: "Share the inspiration",
    subtitle: "Invite someone to share what they're working on.",
  },
  discover: {
    headline: "Expand the community",
    subtitle: "Know someone who's wondering? Invite them.",
  },
  events: {
    headline: "Bring more voices",
    subtitle: "Invite someone to share their event or opportunity here.",
  },
  favorites: {
    headline: "Invite more of what you love",
    subtitle: "Know someone who'd add to your favorites?",
  },
  sidebar: {
    headline: "Invite someone",
    subtitle: "Grow the community with people you know.",
  },
};

export function InviteCTA({ variant }: { variant: InviteCTAVariant }) {
  const config = VARIANTS[variant];
  const posthog = usePostHog();
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const inviteLink = useQuery(api.invites.getMyInviteLink);
  const generateSlug = useMutation(api.invites.generateInviteSlug);

  // Auto-generate slug if user doesn't have one
  useEffect(() => {
    if (inviteLink && !inviteLink.slug && !generating) {
      setGenerating(true);
      generateSlug({})
        .catch((err) => console.error("Failed to generate slug:", err))
        .finally(() => setGenerating(false));
    }
  }, [inviteLink, generateSlug, generating]);

  function copyToClipboard() {
    if (!inviteLink?.slug) return;
    const url = `${window.location.origin}/signup/${inviteLink.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);

    // Track invite link copied
    posthog?.capture("invite_link_copied", {
      variant,
      invites_used: inviteLink.usageCount,
      invites_remaining: inviteLink.remainingUses,
    });

    setTimeout(() => setCopied(false), 2000);
  }

  const inviteUrl = inviteLink?.slug
    ? `${window.location.origin}/signup/${inviteLink.slug}`
    : "";
  const hasUsesLeft = inviteLink && inviteLink.remainingUses > 0;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border transition-colors duration-200 ${
        isExpanded ? "" : "cursor-pointer"
      }`}
      style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      onClick={() => !isExpanded && setIsExpanded(true)}
    >
      {/* Content */}
      <div className="relative z-10 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "rgba(215,242,90,0.14)" }}
            >
              <svg
                className="w-4.5 h-4.5"
                style={{ color: "var(--garden-citron)" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </div>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--garden-paper)" }}>
              {config.headline}
            </h3>
          </div>
          {isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: "var(--garden-hairline)", color: "var(--garden-paper)" }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--garden-dim)" }}>
          {config.subtitle}
        </p>

        {!isExpanded ? (
          <div
            className="inline-flex items-center gap-2 font-medium text-sm group-hover:gap-3 transition-all"
            style={{ color: "var(--garden-citron)" }}
          >
            <span>Share your link</span>
            <svg
              className="w-4 h-4 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </div>
        ) : (
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            {generating ? (
              <div className="flex items-center justify-center py-4">
                <div
                  className="w-6 h-6 border-2 rounded-full animate-spin"
                  style={{ borderColor: "var(--garden-hairline-raised)", borderTopColor: "var(--garden-citron)" }}
                />
              </div>
            ) : !inviteLink?.slug ? (
              <p className="text-sm" style={{ color: "var(--garden-dim)" }}>Loading invite link...</p>
            ) : !hasUsesLeft ? (
              <div className="p-4 rounded-xl" style={{ backgroundColor: "var(--garden-ink)" }}>
                <p className="text-sm font-medium mb-2" style={{ color: "var(--garden-paper)" }}>
                  You've invited {inviteLink.usageCount} people!
                </p>
                <p className="text-xs" style={{ color: "var(--garden-dim)" }}>
                  {inviteLink.currentLimit === 3
                    ? "You'll unlock 5 more invites when your invitees start joining!"
                    : inviteLink.currentLimit === 8
                      ? "You'll unlock 10 more invites as your network grows!"
                      : "More invites will unlock as your network grows!"}
                </p>
              </div>
            ) : (
              <>
                {/* Invite link */}
                <div className="p-3 rounded-xl" style={{ backgroundColor: "var(--garden-ink)" }}>
                  <p className="text-xs mb-2" style={{ color: "var(--garden-dim)" }}>Your invite link</p>
                  <div className="flex items-center gap-2">
                    <code
                      className="flex-1 text-sm truncate"
                      style={{ fontFamily: "var(--garden-font-mono)", color: "var(--garden-muted)" }}
                    >
                      {inviteUrl}
                    </code>
                    <button
                      onClick={copyToClipboard}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                      style={{
                        backgroundColor: copied ? "var(--garden-citron)" : "var(--garden-hairline)",
                        color: copied ? "var(--garden-ink)" : "var(--garden-paper)",
                      }}
                    >
                      {copied ? (
                        <>
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Usage stats */}
                <div className="flex items-center justify-between text-xs" style={{ color: "var(--garden-dim)" }}>
                  <span>
                    {inviteLink.remainingUses} of {inviteLink.currentLimit}{" "}
                    invites remaining
                  </span>
                  {inviteLink.usageCount >= 3 &&
                    inviteLink.currentLimit > 3 && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ backgroundColor: "rgba(215,242,90,0.14)", color: "var(--garden-citron)" }}
                      >
                        Unlocked +{inviteLink.currentLimit - 3}!
                      </span>
                    )}
                </div>

                {/* Info */}
                <p className="text-xs pt-2" style={{ color: "var(--garden-dim)" }}>
                  Share thoughtfully. As people join and grow the network,
                  you'll unlock more invites!
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
