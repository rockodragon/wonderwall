import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import confetti from "canvas-confetti";
import { api } from "../../convex/_generated/api";

const JOB_FUNCTIONS = [
  "Photographer",
  "Videographer",
  "Designer",
  "Developer",
  "Writer",
  "Musician",
  "Artist",
  "Filmmaker",
  "Content Creator",
  "Other",
];

export default function Onboarding() {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [step, setStep] = useState(1);

  // Profile setup
  const [selectedJobFunctions, setSelectedJobFunctions] = useState<string[]>(
    [],
  );
  const [bio, setBio] = useState("");
  const [uploading, setUploading] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Work creation
  const [workType, setWorkType] = useState<"text" | "image" | "link">("image");
  const [workTitle, setWorkTitle] = useState("");
  const [workContent, setWorkContent] = useState("");
  const [workUrl, setWorkUrl] = useState("");
  const workImageInputRef = useRef<HTMLInputElement>(null);

  // Wondering creation
  const [wonderPrompt, setWonderPrompt] = useState("");

  const profile = useQuery(api.profiles.getMyProfile);
  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveProfileImage = useMutation(api.files.saveProfileImage);
  const createArtifact = useMutation(api.artifacts.create);
  const createWondering = useMutation(api.wonderings.create);
  const inviteLink = useQuery(api.invites.getMyInviteLink);

  // Step 1: Profile Setup
  async function handleProfileSubmit() {
    if (selectedJobFunctions.length === 0) {
      alert("Please select at least one job function");
      return;
    }

    if (!profile) return;

    setUploading(true);
    try {
      // Update profile with job functions and bio
      await upsertProfile({
        name: profile.name, // Keep existing name
        jobFunctions: selectedJobFunctions,
        bio: bio.trim() || undefined,
      });

      // Save profile image if uploaded
      if (profileImageUrl) {
        await saveProfileImage({ storageId: profileImageUrl });
      }

      posthog?.capture("onboarding_step_completed", {
        step_number: 1,
        step_name: "profile_setup",
        job_functions_count: selectedJobFunctions.length,
        has_bio: !!bio.trim(),
        has_image: !!profileImageUrl,
      });

      setStep(2);
    } catch (err) {
      console.error("Failed to update profile:", err);
      alert("Failed to update profile. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleProfileImageUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) throw new Error("Upload failed");

      const { storageId } = await result.json();
      // For now, we'll just track that they uploaded an image
      // The actual imageStorageId will be set in upsertProfile
      setProfileImageUrl(storageId);
    } catch (err) {
      console.error("Failed to upload image:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  // Step 2: Create Work
  async function handleWorkSubmit() {
    if (workType === "image" && !workUrl) {
      alert("Please upload an image");
      return;
    }
    if (workType === "link" && !workUrl.trim()) {
      alert("Please enter a URL");
      return;
    }
    if (workType === "text" && !workContent.trim()) {
      alert("Please enter some content");
      return;
    }

    setUploading(true);
    try {
      await createArtifact({
        type: workType,
        title: workTitle.trim() || undefined,
        content: workType === "text" ? workContent.trim() : undefined,
        mediaUrl: workType === "link" ? workUrl.trim() : undefined,
        mediaStorageId: workType === "image" ? workUrl : undefined,
      });

      posthog?.capture("onboarding_step_completed", {
        step_number: 2,
        step_name: "create_work",
        work_type: workType,
        has_title: !!workTitle.trim(),
      });

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      setStep(3);
    } catch (err) {
      console.error("Failed to create work:", err);
      alert("Failed to create work. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleWorkImageUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) throw new Error("Upload failed");

      const { storageId } = await result.json();
      setWorkUrl(storageId);
    } catch (err) {
      console.error("Failed to upload image:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  // Step 3: Create Wondering
  async function handleCreateWonder() {
    if (!wonderPrompt.trim()) {
      alert("Please enter a wondering");
      return;
    }

    setUploading(true);
    try {
      await createWondering({
        prompt: wonderPrompt.trim(),
      });

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      posthog?.capture("onboarding_step_completed", {
        step_number: 3,
        step_name: "create_wondering",
        wondering_length: wonderPrompt.trim().length,
      });

      setStep(4);
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
            {[1, 2, 3, 4].map((i) => (
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
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
            Step {step} of 4
          </p>
        </div>

        {/* Step 1: Profile Setup */}
        {step === 1 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Complete your profile
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Help others discover who you are
              </p>
            </div>

            {/* Profile Photo */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Profile Photo (Optional)
              </label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProfileImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploading}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    {uploading ? "Uploading..." : "Upload photo"}
                  </button>
                  {profileImageUrl && (
                    <p className="text-xs text-green-600 mt-1">
                      Photo uploaded!
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Job Functions */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What do you do? <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Select all that apply
              </p>
              <div className="grid grid-cols-2 gap-2">
                {JOB_FUNCTIONS.map((func) => (
                  <button
                    key={func}
                    onClick={() => {
                      if (selectedJobFunctions.includes(func)) {
                        setSelectedJobFunctions(
                          selectedJobFunctions.filter((f) => f !== func),
                        );
                      } else {
                        setSelectedJobFunctions([
                          ...selectedJobFunctions,
                          func,
                        ]);
                      }
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedJobFunctions.includes(func)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {func}
                  </button>
                ))}
              </div>
            </div>

            {/* Bio */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Bio (Optional)
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us a bit about yourself..."
                rows={3}
                maxLength={200}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {bio.length}/200 characters
              </p>
            </div>

            <button
              onClick={handleProfileSubmit}
              disabled={selectedJobFunctions.length === 0 || uploading}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Saving..." : "Continue"}
            </button>
          </div>
        )}

        {/* Step 2: Create Work */}
        {step === 2 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Share your first work
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Showcase what you create
              </p>
            </div>

            {/* Work Type Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What kind of work?
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setWorkType("image")}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    workType === "image"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  Image
                </button>
                <button
                  onClick={() => setWorkType("link")}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    workType === "link"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  Link
                </button>
                <button
                  onClick={() => setWorkType("text")}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    workType === "text"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  Text
                </button>
              </div>
            </div>

            {/* Title */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Title (Optional)
              </label>
              <input
                type="text"
                value={workTitle}
                onChange={(e) => setWorkTitle(e.target.value)}
                placeholder="My latest project"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* Content based on type */}
            {workType === "image" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload Image <span className="text-red-500">*</span>
                </label>
                <input
                  ref={workImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleWorkImageUpload}
                  className="hidden"
                />
                <button
                  onClick={() => workImageInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full px-4 py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <span>Uploading...</span>
                  ) : workUrl ? (
                    <span className="text-green-600">Image uploaded!</span>
                  ) : (
                    <div>
                      <svg
                        className="w-12 h-12 mx-auto mb-2 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-gray-600 dark:text-gray-400">
                        Click to upload
                      </span>
                    </div>
                  )}
                </button>
              </div>
            )}

            {workType === "link" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={workUrl}
                  onChange={(e) => setWorkUrl(e.target.value)}
                  placeholder="https://example.com/my-work"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                />
              </div>
            )}

            {workType === "text" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={workContent}
                  onChange={(e) => setWorkContent(e.target.value)}
                  placeholder="Write your content here..."
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 px-4 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleWorkSubmit}
                disabled={uploading}
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? "Creating..." : "Share work"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Create Wondering */}
        {step === 3 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                What are you wondering about?
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Share a question, thought, or idea you're exploring
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
                onClick={() => setStep(2)}
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

        {/* Step 4: Celebration & Invite */}
        {step === 4 && (
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
              Your profile is complete. Time to explore and connect with the
              community.
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
              onClick={() => {
                posthog?.capture("onboarding_completed");
                navigate("/search");
              }}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Explore Wonderwall
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
