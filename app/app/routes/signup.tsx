import { useAuthActions } from "@convex-dev/auth/react";
import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import confetti from "canvas-confetti";
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

  // Redirect to home page with invite preview if arriving directly
  useEffect(() => {
    if (inviteSlug && typeof window !== "undefined") {
      const fromHome = sessionStorage.getItem("invite-accepted");
      if (!fromHome || fromHome !== inviteSlug) {
        // Redirect to home page to show invite preview
        navigate(`/?invite=${inviteSlug}`, { replace: true });
      } else {
        // Clear the flag since we've used it
        sessionStorage.removeItem("invite-accepted");
      }
    }
  }, [inviteSlug, navigate]);

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
        posthog?.capture("invite_slug_generation_failed", {
          error: err instanceof Error ? err.message : "Unknown error",
        });
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
      posthog?.capture("signup_error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
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

  // Show signup form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="max-w-md w-full space-y-6">
        {/* Header with logo and sign in link */}
        <div className="flex items-center justify-between mb-2">
          <Link
            to="/"
            className="text-xl font-bold text-gray-900 dark:text-white"
          >
            Wonderwall
          </Link>
          <Link
            to="/login"
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Sign in
          </Link>
        </div>

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
            inviterInfo.recentInvitees.length > 0 ? (
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Also connected here:
                </p>
                <div className="space-y-2">
                  {inviterInfo.recentInvitees.map((invitee, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {invitee.imageUrl ? (
                        <img
                          src={invitee.imageUrl}
                          alt={invitee.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                          {invitee.name.charAt(0).toUpperCase()}
                        </div>
                      )}
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
            ) : (
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Be one of the first to join{" "}
                  <span className="font-semibold">{inviterInfo.name}</span>'s
                  network
                </p>
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
  // Trigger confetti on mount
  useEffect(() => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: ReturnType<typeof setInterval> = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-10 text-center">
        <div className="w-24 h-24 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
          <svg
            className="w-14 h-14 text-white"
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

        <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome!
        </h2>

        <p className="text-xl text-gray-700 dark:text-gray-300 mb-6 font-medium">
          You're joining a community of{" "}
          <span className="text-blue-600 dark:text-blue-400">
            kingdom-minded creatives
          </span>
        </p>

        <div className="space-y-4 mb-8 text-left">
          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mt-0.5">
              <svg
                className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              <strong className="text-gray-900 dark:text-white">
                Share your creative work
              </strong>{" "}
              and inspire others with your gifts
            </p>
          </div>

          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mt-0.5">
              <svg
                className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              <strong className="text-gray-900 dark:text-white">
                Wonder together
              </strong>{" "}
              by asking questions and exploring ideas with peers
            </p>
          </div>

          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mt-0.5">
              <svg
                className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              <strong className="text-gray-900 dark:text-white">
                Find collaborators
              </strong>{" "}
              and build meaningful connections
            </p>
          </div>
        </div>

        <button
          onClick={onContinue}
          className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl text-lg"
        >
          Let's get started
        </button>
      </div>
    </div>
  );
}
