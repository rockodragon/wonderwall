import { useParams } from "react-router";

export default function Profile() {
  const { profileId } = useParams();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Profile header */}
      <div className="flex items-start gap-6 mb-8">
        <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Profile {profileId}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Designer • Los Angeles, CA
          </p>
        </div>
      </div>

      {/* Wondering card placeholder */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 mb-8">
        <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-2">
          Currently wondering...
        </p>
        <p className="text-lg text-gray-900 dark:text-white">
          "What tools do you use for collaborative design?"
        </p>
        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          Share your thoughts
        </button>
      </div>

      {/* Artifacts grid placeholder */}
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Work
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-xl"
          />
        ))}
      </div>
    </div>
  );
}
