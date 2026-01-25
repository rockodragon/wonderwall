import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FavoriteButton } from "../components/FavoriteButton";
import { InviteCTA } from "../components/InviteCTA";

export default function Profile() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const myProfile = useQuery(api.profiles.getMyProfile);
  const profile = useQuery(
    api.profiles.getProfile,
    profileId ? { profileId: profileId as Id<"profiles"> } : "skip",
  );
  const inviteStats = useQuery(
    api.invites.getInviteStats,
    profile?.userId ? { userId: profile.userId } : "skip",
  );
  const likeStatus = useQuery(
    api.analytics.getProfileLikeStatus,
    profileId ? { profileId: profileId as Id<"profiles"> } : "skip",
  );
  const recordView = useMutation(api.analytics.recordProfileView);
  const toggleLike = useMutation(api.analytics.toggleProfileLike);

  // Check if viewing own profile
  const isOwnProfile = myProfile?._id === profileId;
  const profileNeedsSetup =
    isOwnProfile &&
    !profile?.bio?.trim() &&
    (!profile?.jobFunctions || profile.jobFunctions.length === 0) &&
    (!profile?.artifacts || profile.artifacts.length === 0) &&
    !profile?.wondering;

  // Record profile view on mount
  useEffect(() => {
    if (profileId) {
      recordView({ profileId: profileId as Id<"profiles"> }).catch(() => {});
    }
  }, [profileId, recordView]);

  if (profile === undefined) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="flex items-start gap-6 mb-8">
            <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="flex-1">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Profile not found</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Profile header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 mb-8">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center overflow-hidden shrink-0">
          {profile.imageUrl ? (
            <img
              src={profile.imageUrl}
              alt={profile.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-2xl sm:text-3xl font-medium text-gray-500">
              {profile.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {profile.name}
            </h1>
            <FavoriteButton targetType="profile" targetId={profile._id} />
            {/* Like button */}
            <button
              onClick={() =>
                toggleLike({ profileId: profile._id }).catch(() => {})
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                likeStatus?.userLiked
                  ? "bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              <svg
                className="w-4 h-4"
                fill={likeStatus?.userLiked ? "currentColor" : "none"}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                />
              </svg>
              {likeStatus?.count || 0}
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">
            {profile.jobFunctions.join(" • ")}
            {profile.location && ` • ${profile.location}`}
          </p>
          {profile.bio && (
            <p className="text-gray-700 dark:text-gray-300 mt-3 text-sm sm:text-base">
              {profile.bio}
            </p>
          )}
          {/* Invite stats */}
          {inviteStats && (
            <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
              {inviteStats.invitedBy && (
                <Link
                  to={`/profile/${inviteStats.invitedBy.profileId}`}
                  className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Invited by{" "}
                  <span className="font-medium">
                    {inviteStats.invitedBy.name}
                  </span>
                </Link>
              )}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span className="font-semibold">
                    {inviteStats.networkSize}
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-500">
                    in network
                  </span>
                </span>
                {inviteStats.directInvitees > 0 && (
                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                    ({inviteStats.directInvitees} invited
                    {inviteStats.downstreamCount > 0 &&
                      `, +${inviteStats.downstreamCount} downstream`}
                    )
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Profile setup prompt for own incomplete profile */}
      {profileNeedsSetup && (
        <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white"
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
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Complete your profile
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md mx-auto">
              Add a bio, share your work, and post a wondering to help others
              discover and connect with you.
            </p>
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
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
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              Set Up Profile
            </Link>
          </div>
        </div>
      )}

      {/* Wondering card */}
      {profile.wondering && (
        <WonderingCard
          wondering={profile.wondering}
          profileName={profile.name}
          profileImageUrl={profile.imageUrl}
        />
      )}

      {/* Artifacts grid */}
      {profile.artifacts && profile.artifacts.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Work
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {profile.artifacts.map((artifact) => {
              const videoEmbedUrl =
                artifact.type === "video" && artifact.mediaUrl
                  ? getVideoEmbedUrl(artifact.mediaUrl)
                  : null;

              return (
                <Link
                  key={artifact._id}
                  to={`/works/${artifact._id}`}
                  className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden block hover:ring-2 hover:ring-blue-500 transition-all"
                >
                  {artifact.type === "image" && artifact.mediaUrl ? (
                    <img
                      src={artifact.mediaUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : artifact.type === "video" && artifact.mediaUrl ? (
                    videoEmbedUrl ? (
                      <div className="relative w-full h-full">
                        <img
                          src={getYoutubeThumbnail(artifact.mediaUrl)}
                          alt={artifact.title || "Video"}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                            <svg
                              className="w-6 h-6 text-white ml-0.5"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                        <video
                          src={artifact.mediaUrl}
                          className="w-full h-full object-cover"
                          muted
                        />
                      </div>
                    )
                  ) : artifact.type === "text" && artifact.content ? (
                    <div className="p-4 text-sm text-gray-700 dark:text-gray-300 line-clamp-6">
                      {artifact.content}
                    </div>
                  ) : artifact.type === "link" && artifact.ogImageUrl ? (
                    <div className="relative w-full h-full bg-gray-100 dark:bg-gray-800">
                      <img
                        src={artifact.ogImageUrl}
                        alt={artifact.title || "Link preview"}
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-2 right-2 w-6 h-6 bg-white/90 dark:bg-black/70 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-gray-700 dark:text-gray-300"
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
                    <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-end">
                      <div className="p-3">
                        {artifact.title ? (
                          <p className="text-white text-sm font-medium line-clamp-2">
                            {artifact.title}
                          </p>
                        ) : (
                          <p className="text-white/70 text-xs uppercase tracking-wide">
                            {artifact.type}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* Empty state for no artifacts - only show for other profiles */}
      {(!profile.artifacts || profile.artifacts.length === 0) &&
        !profile.wondering &&
        !profileNeedsSetup && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>This profile doesn't have any content yet</p>
          </div>
        )}

      {/* Invite CTA - only show on own profile */}
      {isOwnProfile && (
        <div className="mt-8">
          <InviteCTA variant="profile" />
        </div>
      )}
    </div>
  );
}

function getVideoEmbedUrl(mediaUrl: string): string | null {
  try {
    const url = new URL(mediaUrl);
    const host = url.hostname.replace("www.", "");

    if (host === "youtu.be") {
      const id = url.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      if (
        url.pathname.startsWith("/embed/") ||
        url.pathname.startsWith("/shorts/") ||
        url.pathname.startsWith("/live/")
      ) {
        const id = url.pathname.split("/")[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[parts.length - 1];
      if (id && /^[0-9]+$/.test(id)) {
        return `https://player.vimeo.com/video/${id}`;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function getYoutubeThumbnail(mediaUrl: string): string | null {
  try {
    const url = new URL(mediaUrl);
    const host = url.hostname.replace("www.", "");
    let videoId: string | null = null;

    if (host === "youtu.be") {
      videoId = url.pathname.slice(1);
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v");
      } else if (
        url.pathname.startsWith("/embed/") ||
        url.pathname.startsWith("/shorts/") ||
        url.pathname.startsWith("/live/")
      ) {
        videoId = url.pathname.split("/")[2];
      }
    }

    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
  } catch {
    return null;
  }
  return null;
}

function WonderingCard({
  wondering,
  profileName,
  profileImageUrl,
}: {
  wondering: {
    _id: Id<"wonderings">;
    prompt: string;
    imageUrl?: string | null;
    expiresAt?: number;
  };
  profileName: string;
  profileImageUrl?: string | null;
}) {
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submitResponse = useMutation(api.wonderings.submitResponse);
  const publicResponses = useQuery(api.wonderings.getPublicResponses, {
    wonderingId: wondering._id,
  });

  const hasWonderingImage = !!wondering.imageUrl;
  const hasProfileImage = !!profileImageUrl;
  const isExpired = wondering.expiresAt && Date.now() > wondering.expiresAt;

  // Get variable text size based on prompt length
  const getWonderTextStyle = (prompt: string) => {
    const len = prompt.length;
    let sizeClass: string;
    if (len < 40) {
      sizeClass = "text-2xl md:text-4xl";
    } else if (len < 80) {
      sizeClass = "text-xl md:text-3xl";
    } else if (len < 150) {
      sizeClass = "text-lg md:text-2xl";
    } else {
      sizeClass = "text-base md:text-xl";
    }
    const isQuestion = prompt.includes("?");
    const fontClass = isQuestion ? "font-serif italic" : "font-medium";
    return { sizeClass, fontClass };
  };
  const { sizeClass, fontClass } = getWonderTextStyle(wondering.prompt);

  // Check if user already submitted (to hide button)
  const userHasResponded = publicResponses?.some((r) => r.isOwnResponse);

  async function handleSubmit() {
    if (!response.trim() || isExpired) return;

    setSubmitting(true);
    try {
      await submitResponse({
        wonderingId: wondering._id,
        mediaType: "text",
        content: response.trim(),
      });
      setSubmitted(true);
      setResponse("");
      setShowResponseForm(false);
    } catch (err) {
      console.error("Submit error:", err);
      alert("Failed to submit response. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-8">
      {/* Wonder Card with background */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{ minHeight: "280px" }}
      >
        {/* Background */}
        {hasWonderingImage ? (
          <img
            src={wondering.imageUrl!}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : hasProfileImage ? (
          <img
            src={profileImageUrl!}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500" />
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/30" />

        {/* Content */}
        <div className="relative p-6 flex flex-col justify-between min-h-[280px]">
          {/* Label */}
          <p className="text-white/70 text-sm font-medium">
            {profileName} is wondering...
          </p>

          {/* Wonder prompt */}
          <div className="flex-1 flex items-center justify-center py-6">
            <p
              className={`text-white ${sizeClass} ${fontClass} text-center leading-relaxed max-w-2xl`}
            >
              "{wondering.prompt}"
            </p>
          </div>

          {/* Response button */}
          <div className="flex items-center justify-between">
            {isExpired ? (
              <p className="text-white/50 text-sm">
                This wondering has expired
              </p>
            ) : submitted || userHasResponded ? (
              <p className="text-white/70 text-sm">
                You've shared your thoughts
              </p>
            ) : (
              <button
                onClick={() => setShowResponseForm(true)}
                className="px-5 py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-xl text-sm font-medium hover:bg-white/30 transition-colors border border-white/20"
              >
                Share your thoughts
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Responses section */}
      {publicResponses && publicResponses.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            Thoughts shared
          </h3>
          <div className="space-y-4">
            {publicResponses.map((r) => (
              <div
                key={r._id}
                className={`p-4 rounded-xl ${
                  r.isOwnResponse && !r.isPublic
                    ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                    : "bg-gray-50 dark:bg-gray-800"
                }`}
              >
                <div className="flex items-start gap-3">
                  {r.responderImageUrl ? (
                    <img
                      src={r.responderImageUrl}
                      alt={r.responderName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                      {r.responderName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-white">
                        {r.responderName}
                      </span>
                      {r.isOwnResponse && !r.isPublic && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded-full">
                          Pending
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 text-sm mt-1">
                      {r.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Response Form Modal */}
      {showResponseForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Share your thoughts
                </h3>
                <button
                  onClick={() => setShowResponseForm(false)}
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

              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                Responding to: "{wondering.prompt}"
              </p>

              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="What are your thoughts on this?"
                rows={5}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
                autoFocus
              />

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-4">
                Your response will be pending until {profileName} adds it to
                their feed.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowResponseForm(false)}
                  className="flex-1 py-2.5 text-gray-600 dark:text-gray-400 text-sm font-medium hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !response.trim()}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? "Sending..." : "Send Response"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
