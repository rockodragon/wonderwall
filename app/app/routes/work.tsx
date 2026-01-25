import { useMutation, useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function WorkDetail() {
  const { artifactId } = useParams();
  const artifact = useQuery(
    api.artifacts.get,
    artifactId ? { artifactId: artifactId as Id<"artifacts"> } : "skip",
  );
  const toggleLike = useMutation(api.artifacts.toggleLike);

  if (artifact === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Work not found</p>
        <Link
          to="/works"
          className="text-blue-600 hover:underline mt-4 inline-block"
        >
          Back to Works
        </Link>
      </div>
    );
  }

  // Check if URL is YouTube
  const youtubeMatch = artifact.resolvedMediaUrl?.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  );
  const youtubeId = youtubeMatch?.[1];

  // Check if URL is an image
  const urlWithoutQuery = artifact.resolvedMediaUrl?.split("?")[0] || "";
  const isImageUrl = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(
    urlWithoutQuery,
  );
  const showAsImage =
    artifact.type === "image" || (artifact.type === "link" && isImageUrl);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        to="/works"
        className="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 text-sm"
      >
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
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Works
      </Link>

      {/* Main content */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-lg">
        {/* Media section */}
        <div className="relative bg-gray-100 dark:bg-gray-900">
          {/* YouTube embed */}
          {youtubeId && (
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {/* Image */}
          {showAsImage && artifact.resolvedMediaUrl && !youtubeId && (
            <div className="flex items-center justify-center min-h-[300px] max-h-[70vh]">
              <img
                src={artifact.resolvedMediaUrl}
                alt={artifact.title || "Work"}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          )}

          {/* Video (non-YouTube) */}
          {artifact.type === "video" &&
            artifact.resolvedMediaUrl &&
            !youtubeId && (
              <div className="aspect-video">
                <video
                  src={artifact.resolvedMediaUrl}
                  className="w-full h-full"
                  controls
                  playsInline
                />
              </div>
            )}

          {/* Audio */}
          {artifact.type === "audio" && artifact.resolvedMediaUrl && (
            <div className="p-8 flex flex-col items-center justify-center min-h-[200px] bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20">
              <svg
                className="w-16 h-16 text-orange-500 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              <audio
                src={artifact.resolvedMediaUrl}
                controls
                className="w-full max-w-md"
              />
            </div>
          )}

          {/* Text content */}
          {artifact.type === "text" && (
            <div className="p-8 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 min-h-[200px]">
              {artifact.content && (
                <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-lg leading-relaxed">
                  {artifact.content}
                </p>
              )}
            </div>
          )}

          {/* Link (non-image) */}
          {artifact.type === "link" &&
            !isImageUrl &&
            !youtubeId &&
            artifact.resolvedMediaUrl && (
              <>
                {artifact.ogImageUrl ? (
                  <div className="relative min-h-[300px]">
                    <img
                      src={artifact.ogImageUrl}
                      alt={artifact.title || "Link preview"}
                      className="w-full h-full object-cover max-h-[50vh]"
                    />
                    {/* Link badge */}
                    <a
                      href={artifact.resolvedMediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-white/90 dark:bg-black/70 rounded-xl shadow-lg hover:bg-white dark:hover:bg-black transition-colors"
                    >
                      <svg
                        className="w-5 h-5 text-emerald-600 dark:text-emerald-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        Open Link
                      </span>
                    </a>
                  </div>
                ) : (
                  <div className="p-8 flex flex-col items-center justify-center min-h-[200px] bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20">
                    <svg
                      className="w-16 h-16 text-emerald-500 mb-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                    <a
                      href={artifact.resolvedMediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 dark:text-emerald-400 hover:underline text-lg"
                    >
                      {artifact.resolvedMediaUrl}
                    </a>
                  </div>
                )}
              </>
            )}
        </div>

        {/* Info section */}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {artifact.title && (
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {artifact.title}
                </h1>
              )}
              {artifact.content && artifact.type !== "text" && (
                <p className="text-gray-600 dark:text-gray-400">
                  {artifact.content}
                </p>
              )}
            </div>

            {/* Like button */}
            <button
              onClick={() =>
                toggleLike({ artifactId: artifact._id }).catch(() => {})
              }
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                artifact.userLiked
                  ? "bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              <svg
                className="w-5 h-5"
                fill={artifact.userLiked ? "currentColor" : "none"}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
              {artifact.likeCount > 0 ? artifact.likeCount : "Like"}
            </button>
          </div>
        </div>
      </div>

      {/* Creator card */}
      {artifact.profile && (
        <Link
          to={`/profile/${artifact.profile._id}`}
          className="mt-6 block bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg hover:shadow-xl transition-shadow group"
        >
          <div className="flex items-center gap-4">
            {artifact.profile.imageUrl ? (
              <img
                src={artifact.profile.imageUrl}
                alt={artifact.profile.name}
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xl font-bold">
                {artifact.profile.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-0.5">
                Created by
              </p>
              <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {artifact.profile.name}
              </h3>
              {artifact.profile.jobFunctions.length > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {artifact.profile.jobFunctions.slice(0, 3).join(" · ")}
                </p>
              )}
            </div>
            <svg
              className="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
        </Link>
      )}
    </div>
  );
}
