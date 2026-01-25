import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";

const JOB_FUNCTIONS = [
  "Designer",
  "Writer",
  "Filmmaker",
  "Musician",
  "Photographer",
  "Developer",
  "Illustrator",
  "Animator",
  "Producer",
  "Other",
];

export default function Settings() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const profile = useQuery(api.profiles.getMyProfile);
  const [showProfileEdit, setShowProfileEdit] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  // Show profile edit by default if no profile exists yet
  const hasProfile = profile && profile.name;
  const isEditingProfile = showProfileEdit || !hasProfile;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Profile section - at top */}
      <div className="mb-8">
        {hasProfile && !isEditingProfile ? (
          <ProfileSummary
            profile={profile}
            onEdit={() => setShowProfileEdit(true)}
          />
        ) : (
          <ProfileEditForm
            profile={profile}
            onDone={() => setShowProfileEdit(false)}
            isNewProfile={!hasProfile}
          />
        )}
      </div>

      {/* Wondering section */}
      <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
        <WonderingSection />
      </div>

      {/* Artifacts section */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
        <ArtifactsSection />
      </div>

      {/* Sign out */}
      <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={handleSignOut}
          className="text-red-600 hover:text-red-500 font-medium"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function ProfileSummary({
  profile,
  onEdit,
}: {
  profile: NonNullable<
    ReturnType<typeof useQuery<typeof api.profiles.getMyProfile>>
  >;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        {profile.imageUrl ? (
          <img
            src={profile.imageUrl}
            alt={profile.name}
            className="w-16 h-16 rounded-full object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
            {profile.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {profile.name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {profile.jobFunctions?.join(", ") || "No roles set"}
          </p>
        </div>
      </div>
      <button
        onClick={onEdit}
        className="px-4 py-2 text-blue-600 hover:text-blue-500 text-sm font-medium"
      >
        Edit Profile
      </button>
    </div>
  );
}

function ProfileEditForm({
  profile,
  onDone,
  isNewProfile,
}: {
  profile: ReturnType<typeof useQuery<typeof api.profiles.getMyProfile>>;
  onDone: () => void;
  isNewProfile: boolean;
}) {
  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveProfileImage = useMutation(api.files.saveProfileImage);
  const deleteProfileImage = useMutation(api.files.deleteProfileImage);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [jobFunctions, setJobFunctions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile && !initialized) {
      setName(profile.name || "");
      setBio(profile.bio || "");
      setLocation(profile.location || "");
      setImageUrl(profile.imageUrl || "");
      setJobFunctions(profile.jobFunctions || []);
      setInitialized(true);
    }
  }, [profile, initialized]);

  function toggleJobFunction(fn: string) {
    setJobFunctions((prev) =>
      prev.includes(fn) ? prev.filter((f) => f !== fn) : [...prev, fn],
    );
  }

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
      await saveProfileImage({ storageId });
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDeleteImage() {
    if (!confirm("Remove your profile photo?")) return;
    try {
      await deleteProfileImage();
      setImageUrl("");
    } catch (err) {
      console.error("Delete error:", err);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      await upsertProfile({
        name: name.trim(),
        bio: bio.trim() || undefined,
        location: location.trim() || undefined,
        jobFunctions,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const displayImageUrl = profile?.imageUrl || imageUrl;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {isNewProfile ? "Set Up Your Profile" : "Edit Profile"}
        </h2>
        {!isNewProfile && (
          <button
            onClick={onDone}
            className="text-sm text-gray-500 hover:text-gray-400"
          >
            Cancel
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile Image */}
        <div className="flex items-start gap-4">
          <div className="shrink-0 relative">
            {displayImageUrl ? (
              <img
                src={displayImageUrl}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-3xl font-bold">
                {name.charAt(0).toUpperCase() || "?"}
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Profile Photo
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {uploading
                  ? "Uploading..."
                  : displayImageUrl
                    ? "Change Photo"
                    : "Upload Photo"}
              </button>
              {displayImageUrl && (
                <button
                  type="button"
                  onClick={handleDeleteImage}
                  className="px-4 py-2 text-red-600 hover:text-red-500 text-sm font-medium"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              JPG, PNG or GIF. Max 5MB.
            </p>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Bio
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Tell us about yourself..."
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, State"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
          />
        </div>

        {/* Job Functions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            What do you do?
          </label>
          <div className="flex flex-wrap gap-2">
            {JOB_FUNCTIONS.map((fn) => (
              <button
                key={fn}
                type="button"
                onClick={() => toggleJobFunction(fn)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  jobFunctions.includes(fn)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {fn}
              </button>
            ))}
          </div>
        </div>

        {/* Save button */}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </div>
  );
}

function WonderingSection() {
  const wondering = useQuery(api.wonderings.getMyWondering);
  const responses = useQuery(
    api.wonderings.getResponses,
    wondering ? { wonderingId: wondering._id } : "skip",
  );
  const createWondering = useMutation(api.wonderings.create);
  const updateWondering = useMutation(api.wonderings.update);
  const archiveWondering = useMutation(api.wonderings.archive);
  const toggleResponsePublic = useMutation(api.wonderings.toggleResponsePublic);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveWonderingImage = useMutation(api.files.saveWonderingImage);
  const deleteWonderingImage = useMutation(api.files.deleteWonderingImage);

  const [isEditing, setIsEditing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wondering && !isEditing) {
      setPrompt(wondering.prompt);
    }
  }, [wondering, isEditing]);

  async function handleSave() {
    if (!prompt.trim()) return;
    setSaving(true);
    try {
      if (wondering) {
        await updateWondering({ wonderingId: wondering._id, prompt });
      } else {
        await createWondering({ prompt });
      }
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!wondering) return;
    if (!confirm("Archive this wondering? You can create a new one after."))
      return;
    await archiveWondering({ wonderingId: wondering._id });
    setPrompt("");
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !wondering) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }

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
      await saveWonderingImage({ wonderingId: wondering._id, storageId });
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  }

  async function handleDeleteImage() {
    if (!wondering || !confirm("Remove background image?")) return;
    try {
      await deleteWonderingImage({ wonderingId: wondering._id });
    } catch (err) {
      console.error("Delete error:", err);
    }
  }

  const isExpired = wondering?.expiresAt && Date.now() > wondering.expiresAt;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        What are you wondering?
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Share a question you're pondering. Others can respond with their
        thoughts. Wonderings last 2 weeks, but you can replace yours early if
        you have a new question. One at a time.
      </p>

      {wondering && !isEditing ? (
        <div className="space-y-4">
          {/* Preview card with background image */}
          <div
            className="relative rounded-xl overflow-hidden"
            style={{ minHeight: "200px" }}
          >
            {wondering.imageUrl ? (
              <img
                src={wondering.imageUrl}
                alt="Wondering background"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-purple-500" />
            )}
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative p-6 flex items-center justify-center min-h-[200px]">
              <p className="text-white text-xl font-medium text-center leading-relaxed">
                "{wondering.prompt}"
              </p>
            </div>
          </div>

          {wondering.expiresAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isExpired
                ? "Expired - no longer accepting responses"
                : `Expires ${new Date(wondering.expiresAt).toLocaleDateString()}`}
            </p>
          )}

          {/* Image upload controls */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {uploading
                ? "Uploading..."
                : wondering.imageUrl
                  ? "Change Background"
                  : "Add Background"}
            </button>
            {wondering.imageUrl && (
              <button
                type="button"
                onClick={handleDeleteImage}
                className="px-3 py-1.5 text-red-600 hover:text-red-500 text-sm font-medium"
              >
                Remove Image
              </button>
            )}
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 text-blue-600 hover:text-blue-500 text-sm font-medium"
            >
              Edit Text
            </button>
            <button
              onClick={handleArchive}
              className="px-3 py-1.5 text-gray-500 hover:text-gray-400 text-sm font-medium"
            >
              Replace with New
            </button>
          </div>

          {/* Responses section */}
          {responses && responses.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                Responses ({responses.length})
              </h3>
              <div className="space-y-4">
                {responses.map((response) => (
                  <div
                    key={response._id}
                    className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl"
                  >
                    <p className="text-gray-700 dark:text-gray-300 text-sm">
                      {response.content}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(response.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() =>
                          toggleResponsePublic({ responseId: response._id })
                        }
                        className={`text-xs font-medium px-2 py-1 rounded ${
                          response.isPublic
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                        }`}
                      >
                        {response.isPublic ? "In Feed" : "Add to Feed"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What's on your mind? e.g., 'How do you stay creative when you're burnt out?'"
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none text-lg"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !prompt.trim()}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Posting..." : wondering ? "Update" : "Post Wondering"}
            </button>
            {isEditing && (
              <button
                onClick={() => {
                  setIsEditing(false);
                  setPrompt(wondering?.prompt || "");
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const ARTIFACT_TYPES = [
  {
    value: "text",
    label: "Text",
    icon: "📝",
    gradient: "from-amber-400 to-orange-500",
  },
  {
    value: "image",
    label: "Image",
    icon: "🖼️",
    gradient: "from-pink-400 to-rose-500",
  },
  {
    value: "video",
    label: "Video",
    icon: "🎬",
    gradient: "from-purple-400 to-indigo-500",
  },
  {
    value: "audio",
    label: "Audio",
    icon: "🎵",
    gradient: "from-green-400 to-emerald-500",
  },
  {
    value: "link",
    label: "Link",
    icon: "🔗",
    gradient: "from-blue-400 to-cyan-500",
  },
];

function ArtifactsSection() {
  const artifacts = useQuery(api.artifacts.getMyArtifacts);
  const createArtifact = useMutation(api.artifacts.create);
  const updateArtifact = useMutation(api.artifacts.update);
  const removeArtifact = useMutation(api.artifacts.remove);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedStorageId, setUploadedStorageId] = useState<string | null>(
    null,
  );
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setType("text");
    setTitle("");
    setContent("");
    setMediaUrl("");
    setUploadedStorageId(null);
    setUploadedPreview(null);
    setShowAddForm(false);
    setEditingId(null);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      alert("File must be less than 5MB");
      return;
    }

    // Validate file type
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const isAudio = file.type.startsWith("audio/");

    if (!isImage && !isVideo && !isAudio) {
      alert("Please select an image, video, or audio file");
      return;
    }

    // Auto-set type based on file
    if (isImage) setType("image");
    else if (isVideo) setType("video");
    else if (isAudio) setType("audio");

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
      setUploadedStorageId(storageId);

      // Create preview for images
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => setUploadedPreview(e.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        setUploadedPreview(null);
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload file. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleCreate() {
    if (type === "text" && !content.trim()) return;
    if (type !== "text" && !mediaUrl.trim() && !uploadedStorageId) return;

    setSaving(true);
    try {
      await createArtifact({
        type,
        title: title.trim() || undefined,
        content: type === "text" ? content.trim() : undefined,
        mediaUrl:
          type !== "text" && !uploadedStorageId ? mediaUrl.trim() : undefined,
        mediaStorageId: uploadedStorageId as any,
      });
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(artifactId: string) {
    setSaving(true);
    try {
      await updateArtifact({
        artifactId: artifactId as any,
        title: title.trim() || undefined,
        content: type === "text" ? content.trim() : undefined,
        mediaUrl:
          type !== "text" && !uploadedStorageId ? mediaUrl.trim() : undefined,
        mediaStorageId: uploadedStorageId as any,
      });
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(artifactId: string) {
    if (!confirm("Delete this artifact?")) return;
    await removeArtifact({ artifactId: artifactId as any });
  }

  function startEdit(artifact: any) {
    setEditingId(artifact._id);
    setType(artifact.type);
    setTitle(artifact.title || "");
    setContent(artifact.content || "");
    setMediaUrl(artifact.mediaUrl || "");
    setUploadedStorageId(null);
    setUploadedPreview(null);
  }

  const canSubmit =
    type === "text"
      ? content.trim().length > 0
      : mediaUrl.trim().length > 0 || uploadedStorageId;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Work & Portfolio
        </h2>
        {!showAddForm && !editingId && (
          <button
            onClick={() => setShowAddForm(true)}
            className="text-sm text-blue-600 hover:text-blue-500 font-medium"
          >
            + Add
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Showcase your work with text, images, videos, audio, or links. Max 5MB
        per file.
      </p>

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div className="flex flex-wrap gap-2 mb-4">
            {ARTIFACT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  type === t.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Title input for all types */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white mb-3"
          />

          {type === "text" ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write something..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white resize-none mb-3"
            />
          ) : (
            <div className="space-y-3 mb-3">
              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  type === "image"
                    ? "image/*"
                    : type === "video"
                      ? "video/*"
                      : type === "audio"
                        ? "audio/*"
                        : "image/*,video/*,audio/*"
                }
                onChange={handleFileUpload}
                className="hidden"
              />

              {uploadedPreview || uploadedStorageId ? (
                <div className="relative">
                  {uploadedPreview ? (
                    <img
                      src={uploadedPreview}
                      alt="Preview"
                      className="w-full h-40 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-20 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                      <span className="text-green-600 dark:text-green-400 text-sm">
                        File uploaded successfully
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setUploadedStorageId(null);
                      setUploadedPreview(null);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-sm"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 transition-colors"
                >
                  {uploading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-400 border-t-transparent" />
                      Uploading...
                    </span>
                  ) : (
                    <span>Click to upload {type} (max 5MB)</span>
                  )}
                </button>
              )}

              {/* Or use URL */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-gray-50 dark:bg-gray-800 text-gray-500">
                    or paste URL
                  </span>
                </div>
              </div>

              <input
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder={
                  type === "image"
                    ? "Image URL"
                    : type === "video"
                      ? "Video URL (YouTube, Vimeo)"
                      : type === "audio"
                        ? "Audio URL (SoundCloud, Spotify)"
                        : "Link URL"
                }
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white"
                disabled={!!uploadedStorageId}
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() =>
                editingId ? handleUpdate(editingId) : handleCreate()
              }
              disabled={saving || !canSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Add"}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Artifacts Grid */}
      {artifacts && artifacts.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {artifacts.map((artifact) => {
            const typeInfo = ARTIFACT_TYPES.find(
              (t) => t.value === artifact.type,
            );
            const mediaUrl = artifact.resolvedMediaUrl || artifact.mediaUrl;

            return (
              <div
                key={artifact._id}
                className="relative group aspect-square rounded-xl overflow-hidden"
              >
                {/* Background */}
                {artifact.type === "image" && mediaUrl ? (
                  <img
                    src={mediaUrl}
                    alt={artifact.title || ""}
                    className="w-full h-full object-cover"
                  />
                ) : artifact.type === "video" && mediaUrl ? (
                  <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                    <video
                      src={mediaUrl}
                      className="w-full h-full object-cover"
                      muted
                    />
                  </div>
                ) : (
                  <div
                    className={`w-full h-full bg-gradient-to-br ${typeInfo?.gradient || "from-gray-400 to-gray-500"}`}
                  />
                )}

                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* Content */}
                <div className="absolute inset-0 p-3 flex flex-col justify-between">
                  {/* Type icon */}
                  <div className="flex justify-between items-start">
                    <span className="text-2xl">{typeInfo?.icon}</span>
                    {/* Actions (show on hover) */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(artifact)}
                        className="w-7 h-7 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(artifact._id)}
                        className="w-7 h-7 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-red-500/80"
                      >
                        <svg
                          className="w-3.5 h-3.5"
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
                  </div>

                  {/* Title/Content */}
                  <div>
                    {artifact.title && (
                      <p className="text-white font-medium text-sm line-clamp-2">
                        {artifact.title}
                      </p>
                    )}
                    {artifact.type === "text" && artifact.content && (
                      <p className="text-white/80 text-xs line-clamp-3 mt-1">
                        {artifact.content}
                      </p>
                    )}
                    {!artifact.title && artifact.type !== "text" && (
                      <p className="text-white/60 text-xs capitalize">
                        {artifact.type}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : !showAddForm ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center">
            <span className="text-3xl">✨</span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No work added yet. Click "+ Add" to showcase your portfolio.
          </p>
        </div>
      ) : null}
    </div>
  );
}
