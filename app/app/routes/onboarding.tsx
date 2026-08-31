import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import confetti from "canvas-confetti";
import { api } from "../../convex/_generated/api";

import { INTERESTS } from "../constants/interests";
import { ROLES, type Role } from "../constants/roles";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { useLocationField } from "../lib/useLocationField";

const PARTNER_OFFERINGS = [
  "Venue / space",
  "Equipment / gear",
  "Funding",
  "Mentorship / expertise",
  "Audience / promotion",
  "Other",
];

// Creative gets 4 stages (role, details, share work, celebrate) because
// sharing a first work is a real, distinct moment worth its own screen and
// its own confetti. Patron/Partner collapse the last two into one — there's
// no equivalent "first action" to force, so the celebration screen carries
// the light next-step copy instead of pretending there's a 4th thing to do.
function totalStepsFor(role: Role | null): number {
  return role === "creative" ? 4 : 3;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [step, setStep] = useState(1);
  const [primaryRole, setPrimaryRole] = useState<Role | null>(null);

  // Shared
  const location = useLocationField();
  const [bio, setBio] = useState("");
  const [uploading, setUploading] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Creative
  const [selectedJobFunctions, setSelectedJobFunctions] = useState<string[]>([]);

  // Patron
  const [isOrg, setIsOrg] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [supportInterests, setSupportInterests] = useState<string[]>([]);

  // Partner
  const [partnerOrgName, setPartnerOrgName] = useState("");
  const [partnerOfferings, setPartnerOfferings] = useState<string[]>([]);

  // Work creation (Creative only)
  const [workType, setWorkType] = useState<"text" | "image" | "link">("image");
  const [workTitle, setWorkTitle] = useState("");
  const [workContent, setWorkContent] = useState("");
  const [workUrl, setWorkUrl] = useState("");
  const workImageInputRef = useRef<HTMLInputElement>(null);

  const profile = useQuery(api.profiles.getMyProfile);

  // Re-entering onboarding (a second role, back button, a bookmark — nothing
  // guards against it, and re-adding roles is an intended flow) must not
  // start these fields blank: bio/location/interests previously saved
  // would otherwise get overwritten with blanks on the next submit, since
  // this form doesn't know what wasn't touched. Prefill once, like
  // settings.tsx already does.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (profile && !prefilled) {
      setBio(profile.bio || "");
      location.hydrate(profile);
      setSelectedJobFunctions(profile.interests || []);
      setPrefilled(true);
    }
    // location.hydrate is stable (useCallback with no deps) — omitting it
    // from deps here matches the existing prefill-once-on-profile-load
    // pattern and avoids re-running this effect on every location edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, prefilled]);

  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveProfileImage = useMutation(api.files.saveProfileImage);
  const getImageUrl = useQuery(
    api.files.getImageUrl,
    profileImageUrl ? { storageId: profileImageUrl } : "skip",
  );
  const createArtifact = useMutation(api.artifacts.create);

  function toggle(list: string[], setList: (v: string[]) => void, item: string) {
    setList(list.includes(item) ? list.filter((f) => f !== item) : [...list, item]);
  }

  function handleRoleSelect(role: Role) {
    setPrimaryRole(role);
    posthog?.capture("onboarding_step_completed", { step_number: 1, step_name: "role_selected", role });
    setStep(2);
  }

  // Step 2: role-specific details -> saved via one upsertProfile call
  async function handleDetailsSubmit() {
    if (!profile || !primaryRole) return;
    if (primaryRole === "creative" && selectedJobFunctions.length === 0) {
      alert("Select at least one — helps people find you.");
      return;
    }

    setUploading(true);
    try {
      await upsertProfile({
        name: profile.name,
        interests: primaryRole === "creative" ? selectedJobFunctions : undefined,
        bio: bio.trim() || undefined,
        ...location.toArgs(),
        primaryRole,
        orgName:
          primaryRole === "patron"
            ? (isOrg ? orgName.trim() : undefined) || undefined
            : primaryRole === "partner"
              ? partnerOrgName.trim() || undefined
              : undefined,
        supportInterests: primaryRole === "patron" ? supportInterests : undefined,
        partnerOfferings: primaryRole === "partner" ? partnerOfferings : undefined,
      });

      if (profileImageUrl) {
        await saveProfileImage({ storageId: profileImageUrl });
      }

      posthog?.capture("onboarding_step_completed", {
        step_number: 2,
        step_name: "details",
        role: primaryRole,
        has_bio: !!bio.trim(),
        has_location: !!location.value.trim(),
      });

      setStep(3);
    } catch (err) {
      console.error("Failed to update profile:", err);
      alert("Failed to update profile. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleProfileImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
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
      setProfileImageUrl(storageId);
    } catch (err) {
      console.error("Failed to upload image:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  // Step 3 (Creative only): share first work
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
        step_number: 3,
        step_name: "create_work",
        work_type: workType,
        has_title: !!workTitle.trim(),
      });

      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      setStep(4);
    } catch (err) {
      console.error("Failed to create work:", err);
      alert("Failed to create work. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleWorkImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
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

  function finish(destination: string) {
    posthog?.capture("onboarding_completed", { role: primaryRole });
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    navigate(destination);
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalSteps = totalStepsFor(primaryRole);
  const isLastStep = step === totalSteps;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 py-8">
      <div className="max-w-2xl w-full">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((i) => (
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
            Step {step} of {totalSteps}
          </p>
        </div>

        {/* Step 1: Role */}
        {step === 1 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                How do you want to show up?
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                You can add other roles later — this just picks where you start.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => handleRoleSelect(r.value)}
                  className="text-left px-6 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
                >
                  <span className="block font-semibold text-gray-900 dark:text-white">
                    {r.label}
                  </span>
                  <span className="block text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {r.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Role-specific details */}
        {step === 2 && primaryRole === "creative" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Complete your profile
              </h1>
              <p className="text-gray-600 dark:text-gray-400">Help others discover who you are</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Profile Photo (Optional)
              </label>
              <div className="flex items-center gap-4">
                {getImageUrl ? (
                  <img src={getImageUrl} alt={profile.name} className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-white text-2xl font-bold">
                    {profile.name.charAt(0).toUpperCase()}
                  </div>
                )}
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
                  {profileImageUrl && <p className="text-xs text-green-600 mt-1">Photo uploaded!</p>}
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What do you do? <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Select all that apply</p>
              <div className="grid grid-cols-2 gap-2">
                {INTERESTS.map((func) => (
                  <button
                    key={func}
                    onClick={() => toggle(selectedJobFunctions, setSelectedJobFunctions, func)}
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

            <LocationField location={location} />
            <BioField bio={bio} setBio={setBio} placeholder="Tell us a bit about yourself..." />

            <button
              onClick={handleDetailsSubmit}
              disabled={selectedJobFunctions.length === 0 || uploading}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Saving..." : "Continue"}
            </button>
          </div>
        )}

        {step === 2 && primaryRole === "patron" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Tell us about your support
              </h1>
              <p className="text-gray-600 dark:text-gray-400">Helps us show you the right projects</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Individual or organization?
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsOrg(false)}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !isOrg ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  Individual
                </button>
                <button
                  onClick={() => setIsOrg(true)}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isOrg ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  Organization (church, business, etc.)
                </button>
              </div>
            </div>

            {isOrg && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Organization name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Grace Fellowship"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                />
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What kinds of projects or causes do you want to support?
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Select all that apply</p>
              <div className="grid grid-cols-2 gap-2">
                {INTERESTS.map((func) => (
                  <button
                    key={func}
                    onClick={() => toggle(supportInterests, setSupportInterests, func)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      supportInterests.includes(func)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {func}
                  </button>
                ))}
              </div>
            </div>

            <LocationField location={location} />
            <BioField bio={bio} setBio={setBio} placeholder="Why do you support creatives? (optional)" />

            <button
              onClick={handleDetailsSubmit}
              disabled={uploading}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Saving..." : "Continue"}
            </button>
          </div>
        )}

        {step === 2 && primaryRole === "partner" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                What can you offer?
              </h1>
              <p className="text-gray-600 dark:text-gray-400">Space, gear, expertise — let creatives know</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Organization or business name (optional)
              </label>
              <input
                type="text"
                value={partnerOrgName}
                onChange={(e) => setPartnerOrgName(e.target.value)}
                placeholder="Radius Coffee"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What can you offer the community?
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Select all that apply</p>
              <div className="grid grid-cols-2 gap-2">
                {PARTNER_OFFERINGS.map((offering) => (
                  <button
                    key={offering}
                    onClick={() => toggle(partnerOfferings, setPartnerOfferings, offering)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      partnerOfferings.includes(offering)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {offering}
                  </button>
                ))}
              </div>
            </div>

            <LocationField
              location={location}
              helpText="Helps creatives nearby find you"
            />
            <BioField bio={bio} setBio={setBio} placeholder="Tell creatives what you have to offer (optional)" />

            <button
              onClick={handleDetailsSubmit}
              disabled={uploading}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Saving..." : "Continue"}
            </button>
          </div>
        )}

        {/* Step 3: Creative shares first work; Patron/Partner see the finish screen */}
        {step === 3 && primaryRole === "creative" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Share your first work
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Showcase what you create</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What kind of work?
              </label>
              <div className="flex gap-2">
                {(["image", "link", "text"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setWorkType(t)}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                      workType === t
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

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
                      <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-gray-600 dark:text-gray-400">Click to upload</span>
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
                onClick={() => setStep(2)}
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

        {/* Finish screen — step 4 for Creative, step 3 for Patron/Partner */}
        {isLastStep && primaryRole === "patron" && (
          <FinishScreen
            title="You're in."
            body="Browse below and we'll surface projects from the kinds of creatives you want to support first. Support any project — one-time, monthly, or just a word of encouragement — the moment you find one you love."
            cta="Browse Projects"
            onFinish={() => {
              const params = new URLSearchParams();
              if (supportInterests.length > 0) params.set("interests", supportInterests.join(","));
              if (location.value.trim()) params.set("location", location.value.trim());
              const qs = params.toString();
              finish(qs ? `/projects?${qs}` : "/projects");
            }}
          />
        )}
        {isLastStep && primaryRole === "partner" && (
          <FinishScreen
            title="You're in."
            body="The best next step is a quick conversation about how what you're offering fits — grab 15 minutes, or take a look at what creatives are making first."
            cta="Schedule a conversation"
            href="https://cal.com/rickmoy"
            onCtaClick={() =>
              posthog?.capture("onboarding_step_completed", {
                step_name: "schedule_call_clicked",
                role: "partner",
              })
            }
            secondary={{ label: "Browse Projects", onClick: () => finish("/projects") }}
          />
        )}
        {step === 4 && primaryRole === "creative" && (
          <FinishScreen
            title="You're all set!"
            body="Your profile is complete. Time to explore and connect with the community."
            cta="Explore The Exchange"
            onFinish={() => finish("/search")}
          />
        )}
      </div>
    </div>
  );
}

function LocationField({
  location,
  helpText,
}: {
  location: ReturnType<typeof useLocationField>;
  helpText?: string;
}) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Location (Optional)
      </label>
      <LocationAutocomplete
        value={location.value}
        onChange={location.onChange}
        onSelect={location.onSelect}
        placeholder="Nashville, TN"
      />
      {helpText && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{helpText}</p>}
    </div>
  );
}

function BioField({
  bio,
  setBio,
  placeholder,
}: {
  bio: string;
  setBio: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Bio (Optional)
      </label>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={200}
        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{bio.length}/200 characters</p>
    </div>
  );
}

function FinishScreen({
  title,
  body,
  cta,
  onFinish,
  href,
  onCtaClick,
  secondary,
}: {
  title: string;
  body: string;
  cta: string;
  onFinish?: () => void;
  // A real anchor with target="_blank" is honored by every browser as a
  // trusted, user-initiated navigation — unlike a JS window.open() call from
  // a click handler, which some browsers/extensions still block outright.
  href?: string;
  onCtaClick?: () => void;
  secondary?: { label: string; onClick: () => void };
}) {
  const ctaClassName =
    "block w-full py-4 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors text-lg text-center";
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl text-center">
      <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center">
        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">{title}</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-8">{body}</p>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={onCtaClick} className={ctaClassName}>
          {cta}
        </a>
      ) : (
        <button onClick={onFinish} className={ctaClassName}>
          {cta}
        </button>
      )}
      {secondary && (
        <button
          onClick={secondary.onClick}
          className="w-full mt-3 py-3 px-6 text-gray-600 dark:text-gray-400 font-medium hover:text-gray-900 dark:hover:text-white transition-colors text-sm"
        >
          {secondary.label}
        </button>
      )}
    </div>
  );
}
