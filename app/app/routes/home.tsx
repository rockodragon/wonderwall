import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/home";
import { api } from "../../convex/_generated/api";
import "../styles/marquee.css";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Wonderwall - Kingdom-Minded Creatives" },
    {
      name: "description",
      content:
        "Connect with Kingdom-minded creatives. Share your work, discover peers, and spark collaborations.",
    },
  ];
}

export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSlug, setInviteSlug] = useState<string | null>(null);
  const addToWaitlist = useMutation(api.waitlist.addToWaitlist);

  // Fetch featured content for marquee
  const wonderings = useQuery(api.public.getFeaturedWonderings);

  // Fetch inviter info when slug is set
  const inviterInfo = useQuery(
    api.invites.getInviterInfo,
    inviteSlug ? { slug: inviteSlug } : "skip",
  );

  // Check for invite parameter in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteParam = urlParams.get("invite");
    if (inviteParam) {
      setInviteSlug(inviteParam);
      setShowInviteInput(true);
      // Clean up URL
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // No longer auto-redirect - show homepage with "Go to App" button instead

  async function handleWaitlistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatus("error");
      setMessage("Please enter a valid email");
      return;
    }

    setStatus("loading");
    try {
      const result = await addToWaitlist({ email });
      setStatus("success");
      setMessage(result.message);
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");

    if (!inviteInput.trim()) {
      setInviteError("Please enter an invite link or code");
      return;
    }

    // Parse the invite - accept full URL or just the slug
    let slug = inviteInput.trim();

    // If it's a full URL, extract the slug
    if (slug.includes("/signup/")) {
      const match = slug.match(/\/signup\/([^/?]+)/);
      if (match) {
        slug = match[1];
      }
    } else if (slug.includes("/")) {
      // Remove any leading/trailing slashes
      slug = slug.replace(/^\/+|\/+$/g, "");
    }

    // Set slug to fetch invite info and show preview (don't navigate yet)
    if (slug) {
      setInviteSlug(slug);
    } else {
      setInviteError("Invalid invite format");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
          Wonderwall
        </h1>
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <Link
              to="/search"
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/25"
            >
              Go to App
            </Link>
          ) : (
            <Link
              to="/login"
              className="px-4 py-2 text-white/80 hover:text-white font-medium transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section with Marquees */}
      <main className="relative pt-32 pb-20">
        {/* Hero Content - Centered */}
        <div className="relative z-10 px-6 max-w-5xl mx-auto text-center mb-20">
          <h2 className="text-5xl md:text-7xl font-bold text-white leading-tight mb-6">
            Connect with
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Kingdom-minded creatives
            </span>
          </h2>
          <p className="mt-6 text-xl text-gray-400 max-w-2xl mx-auto mb-8">
            Share your work, discover peers, and spark collaborations.
          </p>

          {/* Closed Beta Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full text-sm font-medium mb-6">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Closed Beta • Invite Only
          </div>

          {/* Waitlist Form or Invite Preview */}
          <div className="max-w-md mx-auto">
            {!inviteSlug ? (
              // Show waitlist form when no invite is being processed
              status === "success" ? (
                <div className="p-8 bg-green-500/10 rounded-2xl border border-green-500/20 backdrop-blur-sm">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-green-400"
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
                  </div>
                  <h3 className="text-xl font-bold text-green-100 mb-2">
                    You're on the list!
                  </h3>
                  <p className="text-green-300">{message}</p>
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="flex-1 px-5 py-4 border border-gray-700 rounded-xl bg-gray-900/50 backdrop-blur-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      disabled={status === "loading"}
                    />
                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {status === "loading" ? "Joining..." : "Join Waitlist"}
                    </button>
                  </div>
                  {status === "error" && (
                    <p className="text-sm text-red-400">{message}</p>
                  )}
                </form>
              )
            ) : null}

            {/* Invite Input Section */}
            <div
              className={inviteSlug ? "" : "mt-6 pt-6 border-t border-gray-800"}
            >
              {!inviteSlug ? (
                // Show invite input form
                !showInviteInput ? (
                  <button
                    onClick={() => setShowInviteInput(true)}
                    className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Have an invite?{" "}
                    <span className="text-blue-400 hover:text-blue-300 font-medium">
                      Enter it here
                    </span>
                  </button>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-gray-300">
                        Enter your invite
                      </p>
                      <button
                        onClick={() => {
                          setShowInviteInput(false);
                          setInviteInput("");
                          setInviteError("");
                        }}
                        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <form onSubmit={handleInviteSubmit} className="space-y-3">
                      <input
                        type="text"
                        value={inviteInput}
                        onChange={(e) => setInviteInput(e.target.value)}
                        placeholder="Paste invite link or code"
                        className="w-full px-4 py-3 border border-gray-700 rounded-xl bg-gray-900/50 backdrop-blur-sm text-white text-sm placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                      {inviteError && (
                        <p className="text-sm text-red-400">{inviteError}</p>
                      )}
                      <button
                        type="submit"
                        className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
                      >
                        Continue
                      </button>
                    </form>
                  </div>
                )
              ) : inviterInfo === undefined ? (
                // Loading state
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : inviterInfo === null ? (
                // Invalid invite
                <div className="text-center py-4">
                  <p className="text-sm text-red-400 mb-3">
                    Invalid invite link
                  </p>
                  <button
                    onClick={() => {
                      setInviteSlug(null);
                      setInviteInput("");
                    }}
                    className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                // Show personalized invite preview
                <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 overflow-hidden backdrop-blur-sm">
                  <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-5">
                    <p className="text-white/80 text-xs font-medium uppercase tracking-wide mb-1">
                      You've been invited
                    </p>
                    <h3 className="text-2xl font-bold text-white">
                      {inviterInfo.name} invited you to join
                    </h3>
                  </div>

                  <div className="p-6">
                    {/* Inviter Info */}
                    <div className="flex items-center gap-3 mb-4">
                      {inviterInfo.imageUrl ? (
                        <img
                          src={inviterInfo.imageUrl}
                          alt={inviterInfo.name}
                          className="w-14 h-14 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-lg font-bold">
                          {inviterInfo.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="text-left flex-1">
                        <div className="font-semibold text-white">
                          {inviterInfo.name}
                        </div>
                        {inviterInfo.jobFunctions &&
                          inviterInfo.jobFunctions.length > 0 && (
                            <div className="text-sm text-gray-400">
                              {inviterInfo.jobFunctions.join(", ")}
                            </div>
                          )}
                      </div>
                    </div>

                    {/* Connected Members - Show who's already here */}
                    {inviterInfo.recentInvitees &&
                    inviterInfo.recentInvitees.length > 0 ? (
                      <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex -space-x-2">
                            {/* Show inviter + recent invitees */}
                            <div
                              className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-gray-900"
                              title={inviterInfo.name}
                            >
                              {inviterInfo.name.charAt(0).toUpperCase()}
                            </div>
                            {inviterInfo.recentInvitees.map((invitee, idx) => (
                              <div
                                key={idx}
                                className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-gray-900"
                                title={invitee.name}
                              >
                                {invitee.name.charAt(0).toUpperCase()}
                              </div>
                            ))}
                          </div>
                        </div>
                        <p className="text-sm text-gray-300">
                          Join{" "}
                          <span className="font-semibold">
                            {inviterInfo.name}
                          </span>
                          {inviterInfo.recentInvitees.map((invitee, idx) => (
                            <span key={idx}>
                              {idx === 0 && ", "}
                              <span className="font-semibold">
                                {invitee.name}
                              </span>
                              {idx < inviterInfo.recentInvitees.length - 1 &&
                                ", "}
                            </span>
                          ))}{" "}
                          and others on Wonderwall
                        </p>
                      </div>
                    ) : (
                      <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                        <p className="text-sm text-gray-300">
                          Be one of the first to join{" "}
                          <span className="font-semibold text-white">
                            {inviterInfo.name}
                          </span>
                          's network on Wonderwall
                        </p>
                      </div>
                    )}

                    {/* CTA Buttons */}
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          // Mark that user accepted invite from home page
                          sessionStorage.setItem("invite-accepted", inviteSlug);
                          navigate(`/signup/${inviteSlug}`);
                        }}
                        className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/25"
                      >
                        Accept Invite & Join
                      </button>
                      <button
                        onClick={() => {
                          setInviteSlug(null);
                          setInviteInput("");
                        }}
                        className="w-full px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Animated Content Marquee */}
        {wonderings && wonderings.length > 0 && (
          <div className="marquee-container relative mt-24">
            <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-gray-950 to-transparent z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-gray-950 to-transparent z-10" />
            <div className="flex gap-4 marquee-scroll-left">
              {[...wonderings, ...wonderings].map((wondering, idx) => (
                <WonderingCard key={idx} wondering={wondering} />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Features */}
      <section className="px-6 py-20 max-w-6xl mx-auto bg-gray-950">
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            title="Share Your Work"
            description="Build a portfolio that showcases your creative journey and connects you with like-minded collaborators."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            }
          />
          <FeatureCard
            title="Wonder Together"
            description="Post questions you're pondering and receive thoughtful responses from the community."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            }
          />
          <FeatureCard
            title="Find Events"
            description="Discover community gatherings, workshops, and opportunities to connect in person."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            }
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-gray-800">
        <p className="text-center text-gray-500 text-sm">
          Wonderwall — A community for Kingdom-minded creatives
        </p>
      </footer>
    </div>
  );
}

// Wondering Card Component
function WonderingCard({ wondering }: { wondering: any }) {
  const { sizeClass } = getWonderTextStyle(wondering.prompt);
  const hasImage = !!wondering.wonderingImageUrl;
  const hasProfileImage = !!wondering.profile.imageUrl;

  return (
    <div className="group relative flex-shrink-0 w-80 h-96 rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 hover:border-purple-500 transition-all duration-300 hover:scale-105 cursor-pointer">
      {/* Background */}
      {hasImage ? (
        <img
          src={wondering.wonderingImageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : hasProfileImage ? (
        <img
          src={wondering.profile.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-blue-600 to-pink-600" />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-between p-6">
        <div className="flex-1 flex items-center justify-center">
          <p
            className={`text-white ${sizeClass} font-medium text-center leading-relaxed`}
          >
            "{wondering.prompt}"
          </p>
        </div>

        {/* Profile info */}
        <div className="flex items-center gap-2">
          {hasProfileImage ? (
            <img
              src={wondering.profile.imageUrl}
              alt={wondering.profile.name}
              className="w-8 h-8 rounded-full object-cover border border-white/30"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">
              {wondering.profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <span className="text-white/90 text-sm font-medium block">
              {wondering.profile.name}
            </span>
            {wondering.profile.jobFunctions.length > 0 && (
              <span className="text-white/60 text-xs">
                {wondering.profile.jobFunctions.join(" • ")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function for wondering text sizing
function getWonderTextStyle(prompt: string): { sizeClass: string } {
  const len = prompt.length;
  let sizeClass: string;
  if (len < 40) {
    sizeClass = "text-2xl";
  } else if (len < 80) {
    sizeClass = "text-xl";
  } else if (len < 150) {
    sizeClass = "text-lg";
  } else {
    sizeClass = "text-base";
  }
  return { sizeClass };
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group p-8 bg-gray-900 rounded-2xl border border-gray-800 hover:border-blue-500 transition-all duration-300">
      <div className="w-14 h-14 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
        <svg
          className="w-7 h-7 text-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {icon}
        </svg>
      </div>
      <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}
