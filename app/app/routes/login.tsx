import { useAuthActions } from "@convex-dev/auth/react";
import { usePostHog } from "@posthog/react";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { useConvexAuth } from "convex/react";

export function meta() {
  return [
    { title: "Sign In - Wonderwall" },
    {
      name: "description",
      content:
        "Sign in to Wonderwall to connect with Kingdom-minded creatives.",
    },
    { property: "og:title", content: "Sign In - Wonderwall" },
    {
      property: "og:description",
      content:
        "Sign in to Wonderwall to connect with Kingdom-minded creatives.",
    },
    { property: "og:type", content: "website" },
    { property: "og:image", content: "https://wonderwall.app/og-image.png" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "Sign In - Wonderwall" },
    {
      name: "twitter:description",
      content:
        "Sign in to Wonderwall to connect with Kingdom-minded creatives.",
    },
  ];
}

export default function Login() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  // Redirect when authenticated (avoids race condition)
  useEffect(() => {
    if (!authLoading && isAuthenticated && shouldRedirect) {
      navigate("/search");
    }
  }, [isAuthenticated, authLoading, shouldRedirect, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signIn("password", { email, password, flow: "signIn" });

      // Identify user and capture login event
      posthog?.identify(email, { email });
      posthog?.capture("user_logged_in", { email });

      // Set flag to trigger redirect once auth state updates
      setShouldRedirect(true);
    } catch (err) {
      setError("Invalid email or password");
      posthog?.capture("login_error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);

    try {
      await signIn("google");
      posthog?.capture("google_sign_in_initiated");
      setShouldRedirect(true);
    } catch (err) {
      setError("Failed to sign in with Google");
      posthog?.capture("google_login_error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Welcome back
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Sign in to Wonderwall
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400">
              or continue with
            </span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {googleLoading ? "Signing in..." : "Google"}
        </button>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="text-blue-600 hover:text-blue-500 font-medium"
          >
            Sign up
          </Link>
        </p>

        <p className="text-center text-sm">
          <Link
            to="/"
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
