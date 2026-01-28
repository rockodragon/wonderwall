import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Markdown from "react-markdown";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ShareButton } from "../components/ShareButton";

export default function WorkDetail() {
  const { artifactId } = useParams();
  const navigate = useNavigate();
  const artifact = useQuery(
    api.artifacts.get,
    artifactId ? { artifactId: artifactId as Id<"artifacts"> } : "skip",
  );
  const toggleLike = useMutation(api.artifacts.toggleLike);
  const removeArtifact = useMutation(api.artifacts.remove);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!artifactId) return;
    if (!confirm("Are you sure you want to delete this work?")) return;

    setDeleting(true);
    try {
      await removeArtifact({ artifactId: artifactId as Id<"artifacts"> });
      navigate("/works");
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete. Please try again.");
      setDeleting(false);
    }
  }

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
  // Also treat as image if it has a mediaStorageId (Convex storage URLs don't have extensions)
  const hasStoredImage = !!artifact.mediaStorageId;
  const showAsImage =
    artifact.type === "image" ||
    hasStoredImage ||
    (artifact.type === "link" && isImageUrl);

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
            <div className="relative flex items-center justify-center min-h-[300px] max-h-[70vh]">
              <img
                src={artifact.resolvedMediaUrl}
                alt={artifact.title || "Work"}
                className="max-w-full max-h-[70vh] object-contain"
              />
              {/* Link badge for images that have an associated link */}
              {artifact.type === "link" && artifact.mediaUrl && (
                <a
                  href={ensureHttps(artifact.mediaUrl!)}
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
                    {getDomainFromUrl(artifact.mediaUrl)}
                  </span>
                </a>
              )}
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

          {/* Text content with Markdown */}
          {artifact.type === "text" && (
            <div className="p-8 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 min-h-[200px]">
              {artifact.content && (
                <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-strong:text-gray-900 dark:prose-strong:text-white prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800">
                  <Markdown>{artifact.content}</Markdown>
                </div>
              )}
            </div>
          )}

          {/* Link (non-image) - only show if no stored image */}
          {artifact.type === "link" &&
            !isImageUrl &&
            !hasStoredImage &&
            !youtubeId &&
            artifact.mediaUrl && (
              <>
                {artifact.ogImageUrl ? (
                  <div className="relative min-h-[300px] bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <img
                      src={artifact.ogImageUrl}
                      alt={artifact.title || "Link preview"}
                      className="max-w-full max-h-[50vh] object-contain"
                    />
                    {/* Link badge */}
                    <a
                      href={ensureHttps(artifact.mediaUrl!)}
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
                  <div className="p-8 flex flex-col items-center justify-center min-h-[250px] bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20">
                    <svg
                      className="w-20 h-20 text-emerald-500 mb-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                    <p className="text-emerald-600 dark:text-emerald-400 text-lg font-medium mb-3">
                      {getDomainFromUrl(artifact.mediaUrl)}
                    </p>
                    <a
                      href={ensureHttps(artifact.mediaUrl!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
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
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                      Open Link
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

            <div className="flex items-center gap-2">
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

              {/* Share button */}
              <ShareButton
                type="work"
                title={artifact.title || "Work"}
                size="md"
              />

              {/* Owner controls */}
              {artifact.isOwner && (
                <>
                  <Link
                    to={`/settings?editArtifact=${artifact._id}`}
                    className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    title="Edit"
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
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </Link>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {deleting ? (
                      <div className="w-5 h-5 animate-spin rounded-full border-2 border-gray-300 border-t-red-500" />
                    ) : (
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    )}
                  </button>
                </>
              )}
            </div>
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

function ensureHttps(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `https://${url}`;
}

function getDomainFromUrl(url: string): string {
  try {
    const parsed = new URL(ensureHttps(url));
    return parsed.hostname.replace("www.", "");
  } catch {
    return url;
  }
}
