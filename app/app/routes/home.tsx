import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/home";
import { api } from "../../convex/_generated/api";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Wonderwall - Christian Creatives Community" },
    {
      name: "description",
      content:
        "Discover and connect with Christian creatives. Share your work, explore what others are wondering, and find community events.",
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

  // Fetch inviter info when slug is set
  const inviterInfo = useQuery(
    api.invites.getInviterInfo,
    inviteSlug ? { slug: inviteSlug } : "skip",
  );

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/search");
    }
  }, [isAuthenticated, isLoading, navigate]);

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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Wonderwall
        </h1>
        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="px-6 py-20 max-w-4xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight">
          Connect with
          <br />
          <span className="text-blue-600">Christian creatives</span>
        </h2>
        <p className="mt-6 text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Discover peers, share your work, explore what others are wondering,
          and find your next collaboration.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium mt-4">
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

        {/* Waitlist Form */}
        <div className="mt-10 max-w-md mx-auto">
          {status === "success" ? (
            <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-200 dark:border-green-800">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-green-600 dark:text-green-400"
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
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">
                You're on the list!
              </h3>
              <p className="text-green-700 dark:text-green-300">{message}</p>
            </div>
          ) : (
            <form onSubmit={handleWaitlistSubmit} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={status === "loading"}
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {status === "loading" ? "Joining..." : "Get on Waitlist"}
                </button>
              </div>
              {status === "error" && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {message}
                </p>
              )}
            </form>
          )}

          {/* Invite Input Section */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            {!inviteSlug ? (
              // Show invite input form
              !showInviteInput ? (
                <button
                  onClick={() => setShowInviteInput(true)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Have an invite?{" "}
                  <span className="text-blue-600 hover:text-blue-500 font-medium">
                    Enter it here
                  </span>
                </button>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enter your invite
                    </p>
                    <button
                      onClick={() => {
                        setShowInviteInput(false);
                        setInviteInput("");
                        setInviteError("");
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
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
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {inviteError && (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {inviteError}
                      </p>
                    )}
                    <button
                      type="submit"
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors"
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
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                  Invalid invite link
                </p>
                <button
                  onClick={() => {
                    setInviteSlug(null);
                    setInviteInput("");
                  }}
                  className="text-sm text-blue-600 hover:text-blue-500 font-medium"
                >
                  Try again
                </button>
              </div>
            ) : (
              // Show personalized invite preview
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4">
                  <p className="text-white/90 text-xs font-medium uppercase tracking-wide mb-1">
                    You've been invited
                  </p>
                  <h3 className="text-xl font-bold text-white">
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
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {inviterInfo.name}
                      </div>
                      {inviterInfo.jobFunctions &&
                        inviterInfo.jobFunctions.length > 0 && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {inviterInfo.jobFunctions.join(", ")}
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Connected Members - Show who's already here */}
                  {inviterInfo.recentInvitees &&
                    inviterInfo.recentInvitees.length > 0 && (
                      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex -space-x-2">
                            {/* Show inviter + recent invitees */}
                            <div
                              className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white dark:ring-blue-900/20"
                              title={inviterInfo.name}
                            >
                              {inviterInfo.name.charAt(0).toUpperCase()}
                            </div>
                            {inviterInfo.recentInvitees.map((invitee, idx) => (
                              <div
                                key={idx}
                                className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white dark:ring-blue-900/20"
                                title={invitee.name}
                              >
                                {invitee.name.charAt(0).toUpperCase()}
                              </div>
                            ))}
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
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
                    )}

                  {/* CTA Buttons */}
                  <div className="space-y-2">
                    <button
                      onClick={() => navigate(`/signup/${inviteSlug}`)}
                      className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Accept Invite & Join
                    </button>
                    <button
                      onClick={() => {
                        setInviteSlug(null);
                        setInviteInput("");
                      }}
                      className="w-full px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Features */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
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
      <footer className="px-6 py-8 border-t border-gray-200 dark:border-gray-800">
        <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
          Wonderwall — A community for Christian creatives
        </p>
      </footer>
    </div>
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
    <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-blue-600 dark:text-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {icon}
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  );
}
