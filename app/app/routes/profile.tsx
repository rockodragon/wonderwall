import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FavoriteButton } from "../components/FavoriteButton";

export default function Profile() {
  const { profileId } = useParams();
  const profile = useQuery(
    api.profiles.getProfile,
    profileId ? { profileId: profileId as Id<"profiles"> } : "skip",
  );

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
    <div className="p-6 max-w-4xl mx-auto">
      {/* Profile header */}
      <div className="flex items-start gap-6 mb-8">
        <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center overflow-hidden">
          {profile.imageUrl ? (
            <img
              src={profile.imageUrl}
              alt={profile.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-3xl font-medium text-gray-500">
              {profile.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {profile.name}
            </h1>
            <FavoriteButton targetType="profile" targetId={profile._id} />
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {profile.jobFunctions.join(" • ")}
            {profile.location && ` • ${profile.location}`}
          </p>
          {profile.bio && (
            <p className="text-gray-700 dark:text-gray-300 mt-3 max-w-xl">
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      {/* Links */}
      {profile.links && profile.links.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {profile.links.map((link) => (
            <a
              key={link._id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {link.label}
            </a>
          ))}
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
            {profile.artifacts.map((artifact) => (
              <div
                key={artifact._id}
                className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden"
              >
                {artifact.type === "image" && artifact.mediaUrl ? (
                  <img
                    src={artifact.mediaUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : artifact.type === "text" && artifact.content ? (
                  <div className="p-4 text-sm text-gray-700 dark:text-gray-300 line-clamp-6">
                    {artifact.content}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    {artifact.type}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state for no artifacts */}
      {(!profile.artifacts || profile.artifacts.length === 0) &&
        !profile.wondering && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>This profile doesn't have any content yet</p>
          </div>
        )}
    </div>
  );
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
            <p className="text-white text-2xl md:text-3xl font-medium text-center leading-relaxed max-w-2xl">
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
