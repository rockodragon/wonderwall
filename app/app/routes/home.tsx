import { useConvexAuth } from "convex/react";
import { Link, useNavigate } from "react-router";
import { useEffect } from "react";
import type { Route } from "./+types/home";

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

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/search");
    }
  }, [isAuthenticated, isLoading, navigate]);

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
          <Link
            to="/signup"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Join
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
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/signup"
            className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white rounded-xl font-medium text-lg hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
          <Link
            to="/login"
            className="w-full sm:w-auto px-8 py-4 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Sign In
          </Link>
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
