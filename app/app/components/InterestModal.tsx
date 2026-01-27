import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useState, useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface InterestModalProps {
  jobId: Id<"jobs">;
  jobTitle: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function InterestModal({
  jobId,
  jobTitle,
  onClose,
  onSuccess,
}: InterestModalProps) {
  const posthog = usePostHog();
  const expressInterest = useMutation(api.jobs.expressInterest);
  const withdrawInterest = useMutation(api.jobs.withdrawInterest);
  const existingInterest = useQuery(api.jobs.getUserJobInterest, { jobId });
  const myArtifacts = useQuery(api.artifacts.getMyArtifacts);

  const [note, setNote] = useState("");
  const [selectedWorkLinks, setSelectedWorkLinks] = useState<Id<"artifacts">[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Pre-fill form if user already expressed interest
  useEffect(() => {
    if (existingInterest) {
      setNote(existingInterest.note || "");
      setSelectedWorkLinks(existingInterest.workLinks);
    }
  }, [existingInterest]);

  const isUpdate = !!existingInterest;
  const characterCount = note.length;
  const maxCharacters = 500;

  function toggleWorkLink(artifactId: Id<"artifacts">) {
    setSelectedWorkLinks((prev) => {
      if (prev.includes(artifactId)) {
        return prev.filter((id) => id !== artifactId);
      } else {
        if (prev.length >= 3) {
          setError("You can select up to 3 work samples");
          return prev;
        }
        setError("");
        return [...prev, artifactId];
      }
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    // Validate note length
    if (note.trim().length > maxCharacters) {
      setError(`Note must be ${maxCharacters} characters or less`);
      return;
    }

    // Validate work links count
    if (selectedWorkLinks.length > 3) {
      setError("You can select up to 3 work samples");
      return;
    }

    setSaving(true);
    try {
      await expressInterest({
        jobId,
        note: note.trim() || undefined,
        workLinks: selectedWorkLinks,
      });

      // Track event
      posthog?.capture(isUpdate ? "interest_updated" : "interest_expressed", {
        job_id: jobId,
        has_note: !!note.trim(),
        work_links_count: selectedWorkLinks.length,
      });

      setSuccessMessage(
        isUpdate
          ? "Interest updated successfully!"
          : "Interest expressed successfully!",
      );

      // Close modal after a short delay
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to express interest",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdraw() {
    if (!confirm("Are you sure you want to withdraw your interest?")) {
      return;
    }

    setError("");
    setSuccessMessage("");
    setSaving(true);

    try {
      await withdrawInterest({ jobId });

      // Track event
      posthog?.capture("interest_withdrawn", {
        job_id: jobId,
      });

      setSuccessMessage("Interest withdrawn successfully!");

      // Close modal after a short delay
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to withdraw interest",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Express Interest in {jobTitle}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-sm">
                {successMessage}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Tell the poster why you're interested..."
                rows={4}
                maxLength={maxCharacters}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
              />
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 text-right">
                {characterCount} / {maxCharacters}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Work Samples (optional, select up to 3)
              </label>

              {!myArtifacts || myArtifacts.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No work samples available. Add work samples to your profile to
                  showcase them here.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {myArtifacts.map((artifact) => {
                    const isSelected = selectedWorkLinks.includes(artifact._id);
                    const isDisabled =
                      !isSelected && selectedWorkLinks.length >= 3;

                    return (
                      <button
                        key={artifact._id}
                        type="button"
                        onClick={() => toggleWorkLink(artifact._id)}
                        disabled={isDisabled}
                        className={`relative p-3 border-2 rounded-lg transition-all ${
                          isSelected
                            ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                            : isDisabled
                              ? "border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <svg
                              className="w-5 h-5 text-blue-600"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        )}

                        <div className="flex items-start gap-3">
                          {artifact.resolvedMediaUrl && (
                            <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-gray-100 dark:bg-gray-800">
                              {artifact.type === "image" ? (
                                <img
                                  src={artifact.resolvedMediaUrl}
                                  alt={artifact.title || "Work sample"}
                                  className="w-full h-full object-cover"
                                />
                              ) : artifact.type === "video" ? (
                                <video
                                  src={artifact.resolvedMediaUrl}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                  <svg
                                    className="w-8 h-8"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                  </svg>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex-1 text-left min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                              {artifact.title || "Untitled"}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 capitalize">
                              {artifact.type}
                            </p>
                            {artifact.content && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                {artifact.content}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              {isUpdate && (
                <button
                  type="button"
                  onClick={handleWithdraw}
                  disabled={saving}
                  className="py-2 px-4 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg font-medium hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  Withdraw Interest
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving
                  ? isUpdate
                    ? "Updating..."
                    : "Submitting..."
                  : isUpdate
                    ? "Update Interest"
                    : "Submit Interest"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
