import { useState, useRef, useEffect } from "react";

export function AboutWonderPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="About Wondering"
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
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full mt-2 z-50 w-72 sm:w-80"
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-500">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <span className="text-lg">?</span>
                About Wondering
              </h3>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                <strong className="text-gray-900 dark:text-white">
                  One thought at a time.
                </strong>{" "}
                Wonderings are thoughtful questions you're currently pondering.
                Not a feed of hot takes or viral content.
              </p>

              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                <strong className="text-gray-900 dark:text-white">
                  Seek, don't scroll.
                </strong>{" "}
                We're building for depth over distraction. Your one current
                thought is enough to spark meaningful connections.
              </p>

              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400 text-xs italic">
                  "Ask and it will be given to you; seek and you will find."
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
