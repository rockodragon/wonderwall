import { usePostHog } from "@posthog/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import confetti from "canvas-confetti";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

import { INTERESTS } from "../constants/interests";
import { ROLES, type Role } from "../constants/roles";
import { LocationAutocomplete, LocationVerifiedHint } from "../components/LocationAutocomplete";
import { useLocationField } from "../lib/useLocationField";

const PARTNER_OFFERINGS = [
  "Venue / space",
  "Equipment / gear",
  "Funding",
  "Mentorship / expertise",
  "Audience / promotion",
  "Other",
];

// Same cap and wording as settings.tsx's uploads.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const TOO_BIG_MESSAGE = "Image must be less than 5MB";

// Same pattern the server checks in profiles.upsertProfile.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A thrown ConvexError carries its message on err.data: a plain string, or
// {reason}. Production hides plain Error messages, so anything else gets the
// caller's fallback line.
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "string" && data) return data;
    if (data && typeof data === "object" && "reason" in data) {
      const reason = (data as { reason?: unknown }).reason;
      if (reason) return String(reason);
    }
  }
  return fallback;
}

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
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [step, setStep] = useState(1);
  const [primaryRole, setPrimaryRole] = useState<Role | null>(null);

  // Shared
  const location = useLocationField();
  // Only asked when the profile has no real name yet (a phone sign-in).
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  // Only asked when the account has no email (a phone sign-in) — Stripe
  // receipts and notifications need one even then.
  const [email, setEmail] = useState("");
  // Saving the step 2 details (Continue or Skip).
  const [saving, setSaving] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  // Profile photo upload in flight.
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoStorageId, setPhotoStorageId] = useState<Id<"_storage"> | null>(null);
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

  // Work creation (Creative only). Image and link keep separate state so a
  // storage id can never show up in the URL box, and Share never reads a
  // value left over from the other tab.
  const [workType, setWorkType] = useState<"text" | "image" | "link">("image");
  const [workTitle, setWorkTitle] = useState("");
  const [workContent, setWorkContent] = useState("");
  const [workLink, setWorkLink] = useState("");
  const [workImageId, setWorkImageId] = useState<Id<"_storage"> | null>(null);
  // File upload in flight. Never blocks Back or Skip.
  const [workUploading, setWorkUploading] = useState(false);
  // createArtifact in flight (short; Back and Skip wait for it).
  const [workSaving, setWorkSaving] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [workShared, setWorkShared] = useState(false);
  // Bumped whenever an in-flight upload stops mattering (tab switch, Back,
  // Skip), so a late upload can't land in the wrong place.
  const workUploadSeq = useRef(0);
  const workImageInputRef = useRef<HTMLInputElement>(null);

  const profile = useQuery(api.profiles.getMyProfile);
  const needsEmail = profile !== null && profile !== undefined && !profile.email;
  const needsName =
    profile !== null &&
    profile !== undefined &&
    (!profile.name?.trim() || profile.name === "New User");

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

  // This route sits outside the _app layout, so nothing else bounces a
  // signed-out visitor — without this they'd see the spinner forever.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login?redirect=/onboarding", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveProfileImage = useMutation(api.files.saveProfileImage);
  const getImageUrl = useQuery(
    api.files.getImageUrl,
    photoStorageId ? { storageId: photoStorageId } : "skip",
  );
  const createArtifact = useMutation(api.artifacts.create);

  function toggle(list: string[], setList: (v: string[]) => void, item: string) {
    setList(list.includes(item) ? list.filter((f) => f !== item) : [...list, item]);
  }

  function handleRoleSelect(role: Role) {
    setPrimaryRole(role);
    setDetailsError(null);
    posthog?.capture("onboarding_step_completed", { step_number: 1, step_name: "role_selected", role });
    setStep(2);
  }

  // Step 2: role-specific details -> saved via one upsertProfile call.
  // Skip saves whatever is filled in (interests may be empty) with the chosen
  // role — primaryRole is what the _app guard reads as "onboarding done" —
  // and goes straight to /today.
  async function saveDetails(skip: boolean) {
    if (!profile || !primaryRole || saving) return;
    setDetailsError(null);
    const trimmedEmail = email.trim();
    if (!skip) {
      if (primaryRole === "creative" && selectedJobFunctions.length === 0) {
        setDetailsError("Pick at least one interest.");
        return;
      }
      if (needsEmail && !trimmedEmail) {
        setDetailsError("Add an email. We need it for receipts and notifications.");
        return;
      }
    }
    // A half-typed email must not stop Skip; the server would refuse it.
    const emailToSave = !needsEmail
      ? undefined
      : skip && !EMAIL_RE.test(trimmedEmail)
        ? undefined
        : trimmedEmail;

    setSaving(true);
    try {
      await upsertProfile({
        name: needsName && name.trim() ? name.trim() : profile.name,
        interests: primaryRole === "creative" ? selectedJobFunctions : undefined,
        bio: bio.trim() || undefined,
        email: emailToSave,
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

      if (photoStorageId) {
        await saveProfileImage({ storageId: photoStorageId });
      }

      posthog?.capture("onboarding_step_completed", {
        step_number: 2,
        step_name: skip ? "details_skipped" : "details",
        role: primaryRole,
        has_bio: !!bio.trim(),
        has_location: !!location.value.trim(),
      });

      if (skip) {
        posthog?.capture("onboarding_completed", { role: primaryRole, skipped: true });
        navigate("/today");
        return;
      }
      setStep(3);
    } catch (err) {
      console.error("Failed to update profile:", err);
      setDetailsError(errorMessage(err, "Couldn't save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  // Uploads one file to Convex storage and returns its id.
  async function uploadFile(file: File): Promise<Id<"_storage">> {
    const uploadUrl = await generateUploadUrl();
    const result = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!result.ok) throw new Error("Upload failed");
    const { storageId } = await result.json();
    return storageId as Id<"_storage">;
  }

  async function handleProfileImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    // Clear the input so picking the same file again (after an error) still fires.
    input.value = "";
    if (!file) return;

    setPhotoError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setPhotoError(TOO_BIG_MESSAGE);
      return;
    }

    setPhotoUploading(true);
    try {
      setPhotoStorageId(await uploadFile(file));
    } catch (err) {
      console.error("Failed to upload image:", err);
      setPhotoError("Couldn't upload that photo. Try again.");
    } finally {
      setPhotoUploading(false);
    }
  }

  function switchWorkType(next: "text" | "image" | "link") {
    if (next === workType) return;
    workUploadSeq.current += 1;
    setWorkType(next);
    setWorkImageId(null);
    setWorkLink("");
    setWorkUploading(false);
    setWorkError(null);
  }

  // Step 3 (Creative only): share first work
  async function handleWorkSubmit() {
    if (workSaving || workUploading) return;
    setWorkError(null);
    if (workType === "image" && !workImageId) {
      setWorkError("Upload an image first.");
      return;
    }
    if (workType === "link" && !workLink.trim()) {
      setWorkError("Paste a link first.");
      return;
    }
    if (workType === "text" && !workContent.trim()) {
      setWorkError("Write something first.");
      return;
    }

    setWorkSaving(true);
    try {
      await createArtifact({
        type: workType,
        title: workTitle.trim() || undefined,
        content: workType === "text" ? workContent.trim() : undefined,
        mediaUrl: workType === "link" ? workLink.trim() : undefined,
        mediaStorageId: workType === "image" ? (workImageId ?? undefined) : undefined,
      });

      posthog?.capture("onboarding_step_completed", {
        step_number: 3,
        step_name: "create_work",
        work_type: workType,
        has_title: !!workTitle.trim(),
      });

      setWorkShared(true);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      setStep(4);
    } catch (err) {
      console.error("Failed to create work:", err);
      setWorkError(errorMessage(err, "Couldn't share that. Try again, or skip for now."));
    } finally {
      setWorkSaving(false);
    }
  }

  async function handleWorkImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setWorkError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setWorkError(TOO_BIG_MESSAGE);
      return;
    }

    const seq = ++workUploadSeq.current;
    setWorkUploading(true);
    try {
      const storageId = await uploadFile(file);
      if (seq !== workUploadSeq.current) return; // switched tab, went Back or skipped
      setWorkImageId(storageId);
    } catch (err) {
      console.error("Failed to upload image:", err);
      if (seq !== workUploadSeq.current) return;
      setWorkError("Couldn't upload that image. Try again, or skip for now.");
    } finally {
      if (seq === workUploadSeq.current) setWorkUploading(false);
    }
  }

  // Back and Skip leave step 3: drop any upload still running.
  function leaveWorkStep(next: 2 | 4) {
    workUploadSeq.current += 1;
    setWorkUploading(false);
    setWorkError(null);
    if (next === 4) {
      posthog?.capture("onboarding_step_completed", {
        step_name: "work_skipped",
        role: "creative",
      });
    }
    setStep(next);
  }

  function finish(destination: string) {
    posthog?.capture("onboarding_completed", { role: primaryRole });
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    navigate(destination);
  }

  if (authLoading || !isAuthenticated || !profile) {
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
          <p className="text-center text-sm text-gray-600 dark:text-gray-300 mt-2">
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
              <p className="text-gray-700 dark:text-gray-300">
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
                  <span className="block text-sm text-gray-600 dark:text-gray-300 mt-0.5">
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
              <p className="text-gray-700 dark:text-gray-300">Help others discover who you are</p>
            </div>

            {needsName && <NameField name={name} setName={setName} />}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Profile Photo (Optional)
              </label>
              <div className="flex items-center gap-4">
                {getImageUrl ? (
                  <img src={getImageUrl} alt={profile.name} className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-white text-2xl font-bold">
                    {(needsName && name.trim() ? name.trim() : profile.name).charAt(0).toUpperCase()}
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
                    disabled={photoUploading}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    {photoUploading ? "Uploading..." : "Upload photo"}
                  </button>
                  {photoStorageId && (
                    <p className="text-xs text-green-800 dark:text-green-400 mt-1">Photo uploaded!</p>
                  )}
                  {photoError && (
                    <p role="alert" className="text-xs text-red-700 dark:text-red-400 mt-1">
                      {photoError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Interests <span className="text-red-700 dark:text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">Pick at least one to continue.</p>
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

            {needsEmail && <EmailField email={email} setEmail={setEmail} />}
            <LocationField location={location} />
            <BioField bio={bio} setBio={setBio} placeholder="Tell us a bit about yourself..." />

            <DetailsActions
              onContinue={() => saveDetails(false)}
              onSkip={() => saveDetails(true)}
              continueDisabled={selectedJobFunctions.length === 0 || saving || photoUploading}
              saving={saving}
              error={detailsError}
            />
          </div>
        )}

        {step === 2 && primaryRole === "patron" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Tell us about your support
              </h1>
              <p className="text-gray-700 dark:text-gray-300">Helps us show you the right projects</p>
            </div>

            {needsName && <NameField name={name} setName={setName} />}

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
              <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">Select all that apply</p>
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

            {needsEmail && <EmailField email={email} setEmail={setEmail} />}
            <LocationField location={location} />
            <BioField bio={bio} setBio={setBio} placeholder="Why do you support creatives? (optional)" />

            <DetailsActions
              onContinue={() => saveDetails(false)}
              onSkip={() => saveDetails(true)}
              continueDisabled={saving}
              saving={saving}
              error={detailsError}
            />
          </div>
        )}

        {step === 2 && primaryRole === "partner" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                What can you offer?
              </h1>
              <p className="text-gray-700 dark:text-gray-300">Space, gear, expertise — let creatives know</p>
            </div>

            {needsName && <NameField name={name} setName={setName} />}

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
              <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">Select all that apply</p>
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

            {needsEmail && <EmailField email={email} setEmail={setEmail} />}
            <LocationField
              location={location}
              helpText="Helps creatives nearby find you"
            />
            <BioField bio={bio} setBio={setBio} placeholder="Tell creatives what you have to offer (optional)" />

            <DetailsActions
              onContinue={() => saveDetails(false)}
              onSkip={() => saveDetails(true)}
              continueDisabled={saving}
              saving={saving}
              error={detailsError}
            />
          </div>
        )}

        {/* Step 3: Creative shares first work; Patron/Partner see the finish screen */}
        {step === 3 && primaryRole === "creative" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Share your first work
              </h2>
              <p className="text-gray-700 dark:text-gray-300 text-sm">Showcase what you create</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What kind of work?
              </label>
              <div className="flex gap-2">
                {(["image", "link", "text"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => switchWorkType(t)}
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
                  Upload Image <span className="text-red-700 dark:text-red-400">*</span>
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
                  disabled={workUploading}
                  className="w-full px-4 py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {workUploading ? (
                    <span>Uploading...</span>
                  ) : workImageId ? (
                    <span className="text-green-800 dark:text-green-400">Image uploaded!</span>
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
                      <span className="text-gray-700 dark:text-gray-300">Click to upload</span>
                    </div>
                  )}
                </button>
              </div>
            )}

            {workType === "link" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  URL <span className="text-red-700 dark:text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={workLink}
                  onChange={(e) => setWorkLink(e.target.value)}
                  placeholder="https://example.com/my-work"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                />
              </div>
            )}

            {workType === "text" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Content <span className="text-red-700 dark:text-red-400">*</span>
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

            {workError && (
              <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
                {workError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => leaveWorkStep(2)}
                disabled={workSaving}
                className="flex-1 py-3 px-4 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleWorkSubmit}
                disabled={workUploading || workSaving}
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {workSaving ? "Sharing..." : "Share work"}
              </button>
            </div>
            {/* Work is optional. Skip stays usable during an upload — only the
                short save itself holds it. */}
            <button
              onClick={() => leaveWorkStep(4)}
              disabled={workSaving}
              className="mt-4 w-full py-2 text-[13.5px] font-medium text-gray-700 dark:text-gray-300 underline underline-offset-4 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* Finish screen — step 4 for Creative, step 3 for Patron/Partner.
            Explore is always the main button. */}
        {isLastStep && primaryRole === "patron" && (
          <FinishScreen
            title="You're in."
            body={
              supportInterests.length > 0
                ? "Projects that match your interests come first."
                : "Find a project you want to back."
            }
            onExplore={() => finish("/today")}
            secondary={{
              label: "See projects",
              onClick: () => {
                const params = new URLSearchParams();
                if (supportInterests.length > 0) params.set("interests", supportInterests.join(","));
                if (location.value.trim()) params.set("location", location.value.trim());
                const qs = params.toString();
                finish(qs ? `/projects?${qs}` : "/projects");
              },
            }}
          />
        )}
        {isLastStep && primaryRole === "partner" && (
          <FinishScreen
            title="You're in."
            body="Want to talk it through? Grab 15 minutes with us."
            onExplore={() => finish("/today")}
            secondary={{
              label: "Schedule a conversation",
              href: "https://cal.com/rickmoy",
              onClick: () =>
                posthog?.capture("onboarding_step_completed", {
                  step_name: "schedule_call_clicked",
                  role: "partner",
                }),
            }}
          />
        )}
        {step === 4 && primaryRole === "creative" && (
          <FinishScreen
            title="You're all set!"
            body={workShared ? "Your work is on your profile." : "You can add work any time."}
            onExplore={() => finish("/today")}
            secondary={{
              label: workShared ? "Add more work" : "Add work",
              onClick: () => finish("/works"),
            }}
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
      <LocationVerifiedHint value={location.value} selected={location.selected} />
      {helpText && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{helpText}</p>}
    </div>
  );
}

function EmailField({
  email,
  setEmail,
}: {
  email: string;
  setEmail: (v: string) => void;
}) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Email <span className="text-red-700 dark:text-red-400">*</span>
      </label>
      <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
        For receipts and notifications — you signed up with a phone number.
      </p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
      />
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
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{bio.length}/200 characters</p>
    </div>
  );
}

function NameField({
  name,
  setName,
}: {
  name: string;
  setName: (v: string) => void;
}) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Your name
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Jane Smith"
        autoComplete="name"
        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
      />
    </div>
  );
}

// Continue + a quiet Skip + the inline error, shared by all three roles.
// Skip only waits on the save itself.
function DetailsActions({
  onContinue,
  onSkip,
  continueDisabled,
  saving,
  error,
}: {
  onContinue: () => void;
  onSkip: () => void;
  continueDisabled: boolean;
  saving: boolean;
  error: string | null;
}) {
  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        onClick={onContinue}
        disabled={continueDisabled}
        className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Saving..." : "Continue"}
      </button>
      <button
        onClick={onSkip}
        disabled={saving}
        className="mt-3 w-full py-2 text-[13.5px] font-medium text-gray-700 dark:text-gray-300 underline underline-offset-4 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
      >
        Skip for now
      </button>
    </div>
  );
}

function FinishScreen({
  title,
  body,
  onExplore,
  secondary,
}: {
  title: string;
  body: string;
  onExplore: () => void;
  // A real anchor with target="_blank" is honored by every browser as a
  // trusted, user-initiated navigation — unlike a JS window.open() call from
  // a click handler, which some browsers/extensions still block outright.
  secondary: { label: string; onClick: () => void; href?: string };
}) {
  const secondaryClassName =
    "block w-full mt-3 py-3 px-6 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-center";
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl text-center">
      <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full flex items-center justify-center">
        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">{title}</h2>
      <p className="text-gray-700 dark:text-gray-300 mb-8">{body}</p>
      <button
        onClick={onExplore}
        className="block w-full py-4 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors text-lg text-center"
      >
        Explore
      </button>
      {secondary.href ? (
        <a
          href={secondary.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={secondary.onClick}
          className={secondaryClassName}
        >
          {secondary.label}
        </a>
      ) : (
        <button onClick={secondary.onClick} className={secondaryClassName}>
          {secondary.label}
        </button>
      )}
    </div>
  );
}
