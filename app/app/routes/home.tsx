import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/home";
import { api } from "../../convex/_generated/api";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TheCrossBoard - Jobs, Portfolios & Collabs for Creatives" },
    {
      name: "description",
      content:
        "Bringing Kingdom-minded employers, sponsors, and creatives together to exercise our gifts. Jobs, portfolios, collabs, and events — all in one place.",
    },
    {
      property: "og:title",
      content: "TheCrossBoard - Jobs, Portfolios & Collabs for Creatives",
    },
    {
      property: "og:description",
      content:
        "Bringing Kingdom-minded employers, sponsors, and creatives together to exercise our gifts. Jobs, portfolios, collabs, and events — all in one place.",
    },
    { property: "og:type", content: "website" },
    {
      property: "og:image",
      content: "https://www.thecrossboard.org/og-image.png",
    },
    { name: "twitter:card", content: "summary_large_image" },
    {
      name: "twitter:title",
      content: "TheCrossBoard - Jobs, Portfolios & Collabs for Creatives",
    },
    {
      name: "twitter:description",
      content:
        "Bringing Kingdom-minded employers, sponsors, and creatives together to exercise our gifts. Jobs, portfolios, collabs, and events — all in one place.",
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
  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSlug, setInviteSlug] = useState<string | null>(null);
  const addToWaitlist = useMutation(api.waitlist.addToWaitlist);

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
        <h1 className="flex items-center gap-2.5">
          <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7 shrink-0">
            <rect
              x="2"
              y="2"
              width="19"
              height="19"
              rx="4"
              className="fill-blue-500"
            />
            <rect
              x="27"
              y="2"
              width="19"
              height="19"
              rx="4"
              className="fill-purple-400"
            />
            <rect
              x="2"
              y="27"
              width="19"
              height="19"
              rx="4"
              className="fill-purple-400"
            />
            <rect
              x="27"
              y="27"
              width="19"
              height="19"
              rx="4"
              className="fill-blue-500"
            />
          </svg>
          <span className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            TheCrossBoard
          </span>
        </h1>
        <div className="flex items-center gap-4">
          <Link
            to="/organizations"
            className="px-4 py-2 text-white/70 hover:text-white font-medium transition-colors hidden sm:block"
          >
            For Organizations
          </Link>
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
            Find work.
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Show your craft.
            </span>
            <br />
            Collaborate.
          </h2>
          <p className="mt-6 text-xl text-gray-200 max-w-2xl mx-auto mb-4">
            Bringing Kingdom-minded employers, sponsors, and creatives together
            to exercise our gifts.
          </p>
          <p className="text-lg text-gray-300 max-w-xl mx-auto mb-8">
            Jobs. Portfolios. Collabs. Events. All in one place.
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

          {/* Invite Input or Waitlist Form */}
          <div className="max-w-md mx-auto">
            {!inviteSlug ? (
              // Primary: Invite code input (prioritized)
              <div className="space-y-6">
                {/* Invite Code Section - Primary */}
                <div className="p-6 bg-gray-900/80 rounded-2xl border border-blue-500/30 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mb-3">
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
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                    Have an invite?
                  </div>
                  <form onSubmit={handleInviteSubmit} className="space-y-3">
                    <input
                      type="text"
                      value={inviteInput}
                      onChange={(e) => setInviteInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleInviteSubmit(e);
                        }
                      }}
                      placeholder="Paste invite link or code"
                      className="w-full px-4 py-3 border border-gray-700 rounded-xl bg-gray-900/50 backdrop-blur-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    {inviteError && (
                      <p className="text-sm text-red-400">{inviteError}</p>
                    )}
                    <button
                      type="submit"
                      className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/25"
                    >
                      Enter with Invite
                    </button>
                  </form>
                </div>

                {/* Waitlist Section - Secondary */}
                <div className="text-center">
                  <p className="text-gray-500 text-sm mb-3">
                    Don't have an invite yet?
                  </p>
                  {status === "success" ? (
                    <div className="p-6 bg-green-500/10 rounded-xl border border-green-500/20">
                      <div className="flex items-center justify-center gap-2 text-green-400 mb-2">
                        <svg
                          className="w-5 h-5"
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
                        <span className="font-medium">You're on the list!</span>
                      </div>
                      <p className="text-green-300 text-sm">{message}</p>
                    </div>
                  ) : (
                    <form
                      onSubmit={handleWaitlistSubmit}
                      className="flex flex-col sm:flex-row gap-2"
                    >
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="flex-1 px-4 py-3 border border-gray-700 rounded-xl bg-gray-900/50 backdrop-blur-sm text-white text-sm placeholder-gray-500 focus:ring-2 focus:ring-gray-600 focus:border-transparent transition-all"
                        disabled={status === "loading"}
                      />
                      <button
                        type="submit"
                        disabled={status === "loading"}
                        className="px-6 py-3 bg-gray-800 text-white rounded-xl font-medium text-sm hover:bg-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {status === "loading" ? "Joining..." : "Join Waitlist"}
                      </button>
                    </form>
                  )}
                  {status === "error" && (
                    <p className="text-sm text-red-400 mt-2">{message}</p>
                  )}
                </div>
              </div>
            ) : inviterInfo === undefined ? (
              // Loading state
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : inviterInfo === null ? (
              // Invalid invite
              <div className="text-center py-4">
                <p className="text-sm text-red-400 mb-3">Invalid invite link</p>
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
                        and others on TheCrossBoard
                      </p>
                    </div>
                  ) : (
                    <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <p className="text-sm text-gray-300">
                        Be one of the first to join{" "}
                        <span className="font-semibold text-white">
                          {inviterInfo.name}
                        </span>
                        's network on TheCrossBoard
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

        {/* Manifesto */}
        <div className="px-6 mt-20 max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-gray-700/50 shadow-2xl">
            {/* Decorative gradient orbs */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />

            <div className="relative p-8 md:p-12 lg:p-16">
              <div className="flex items-center justify-center gap-2 mb-6">
                <div className="h-px w-8 bg-gradient-to-r from-transparent to-blue-400" />
                <span className="text-blue-400 text-sm font-medium uppercase tracking-widest">
                  Our Manifesto
                </span>
                <div className="h-px w-8 bg-gradient-to-l from-transparent to-blue-400" />
              </div>

              <h3 className="text-3xl md:text-4xl font-bold text-white text-center mb-10">
                Built for How We Work
              </h3>

              <div className="space-y-6 text-center">
                <p className="text-gray-300 text-lg leading-relaxed">
                  We're building the creative economy we want to be part of. A
                  place where{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 font-semibold">
                    Kingdom-minded employers, sponsors, and creatives
                  </span>{" "}
                  find each other and put their gifts to work — together.
                </p>
                <p className="text-gray-300 text-lg leading-relaxed">
                  TheCrossBoard connects you with real opportunities from real
                  people. Values-driven businesses, organizations, and sponsors
                  post jobs. Creatives showcase portfolios. Collaborations start
                  through direct conversations, not algorithms.
                </p>
                <p className="text-gray-300 text-lg leading-relaxed">
                  Every gift matters. Whether you're a designer, musician,
                  filmmaker, writer, or sound engineer — there's a seat at the
                  table and work worth doing.
                </p>
                <div className="pt-4">
                  <p className="text-gray-400 text-lg leading-relaxed italic">
                    "Good work, good people, and a place to exercise our gifts."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Features */}
      <section className="px-6 py-20 max-w-6xl mx-auto bg-gray-950">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
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
            title="Find Work"
            description="Discover job opportunities posted by community members who value creativity and craftsmanship."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            }
          />
          <FeatureCard
            title="Collaborate"
            description="Connect directly with other creatives for projects, gigs, and partnerships — no middleman."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
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

      {/* Organizations CTA */}
      <section className="px-6 py-16 max-w-4xl mx-auto">
        <div className="relative">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-600/20 via-orange-600/20 to-red-600/20 border border-amber-500/30 p-8 md:p-12">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-full text-xs font-medium mb-4">
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
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  For Organizations
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">
                  Looking to hire?
                </h3>
                <p className="text-gray-300 max-w-md">
                  Connect with talented creatives who bring excellence and
                  integrity to every project.
                </p>
              </div>
              <Link
                to="/organizations"
                className="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/25 whitespace-nowrap"
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* UpSight Embed - Test */}
      <section className="px-6 py-12 max-w-md mx-auto">
        <UpSightEmbed />
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            TheCrossBoard — Bringing Kingdom-minded employers, sponsors &
            creatives together
          </p>
          <div className="flex items-center gap-6">
            <Link
              to="/organizations"
              className="text-gray-500 hover:text-white text-sm transition-colors"
            >
              For Organizations
            </Link>
            <Link
              to="/login"
              className="text-gray-500 hover:text-white text-sm transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function UpSightEmbed() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://getupsight.com/embed.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div
      id="upsight-form"
      data-upsight-slug="wonderwall"
      data-upsight-layout="inline-email"
      data-upsight-theme="transparent"
      data-upsight-accent="#ffffff"
      data-upsight-radius="12"
      data-upsight-branding="true"
      data-upsight-button-text="Join"
      data-upsight-placeholder="you@company.com"
      data-upsight-success="You're on the list!"
    />
  );
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
