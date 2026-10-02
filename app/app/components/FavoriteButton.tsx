import { BookmarkSimple } from "@phosphor-icons/react";
import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { FavoriteTargetType } from "../../convex/favorites";
import { errorMessage } from "../lib/convexError";

interface FavoriteButtonProps {
  targetType: FavoriteTargetType;
  targetId: string;
  size?: "sm" | "md";
  showCount?: boolean;
  /** What a save is of, named in its accessible name ("Save Cellist"),
   *  where several Save buttons share a page. */
  name?: string;
}

// Every target but an event gets a worded pill: what pressing it does, the
// status once done, and what pressing the status does. A project or role
// favorite is a save for the Shortlist (docs/handoff/favorites-redesign/
// README.md). The toggle refuses a new save of a hidden project or a role
// that isn't open, so a page offers Save only where it would work.
const SAVE_WORDS = { idle: "Save", done: "Saved", undo: "Unsave" } as const;
const PILL_WORDS: Record<
  Exclude<FavoriteTargetType, "event">,
  { idle: string; done: string; undo: string }
> = {
  profile: { idle: "Follow", done: "Following", undo: "Unfollow" },
  project: SAVE_WORDS,
  role: SAVE_WORDS,
};

const BOOKMARK_SIZE = { sm: 14, md: 16 } as const;

export function FavoriteButton({
  targetType,
  targetId,
  size = "md",
  showCount = false,
  name,
}: FavoriteButtonProps) {
  const posthog = usePostHog();
  // One call at a time: a double click would save and unsave. The button
  // says so with aria-disabled, not disabled, which would drop its focus.
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFavorited = useQuery(api.favorites.isFavorited, {
    targetType,
    targetId,
  });
  // Only follows and hearts have a public count; a save's stays private.
  const favoriteCount = useQuery(
    api.favorites.getFavoriteCount,
    showCount && (targetType === "profile" || targetType === "event") ? { targetType, targetId } : "skip",
  );
  const toggleFavorite = useMutation(api.favorites.toggle);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await toggleFavorite({ targetType, targetId });

      // Track favorite toggled
      posthog?.capture("favorite_toggled", {
        target_type: targetType,
        action: isFavorited ? "unfavorited" : "favorited",
      });
    } catch (err) {
      // A role that closed since the page loaded, say: the server's reason.
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  // The button as it always was; after it, only when a call fails, the
  // server's reason, read out as the app's other inline errors are.
  const withError = (button: ReactNode) => (
    <>
      {button}
      {error && (
        <span role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </span>
      )}
    </>
  );

  // A profile favorite is a follow (docs/features/following.md §1). The
  // control says so in words: a hidden heart never read as "follow", and
  // hover-reveal made it unreachable on phones. Saves take the same pill
  // for the same reason. Events keep the heart.
  if (targetType !== "event") {
    const words = PILL_WORDS[targetType];
    const pillSizeClasses = {
      sm: "px-2.5 py-1 text-xs",
      md: "px-3 py-1.5 text-sm",
    };
    // A save also carries the Shortlist's bookmark, filled once saved. Its
    // accessible name is pinned to Save or Saved, whatever the icon does,
    // and names what's saved when the page passes `name`.
    const isSave = targetType !== "profile";
    const icon = isSave ? (
      <BookmarkSimple
        size={BOOKMARK_SIZE[size]}
        weight={isFavorited ? "fill" : "regular"}
        aria-hidden="true"
      />
    ) : null;
    const status = isFavorited ? words.done : words.idle;
    const ariaLabel = isSave ? (name ? `${status} ${name}` : status) : undefined;

    // "Following" is a status, not a call to action, so it is quiet: no
    // fill, a raised hairline, muted text. It only speaks up when you point at
    // it or tab to it: the label turns to "Unfollow" and the text and border
    // go to full text colour, so it is clear what pressing does. Both labels
    // sit in one grid cell, so the pill never changes width.
    // "Follow" (not yet following) stays a plain outline: still inviting.
    // "Save" / "Saved" / "Unsave" behave the same way.
    const base = `${pillSizeClasses[size]} rounded-full font-medium border transition-colors duration-200 whitespace-nowrap${isSave ? " inline-flex items-center gap-1" : ""}`;

    if (isFavorited) {
      return withError(
        <button
          onClick={handleClick}
          aria-disabled={pending || undefined}
          className={`${base} group bg-transparent text-[var(--app-text-muted)] border-[var(--app-hairline-raised)] hover:text-[var(--app-text)] hover:border-[var(--app-text)] focus-visible:text-[var(--app-text)] focus-visible:border-[var(--app-text)]`}
          title={words.undo}
          aria-label={ariaLabel}
        >
          {icon}
          <span className="inline-grid">
            <span className="col-start-1 row-start-1 group-hover:invisible group-focus-visible:invisible">
              {words.done}
            </span>
            <span
              aria-hidden="true"
              className="col-start-1 row-start-1 invisible group-hover:visible group-focus-visible:visible"
            >
              {words.undo}
            </span>
          </span>
        </button>,
      );
    }

    return withError(
      <button
        onClick={handleClick}
        aria-disabled={pending || undefined}
        className={base}
        style={{
          backgroundColor: "transparent",
          color: "var(--app-text-muted)",
          borderColor: "var(--app-hairline)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--app-accent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--app-hairline)";
        }}
        title={words.idle}
        aria-label={ariaLabel}
      >
        {icon}
        {words.idle}
      </button>,
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

  return withError(
    <button
      onClick={handleClick}
      aria-disabled={pending || undefined}
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
    </button>,
  );
}
