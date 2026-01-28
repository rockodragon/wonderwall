import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Markdown from "react-markdown";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ShareButton } from "../components/ShareButton";

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function WorkDetail() {
  const { artifactId } = useParams();
  const navigate = useNavigate();
  const artifact = useQuery(
    api.artifacts.get,
    artifactId ? { artifactId: artifactId as Id<"artifacts"> } : "skip",
  );
  const toggleLike = useMutation(api.artifacts.toggleLike);
  const removeArtifact = useMutation(api.artifacts.remove);
  const refetchOgImage = useMutation(api.artifacts.refetchOgImage);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Comments state
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [comment, setComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Comments queries and mutations
  const publicComments = useQuery(
    api.artifactComments.getPublicComments,
    artifactId ? { artifactId: artifactId as Id<"artifacts"> } : "skip",
  );
  const allComments = useQuery(
    api.artifactComments.getAllComments,
    artifactId ? { artifactId: artifactId as Id<"artifacts"> } : "skip",
  );
  const submitComment = useMutation(api.artifactComments.submitComment);
  const toggleCommentPublic = useMutation(api.artifactComments.toggleCommentPublic);
  const deleteComment = useMutation(api.artifactComments.deleteComment);

  // Use allComments for owner, publicComments for others
  const comments = artifact?.isOwner ? allComments : publicComments;
  const userHasCommented = publicComments?.some((c) => c.isOwnComment);

  async function handleSubmitComment() {
    if (!comment.trim() || !artifactId) return;

    setSubmittingComment(true);
    try {
      await submitComment({
        artifactId: artifactId as Id<"artifacts">,
        content: comment.trim(),
      });
      setSubmitted(true);
      setComment("");
      setShowCommentForm(false);
    } catch (err) {
      console.error("Submit error:", err);
      alert("Failed to submit comment. Please try again.");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleRefreshPreview() {
    if (!artifactId) return;

    setRefreshing(true);
    try {
      await refetchOgImage({ artifactId: artifactId as Id<"artifacts"> });
      // Show a brief success message
      setTimeout(() => setRefreshing(false), 2000);
    } catch (err) {
      console.error("Refresh failed:", err);
      setRefreshing(false);
    }
  }

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
          {/* Share button - top right */}
          <div className="absolute top-4 right-4 z-10">
            <ShareButton
              type="work"
              title={artifact.title || "Work"}
              size="sm"
              className="bg-white/90 dark:bg-black/70 hover:bg-white dark:hover:bg-black shadow-lg"
            />
          </div>

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
              {/* Link badge for images that have an associated link (uploaded image + link OR link type) */}
              {artifact.mediaUrl &&
                (artifact.type === "link" || hasStoredImage) && (
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
          {/* Title and description */}
          <div className="mb-4">
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

          {/* Actions row - always on its own line */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Like button */}
            <button
              onClick={() =>
                toggleLike({ artifactId: artifact._id }).catch(() => {})
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                artifact.userLiked
                  ? "bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              <svg
                className="w-4 h-4"
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

            {/* Owner controls */}
            {artifact.isOwner && (
              <>
                {/* Refresh preview button for link-type artifacts */}
                {artifact.type === "link" && artifact.mediaUrl && (
                  <button
                    onClick={handleRefreshPreview}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    title="Refresh preview image"
                  >
                    {refreshing ? (
                      <>
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
                        Refreshing...
                      </>
                    ) : (
                      <>
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
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        Refresh Preview
                      </>
                    )}
                  </button>
                )}
                <Link
                  to={`/settings?editArtifact=${artifact._id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                  title="Edit"
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Edit
                </Link>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  {deleting ? (
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-300 border-t-red-500" />
                  ) : (
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  )}
                  Delete
                </button>
              </>
            )}
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

      {/* Comments section */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Comments
            {comments && comments.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({comments.length})
              </span>
            )}
          </h3>
          {!artifact.isOwner && !submitted && !userHasCommented && (
            <button
              onClick={() => setShowCommentForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Add Comment
            </button>
          )}
        </div>

        {/* User submitted message */}
        {(submitted || userHasCommented) && !artifact.isOwner && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            You've shared your thoughts
          </p>
        )}

        {/* Comments list */}
        {comments && comments.length > 0 ? (
          <div className="space-y-4">
            {comments.map((c) => (
              <div
                key={c._id}
                className={`p-4 rounded-xl ${
                  c.isOwnComment && !c.isPublic
                    ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                    : "bg-gray-50 dark:bg-gray-700/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  {c.commenterProfileId ? (
                    <Link to={`/profile/${c.commenterProfileId}`}>
                      {c.commenterImageUrl ? (
                        <img
                          src={c.commenterImageUrl}
                          alt={c.commenterName}
                          className="w-8 h-8 rounded-full object-cover hover:ring-2 hover:ring-blue-500 transition-all"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium hover:ring-2 hover:ring-blue-500 transition-all">
                          {c.commenterName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </Link>
                  ) : c.commenterImageUrl ? (
                    <img
                      src={c.commenterImageUrl}
                      alt={c.commenterName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                      {c.commenterName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.commenterProfileId ? (
                        <Link
                          to={`/profile/${c.commenterProfileId}`}
                          className="font-medium text-sm text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {c.commenterName}
                        </Link>
                      ) : (
                        <span className="font-medium text-sm text-gray-900 dark:text-white">
                          {c.commenterName}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {formatTimeAgo(c.createdAt)}
                      </span>
                      {c.isOwnComment && !c.isPublic && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded-full">
                          Pending
                        </span>
                      )}
                      {!c.isPublic && artifact.isOwner && !c.isOwnComment && (
                        <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full">
                          Hidden
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 text-sm mt-1">
                      {c.content}
                    </p>

                    {/* Owner controls for each comment */}
                    {artifact.isOwner && !c.isOwnComment && (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() =>
                            toggleCommentPublic({ commentId: c._id }).catch(
                              () => {},
                            )
                          }
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            c.isPublic
                              ? "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                              : "text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                          }`}
                        >
                          {c.isPublic ? "Hide" : "Publish"}
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                "Are you sure you want to delete this comment?",
                              )
                            ) {
                              deleteComment({ commentId: c._id }).catch(
                                () => {},
                              );
                            }
                          }}
                          className="text-xs px-2 py-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    {/* Commenter can delete their own comment */}
                    {c.isOwnComment && (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                "Are you sure you want to delete your comment?",
                              )
                            ) {
                              deleteComment({ commentId: c._id }).catch(
                                () => {},
                              );
                            }
                          }}
                          className="text-xs px-2 py-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No comments yet. Be the first to share your thoughts!
          </p>
        )}
      </div>

      {/* Comment Form Modal */}
      {showCommentForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Add a comment
                </h3>
                <button
                  onClick={() => setShowCommentForm(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {artifact.title && (
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  Commenting on: "{artifact.title}"
                </p>
              )}

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your thoughts on this work..."
                rows={5}
                maxLength={1000}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
                autoFocus
              />

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-4">
                Your comment will be pending until {artifact.profile?.name || "the creator"} publishes it.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCommentForm(false)}
                  className="flex-1 py-2.5 text-gray-600 dark:text-gray-400 text-sm font-medium hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitComment}
                  disabled={submittingComment || !comment.trim()}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {submittingComment ? "Sending..." : "Submit Comment"}
                </button>
              </div>
            </div>
          </div>
        </div>
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
