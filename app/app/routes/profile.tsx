import { useQuery } from "convex/react";
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
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 mb-8">
          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-2">
            Currently wondering...
          </p>
          <p className="text-lg text-gray-900 dark:text-white">
            "{profile.wondering.prompt}"
          </p>
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Share your thoughts
          </button>
        </div>
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
