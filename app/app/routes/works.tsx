import { useQuery } from "convex/react";
import { Link } from "react-router";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { InviteCTA } from "../components/InviteCTA";

export default function Works() {
  const artifacts = useQuery(api.artifacts.getAllArtifacts);

  // Shuffle artifacts for random order
  const shuffledArtifacts = useMemo(() => {
    if (!artifacts) return [];
    const shuffled = [...artifacts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [artifacts]);

  if (!artifacts) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (shuffledArtifacts.length === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Works
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          Creative works from the community
        </p>
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          No works have been shared yet. Be the first to add one!
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Works
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Creative works from the community
      </p>

      {/* Bento grid layout */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[200px]">
        {shuffledArtifacts.map((artifact, index) => {
          // Determine size class for bento effect
          const sizeClass = getBentoSize(index);

          // Check if URL is an image (strip query string first)
          const urlWithoutQuery =
            artifact.resolvedMediaUrl?.split("?")[0] || "";
          const isImageUrl = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(
            urlWithoutQuery,
          );

          // Check if URL is YouTube
          const youtubeMatch = artifact.resolvedMediaUrl?.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
          );
          const youtubeId = youtubeMatch?.[1];
          const youtubeThumbnail = youtubeId
            ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
            : null;

          const showAsImage =
            artifact.type === "image" ||
            (artifact.type === "link" && isImageUrl);

          return (
            <Link
              key={artifact._id}
              to={`/works/${artifact._id}`}
              className={`group relative overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800 ${sizeClass}`}
            >
              {/* Media content */}
              {showAsImage && artifact.resolvedMediaUrl && (
                <img
                  src={artifact.resolvedMediaUrl}
                  alt={artifact.title || "Work"}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}

              {/* YouTube video thumbnail */}
              {youtubeThumbnail && !showAsImage && (
                <div className="relative w-full h-full">
                  <img
                    src={youtubeThumbnail}
                    alt={artifact.title || "Video"}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                      <svg
                        className="w-8 h-8 text-white ml-1"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {artifact.type === "video" &&
                artifact.resolvedMediaUrl &&
                !youtubeId && (
                  <video
                    src={artifact.resolvedMediaUrl}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = 0;
                    }}
                  />
                )}

              {artifact.type === "text" && (
                <div className="w-full h-full p-4 flex flex-col justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30">
                  {artifact.title && (
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                      {artifact.title}
                    </h3>
                  )}
                  {artifact.content && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-4">
                      {artifact.content}
                    </p>
                  )}
                </div>
              )}

              {artifact.type === "link" && !isImageUrl && !youtubeId && (
                <>
                  {artifact.ogImageUrl ? (
                    // Use og:image as background
                    <div className="relative w-full h-full">
                      <img
                        src={artifact.ogImageUrl}
                        alt={artifact.title || "Link preview"}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {/* Title overlay */}
                      {artifact.title && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                          <h3 className="text-white font-semibold line-clamp-2">
                            {artifact.title}
                          </h3>
                        </div>
                      )}
                      {/* Link icon badge */}
                      <div className="absolute top-3 right-3 w-8 h-8 bg-white/90 dark:bg-black/70 rounded-full flex items-center justify-center">
                        <svg
                          className="w-4 h-4 text-gray-700 dark:text-gray-300"
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
                      </div>
                    </div>
                  ) : (
                    // Fallback gradient card
                    <div className="w-full h-full p-4 flex flex-col justify-center bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-900/30 dark:to-cyan-900/30">
                      <svg
                        className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mb-2"
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
                      {artifact.title && (
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2">
                          {artifact.title}
                        </h3>
                      )}
                    </div>
                  )}
                </>
              )}

              {artifact.type === "audio" && (
                <div className="w-full h-full p-4 flex flex-col justify-center items-center bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30">
                  <svg
                    className="w-12 h-12 text-orange-600 dark:text-orange-400 mb-2"
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
                  {artifact.title && (
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white text-center line-clamp-2">
                      {artifact.title}
                    </h3>
                  )}
                </div>
              )}

              {/* Overlay with creator info */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-2">
                  {artifact.profile?.imageUrl ? (
                    <img
                      src={artifact.profile.imageUrl}
                      alt={artifact.profile.displayName || "Creator"}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-500 flex items-center justify-center text-white text-xs">
                      {artifact.profile?.displayName?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="text-white text-sm font-medium truncate">
                    {artifact.profile?.displayName || "Anonymous"}
                  </span>
                </div>
                {artifact.title && artifact.type !== "text" && (
                  <p className="text-white/80 text-xs mt-1 truncate">
                    {artifact.title}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Invite CTA */}
      <div className="mt-12 max-w-md">
        <InviteCTA variant="works" />
      </div>
    </div>
  );
}

// Determine bento box size based on index for visual variety
function getBentoSize(index: number): string {
  const pattern = index % 12;
  // Create variety: some items span 2 columns and/or 2 rows
  if (pattern === 0 || pattern === 7) {
    return "col-span-2 row-span-2"; // Large square
  }
  if (pattern === 3 || pattern === 10) {
    return "col-span-2 row-span-1"; // Wide
  }
  if (pattern === 5) {
    return "col-span-1 row-span-2"; // Tall
  }
  return "col-span-1 row-span-1"; // Standard
}
