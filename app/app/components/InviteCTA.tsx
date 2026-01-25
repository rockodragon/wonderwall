import { Link } from "react-router";

type InviteCTAVariant = "profile" | "works" | "discover" | "events";

const VARIANTS: Record<
  InviteCTAVariant,
  { headline: string; subtitle: string; gradient: string; pattern: string }
> = {
  profile: {
    headline: "Invite a friend",
    subtitle: "Who do you know that should belong here?",
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
};

export function InviteCTA({ variant }: { variant: InviteCTAVariant }) {
  const config = VARIANTS[variant];

  return (
    <Link
      to="/settings"
      className={`group relative block overflow-hidden rounded-2xl bg-gradient-to-br ${config.gradient} p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl`}
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

      {/* Shine effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-3">
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

        <p className="text-white/90 text-sm leading-relaxed mb-4">
          {config.subtitle}
        </p>

        <div className="inline-flex items-center gap-2 text-white font-medium text-sm group-hover:gap-3 transition-all">
          <span>Send an invite</span>
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
      </div>
    </Link>
  );
}
