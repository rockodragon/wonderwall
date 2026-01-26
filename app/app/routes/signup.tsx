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

      // Redeem the invite link after successful signup
      try {
        await redeemInvite({ slug: inviteSlug });
      } catch (err) {
        console.error("Failed to redeem invite:", err);
        // Don't block signup, but log the error for debugging
        posthog?.captureException(err);
      }

      // Generate invite slug for new user
      try {
        await generateSlug({});
      } catch (err) {
        console.warn("Failed to generate invite slug:", err);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="max-w-md w-full space-y-6">
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
                {inviterInfo.jobFunctions.length > 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {inviterInfo.jobFunctions.slice(0, 2).join(" • ")}
                  </p>
                )}
              </div>
            </div>

            {/* Recent invitees */}
            {inviterInfo.recentInvitees.length > 0 && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Recently joined through {inviterInfo.name}:
                </p>
                <div className="flex gap-2">
                  {inviterInfo.recentInvitees.map((invitee, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-full"
                    >
                      {invitee.imageUrl ? (
                        <img
                          src={invitee.imageUrl}
                          alt={invitee.name}
                          className="w-5 h-5 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-white text-[10px] font-medium">
                          {invitee.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
                        {invitee.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Signup Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Join Wonderwall
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400 text-sm">
              Connect with Christian creatives
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

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
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
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
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
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
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500">
                At least 8 characters
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !inviterInfo?.canAcceptMore}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account..." : "Create account"}
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-8">
          {/* Icon */}
          <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center">
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
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-3">
            Welcome to Wonderwall!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
            A place for Kingdom-minded creatives
          </p>

          {/* Values */}
          <div className="space-y-4 mb-8">
            <div className="flex gap-3">
              <div className="w-8 h-8 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-blue-600 dark:text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                  Kingdom Principles First
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Thoughtfulness, purpose, and compassion over engagement
                  metrics
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 shrink-0 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-purple-600 dark:text-purple-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                  Wonder Over Noise
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  One wondering at a time — breathe, reflect, make it count
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                  Share Your Best Work
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Up to 5 portfolio pieces at a time — quality over quantity
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onContinue}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Let's Go!
          </button>
        </div>
      </div>
    </div>
  );
}
