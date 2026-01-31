import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import confetti from "canvas-confetti";
import { api } from "../../convex/_generated/api";

// Get anonymous ID for analytics
function getAnonymousId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("analytics_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("analytics_id", id);
  }
  return id;
}

export function CreateWonderingComposer() {
  const captureEvent = useAction(api.posthog.capture);
  const profile = useQuery(api.profiles.getMyProfile);
  const wondering = useQuery(api.wonderings.getMyWondering);
  const createWondering = useMutation(api.wonderings.create);
  const updateWondering = useMutation(api.wonderings.update);
  const archiveWondering = useMutation(api.wonderings.archive);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveWonderingImage = useMutation(api.files.saveWonderingImage);

  const [isExpanded, setIsExpanded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isExpired = wondering?.expiresAt && Date.now() > wondering.expiresAt;
  const hasActiveWondering = wondering && !isExpired;

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }

    setUploadingImage(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) throw new Error("Upload failed");

      const { storageId } = await result.json();

      // If user already has a wondering, save image to it
      // Otherwise, we'll attach it when they create the wondering
      if (hasActiveWondering) {
        await saveWonderingImage({ wonderingId: wondering._id, storageId });
      }

      // For new wonderings, we'd need to store storageId temporarily
      // For now, let's just upload to existing wondering
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  }

  async function handleSubmit() {
    if (!prompt.trim()) return;

    // If user has active wondering, show replace confirmation
    if (hasActiveWondering && !showReplaceConfirm) {
      setShowReplaceConfirm(true);
      return;
    }

    setSubmitting(true);
    try {
      if (hasActiveWondering) {
        // Archive old one
        await archiveWondering({ wonderingId: wondering._id });
      }

      // Create new wondering
      await createWondering({
        prompt: prompt.trim(),
      });

      // Celebrate with confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      // Track wondering created
      captureEvent({
        event: "wondering_created",
        distinctId: getAnonymousId(),
        properties: {
          prompt_length: prompt.trim().length,
          replaced_existing: hasActiveWondering,
        },
      }).catch(console.error);

      // Reset form
      setPrompt("");
      setIsExpanded(false);
      setShowReplaceConfirm(false);
    } catch (err) {
      console.error("Failed to post wondering:", err);
      alert("Failed to post wondering. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setPrompt("");
    setIsExpanded(false);
    setShowReplaceConfirm(false);
  }

  if (!profile) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Collapsed state */}
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
        >
          {profile.imageUrl ? (
            <img
              src={profile.imageUrl}
              alt={profile.name}
              className="w-10 h-10 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-gray-500 dark:text-gray-400">
            Post to share what you're wondering about
          </span>
        </button>
      ) : (
        /* Expanded state */
        <div className="p-4">
          {/* Replace confirmation */}
          {showReplaceConfirm ? (
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  Replace your wondering?
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  You already have an active wondering:
                </p>
                <p className="text-sm italic text-gray-600 dark:text-gray-400 pl-4 border-l-2 border-yellow-300 dark:border-yellow-700">
                  "{wondering?.prompt}"
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  It will be archived and no longer accept responses. Your new
                  wondering will take its place.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-2.5 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? "Replacing..." : "Replace & Post"}
                </button>
              </div>
            </div>
          ) : (
            /* Normal expanded form */
            <div className="space-y-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What if we reimagined worship spaces as interactive art galleries?"
                rows={3}
                maxLength={280}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
                autoFocus
              />
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{prompt.length}/280 characters</span>
              </div>

              {/* Hidden image upload for future background image support */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                  {/* Future: Add background image button */}
                  {/* <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                    title="Add background image"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button> */}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 text-sm font-medium hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !prompt.trim()}
                    className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Posting..." : "Post Wondering"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
