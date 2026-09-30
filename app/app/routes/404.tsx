import { Link } from "react-router";

export function meta() {
  return [
    { title: "Page Not Found - TheCreative.exchange" },
    {
      name: "description",
      content: "The page you're looking for doesn't exist.",
    },
    { property: "og:title", content: "Page Not Found - TheCreative.exchange" },
    {
      property: "og:description",
      content: "The page you're looking for doesn't exist.",
    },
    { property: "og:type", content: "website" },
    { name: "robots", content: "noindex" },
  ];
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        {/* Decorative 404 */}
        <div className="relative mb-8">
          <span className="text-[150px] md:text-[200px] font-bold text-gray-800/50 leading-none select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/25">
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
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Message */}
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Page Not Found
        </h1>
        <p className="text-lg text-gray-300 mb-8">
          This page isn't here. Check the link, or start from the home page.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/25"
          >
            Go Home
          </Link>
          <Link
            to="/people"
            className="px-6 py-3 bg-gray-800 text-gray-300 rounded-xl font-semibold hover:bg-gray-700 transition-colors border border-gray-700"
          >
            Discover Creatives
          </Link>
        </div>

      </div>
    </div>
  );
}
