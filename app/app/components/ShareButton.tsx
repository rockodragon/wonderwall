import { useState } from "react";

interface ShareButtonProps {
  /** Type of content being shared */
  type: "profile" | "event" | "work" | "wondering" | "job";
  /** Title for the share dialog */
  title: string;
  /** Optional description/text */
  text?: string;
  /** URL to share (defaults to current page) */
  url?: string;
  /** Button size */
  size?: "sm" | "md";
  /** Additional class names */
  className?: string;
}

export function ShareButton({
  type,
  title,
  text,
  url,
  size = "md",
  className = "",
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl =
    url || (typeof window !== "undefined" ? window.location.href : "");

  async function handleShare() {
    const shareData = {
      title,
      text: text || `Check out this ${type} on Wonderwall`,
      url: shareUrl,
    };

    // Try native share API first (mobile)
    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled or error - fall back to clipboard
        if ((err as Error).name === "AbortError") return;
      }
    }

    // Fall back to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  const sizeClasses = {
    sm: "p-1.5",
    md: "p-2",
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
  };

  return (
    <button
      onClick={handleShare}
      className={`rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${sizeClasses[size]} ${className}`}
      title={copied ? "Copied!" : "Share"}
    >
      {copied ? (
        <svg
          className={`${iconSizes[size]} text-green-500`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className={iconSizes[size]}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
      )}
    </button>
  );
}
