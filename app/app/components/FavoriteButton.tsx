import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface FavoriteButtonProps {
  targetType: "profile" | "event";
  targetId: string;
  size?: "sm" | "md";
  showCount?: boolean;
}

export function FavoriteButton({
  targetType,
  targetId,
  size = "md",
  showCount = false,
}: FavoriteButtonProps) {
  const posthog = usePostHog();
  const isFavorited = useQuery(api.favorites.isFavorited, {
    targetType,
    targetId,
  });
  const favoriteCount = useQuery(
    api.favorites.getFavoriteCount,
    showCount ? { targetType, targetId } : "skip",
  );
  const toggleFavorite = useMutation(api.favorites.toggle);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await toggleFavorite({ targetType, targetId });

    // Track favorite toggled
    posthog?.capture("favorite_toggled", {
      target_type: targetType,
      action: isFavorited ? "unfavorited" : "favorited",
    });
  }

  // A profile favorite is a follow (docs/features/following.md §1). The
  // control says so in words: a hidden heart never read as "follow", and
  // hover-reveal made it unreachable on phones. Events keep the heart.
  if (targetType === "profile") {
    const pillSizeClasses = {
      sm: "px-2.5 py-1 text-xs",
      md: "px-3 py-1.5 text-sm",
    };

    return (
      <button
        onClick={handleClick}
        className={`${pillSizeClasses[size]} rounded-full font-medium border transition-colors duration-200 whitespace-nowrap ${
          isFavorited
            ? "bg-[var(--garden-citron)] text-[var(--garden-ink)] border-[var(--garden-citron)]"
            : "bg-transparent text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-[var(--garden-citron)]"
        }`}
        title={isFavorited ? "Unfollow" : "Follow"}
      >
        {isFavorited ? "Following" : "Follow"}
      </button>
    );
  }

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
  };

  const iconSizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
  };

  return (
    <button
      onClick={handleClick}
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center transition-all duration-200 ${
        isFavorited
          ? "bg-red-100 dark:bg-red-900/30 text-red-500"
          : "bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
      }`}
      title={isFavorited ? "Remove from favorites" : "Add to favorites"}
    >
      <svg
        className={`${iconSizeClasses[size]} transition-transform ${isFavorited ? "scale-110" : ""}`}
        fill={isFavorited ? "currentColor" : "none"}
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={isFavorited ? 0 : 2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
      {showCount && favoriteCount !== undefined && favoriteCount > 0 && (
        <span className="ml-1 text-xs font-medium">{favoriteCount}</span>
      )}
    </button>
  );
}
