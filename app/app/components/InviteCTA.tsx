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

const VARIANTS: Record<
  InviteCTAVariant,
  { headline: string; subtitle: string; gradient: string; pattern: string }
> = {
  profile: {
    headline: "Invite someone",
    subtitle: "Share your personal invite link with people you know.",
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    pattern:
      "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.1) 0%, transparent 50%)",
  },
  works: {
    headline: "Share the inspiration",
    subtitle: "Invite someone to share what they're working on.",
    gradient: "from-amber-500 via-orange-500 to-red-500",
    pattern:
      "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%)",
  },
  discover: {
    headline: "Expand the community",
    subtitle: "Know someone who's wondering? Invite them.",
    gradient: "from-cyan-500 via-blue-500 to-indigo-500",
    pattern:
      "radial-gradient(circle at 30% 70%, rgba(255,255,255,0.12) 0%, transparent 50%)",
  },
  events: {
    headline: "Bring more voices",
    subtitle: "Invite someone to share their event or opportunity here.",
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    pattern:
      "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.1) 0%, transparent 50%)",
  },
  favorites: {
    headline: "Invite more of what you love",
    subtitle: "Know someone who'd add to your favorites?",
    gradient: "from-pink-500 via-rose-500 to-red-500",
    pattern:
      "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12) 0%, transparent 50%)",
  },
  sidebar: {
    headline: "Invite someone",
    subtitle: "Grow the community with people you know.",
    gradient: "from-indigo-500 via-purple-500 to-pink-500",
    pattern:
      "radial-gradient(circle at 40% 60%, rgba(255,255,255,0.1) 0%, transparent 50%)",
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
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${config.gradient} transition-all duration-300 ${
        isExpanded ? "" : "hover:scale-[1.02] hover:shadow-xl cursor-pointer"
      }`}
      onClick={() => !isExpanded && setIsExpanded(true)}
    >
      {/* Texture overlay */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: config.pattern,
        }}
      />

      {/* Noise texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Shine effect on hover (only when collapsed) */}
      {!isExpanded && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      )}

      {/* Content */}
      <div className="relative z-10 p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
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
            <h3 className="text-lg font-semibold text-white">
              {config.headline}
            </h3>
          </div>
          {isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
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

        <p className="text-white/90 text-sm leading-relaxed mb-4">
          {config.subtitle}
        </p>

        {!isExpanded ? (
          <div className="inline-flex items-center gap-2 text-white font-medium text-sm group-hover:gap-3 transition-all">
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
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            ) : !inviteLink?.slug ? (
              <p className="text-white/80 text-sm">Loading invite link...</p>
            ) : !hasUsesLeft ? (
              <div className="p-4 bg-white/10 backdrop-blur-sm rounded-xl">
                <p className="text-white text-sm font-medium mb-2">
                  🎉 You've invited {inviteLink.usageCount} people!
                </p>
                <p className="text-white/70 text-xs">
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
                <div className="p-3 bg-white/10 backdrop-blur-sm rounded-xl">
                  <p className="text-white/70 text-xs mb-2">Your invite link</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono text-white/90 truncate">
                      {inviteUrl}
                    </code>
                    <button
                      onClick={copyToClipboard}
                      className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
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
                <div className="flex items-center justify-between text-white/70 text-xs">
                  <span>
                    {inviteLink.remainingUses} of {inviteLink.currentLimit}{" "}
                    invites remaining
                  </span>
                  {inviteLink.usageCount >= 3 &&
                    inviteLink.currentLimit > 3 && (
                      <span className="px-2 py-0.5 bg-yellow-400/20 text-yellow-200 rounded-full text-[10px] font-medium">
                        Unlocked +{inviteLink.currentLimit - 3}!
                      </span>
                    )}
                </div>

                {/* Info */}
                <p className="text-white/60 text-xs pt-2">
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
