import { useAuthActions } from "@convex-dev/auth/react";
import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../convex/_generated/api";

export default function Signup() {
  const { inviteSlug } = useParams();
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSignupForm, setShowSignupForm] = useState(false);

  // Get inviter information if arriving via invite link
  const inviterInfo = useQuery(
    api.invites.getInviterInfo,
    inviteSlug ? { slug: inviteSlug } : "skip",
  );

  const redeemInvite = useMutation(api.invites.redeemBySlug);
  const generateSlug = useMutation(api.invites.generateInviteSlug);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!inviteSlug) {
      setError("Invite link is required");
      return;
    }

    if (!inviterInfo) {
      setError("Loading invite information...");
      return;
    }

    if (!inviterInfo.canAcceptMore) {
      setError("This invite link has reached its maximum uses (3)");
      return;
    }

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      // Sign up with password
      await signIn("password", {
        email,
        password,
        name,
        flow: "signUp",
      });

      // Wait a moment for Convex auth session to fully establish
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Redeem the invite link after successful signup
      try {
        await redeemInvite({ slug: inviteSlug });
        console.log("✅ Successfully redeemed invite:", inviteSlug);
      } catch (err) {
        console.error("❌ Failed to redeem invite:", err);
        // Don't block signup, but log the error for debugging
        posthog?.captureException(err);
        posthog?.capture("invite_redemption_failed", {
          error: err instanceof Error ? err.message : "Unknown error",
          invite_slug: inviteSlug,
        });
      }

      // Generate invite slug for new user
      try {
        const newSlug = await generateSlug({});
        console.log("✅ Generated new invite slug:", newSlug);
      } catch (err) {
        console.error("❌ Failed to generate invite slug:", err);
        posthog?.captureException(err);
      }

      // Identify user and capture signup event
      posthog?.identify(email, { email, name, invite_slug: inviteSlug });
      posthog?.capture("user_signed_up", {
        email,
        name,
        invite_slug: inviteSlug,
        inviter_name: inviterInfo?.name,
      });

      // Show welcome modal
      setShowWelcome(true);
    } catch (err) {
      console.error("Signup error:", err);
      setError(err instanceof Error ? err.message : "Signup failed");
      posthog?.captureException(err);
      setLoading(false);
    }
  }

  // If no invite slug in URL, show error
  if (!inviteSlug) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Invite Required
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Wonderwall is invite-only. Please use an invite link from an
            existing member to join.
          </p>
          <Link
            to="/login"
            className="text-blue-600 hover:text-blue-500 font-medium"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    );
  }

  // Show welcome modal after successful signup
  if (showWelcome) {
    return (
      <WelcomeModal
        onContinue={() => {
          setShowWelcome(false);
          navigate("/onboarding");
        }}
      />
    );
  }

  // Show landing page with invite info (before signup form)
  if (!showSignupForm && inviterInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-950 dark:to-gray-900">
        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Wonderwall
          </h1>
          <Link
            to="/login"
            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium"
          >
            Sign in
          </Link>
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

          {/* Personalized Invite Card - Replaces CTA buttons */}
          <div className="mt-10 max-w-lg mx-auto">
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

                {/* CTA Button */}
                <button
                  onClick={() => setShowSignupForm(true)}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Accept Invite & Join
                </button>
              </div>
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
        <footer className="px-6 py-8 border-t border-gray-200 dark:border-gray-800 mt-12">
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
            Wonderwall — A community for Christian creatives
          </p>
        </footer>
      </div>
    );
  }

  // Show signup form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="max-w-md w-full space-y-6">
        {/* Back Button */}
        <button
          onClick={() => setShowSignupForm(false)}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </button>

        {/* Inviter Card */}
        {inviterInfo && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-4 mb-4">
              {inviterInfo.imageUrl ? (
                <img
                  src={inviterInfo.imageUrl}
                  alt={inviterInfo.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xl font-bold">
                  {inviterInfo.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-0.5">
                  You're invited by
                </p>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {inviterInfo.name}
                </h2>
                {inviterInfo.jobFunctions &&
                  inviterInfo.jobFunctions.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {inviterInfo.jobFunctions.join(", ")}
                    </p>
                  )}
              </div>
            </div>

            {inviterInfo.recentInvitees &&
              inviterInfo.recentInvitees.length > 0 && (
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Also connected here:
                  </p>
                  <div className="space-y-2">
                    {inviterInfo.recentInvitees.map((invitee, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                          {invitee.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {invitee.name}
                          </div>
                          {invitee.jobFunctions &&
                            invitee.jobFunctions.length > 0 && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {invitee.jobFunctions.join(", ")}
                              </div>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Signup Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Create your account
          </h1>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="John Doe"
                required
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="At least 8 characters"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-blue-600 hover:text-blue-500 font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function WelcomeModal({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-white"
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
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome to Wonderwall!
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Your account has been created. Let's set up your profile and share
          what you're wondering about.
        </p>
        <button
          onClick={onContinue}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          Continue
        </button>
      </div>
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
