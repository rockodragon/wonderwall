import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import confetti from "canvas-confetti";
import { api } from "../../convex/_generated/api";

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [wonderPrompt, setWonderPrompt] = useState("");
  const [uploading, setUploading] = useState(false);

  const profile = useQuery(api.profiles.getMyProfile);
  const createWondering = useMutation(api.wonderings.create);
  const inviteLink = useQuery(api.invites.getMyInviteLink);

  async function handleCreateWonder() {
    if (!wonderPrompt.trim()) return;

    setUploading(true);
    try {
      await createWondering({
        prompt: wonderPrompt.trim(),
      });

      // Celebrate!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      setStep(3); // Go to celebration step
    } catch (err) {
      console.error("Failed to create wondering:", err);
      alert("Failed to create wondering. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function copyInviteLink() {
    if (!inviteLink?.slug) return;
    const url = `${window.location.origin}/signup/${inviteLink.slug}`;
    navigator.clipboard.writeText(url);
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 py-8">
      <div className="max-w-2xl w-full">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === step
                    ? "w-8 bg-blue-600"
                    : i < step
                      ? "w-2 bg-blue-600"
                      : "w-2 bg-gray-300 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Welcome, {profile.name}!
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Let's get you started on Wonderwall
              </p>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <div className="w-8 h-8 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                    What's a "wondering"?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    It's your current question or thought you're pondering. One
                    at a time, so make it count. Others can respond and share
                    their perspectives.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Create your first wondering
            </button>
          </div>
        )}

        {/* Step 2: Create Wonder */}
        {step === 2 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                What are you wondering about?
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Share a question, thought, or idea you're exploring. Others can
                respond and join the conversation.
              </p>
            </div>

            <div className="mb-6">
              <textarea
                value={wonderPrompt}
                onChange={(e) => setWonderPrompt(e.target.value)}
                placeholder="What if we reimagined worship spaces as interactive art galleries?"
                rows={4}
                maxLength={280}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
                autoFocus
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {wonderPrompt.length}/280 characters
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                💡 <span className="font-medium">Tip:</span> Great wonderings
                are:
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                <li>• Thought-provoking questions</li>
                <li>• Ideas you're exploring</li>
                <li>• Reflections on faith and creativity</li>
                <li>• Invitations for others to share wisdom</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 px-4 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateWonder}
                disabled={!wonderPrompt.trim() || uploading}
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? "Creating..." : "Post wondering"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Celebration & Invite */}
        {step === 3 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center">
              <svg
                className="w-12 h-12 text-white"
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
            </div>

            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
              You're all set!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Your wondering is live. People can now discover it and respond
              with their thoughts.
            </p>

            {/* Invite CTA */}
            <div className="bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 rounded-2xl p-6 mb-6 text-white">
              <h3 className="text-xl font-semibold mb-2">
                Now, invite someone
              </h3>
              <p className="text-white/90 text-sm mb-4">
                Who do you know that would add value to this community?
              </p>
              {inviteLink?.slug && (
                <button
                  onClick={copyInviteLink}
                  className="w-full py-3 px-4 bg-white/20 hover:bg-white/30 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
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
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy your invite link
                </button>
              )}
            </div>

            <button
              onClick={() => navigate("/search")}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Explore Wonderwall
            </button>

            <button
              onClick={() => navigate("/settings")}
              className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mt-3"
            >
              Complete your profile later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
