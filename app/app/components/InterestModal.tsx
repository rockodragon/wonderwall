import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useState, useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { errorMessage } from "../lib/convexError";
import { PortfolioSamplePicker } from "./PortfolioSamples";
import { MAX_WORK_SAMPLES } from "../../convex/portfolioSampleRules";

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
    if (selectedWorkLinks.length > MAX_WORK_SAMPLES) {
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
      setError(errorMessage(err, "Failed to express interest"));
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
      setError(errorMessage(err, "Failed to withdraw interest"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
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

              <PortfolioSamplePicker
                samples={myArtifacts}
                selected={selectedWorkLinks}
                onChange={setSelectedWorkLinks}
                maximum={MAX_WORK_SAMPLES}
                tone="page"
              />
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
