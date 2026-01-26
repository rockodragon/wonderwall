import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import confetti from "canvas-confetti";

const WORK_TYPES = [
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "video", label: "Video", icon: VideoIcon },
  { value: "audio", label: "Audio", icon: AudioIcon },
  { value: "link", label: "Link", icon: LinkIcon },
  { value: "text", label: "Text", icon: TextIcon },
];

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function CreateWorkComposer({ onCreated }: { onCreated?: () => void }) {
  const posthog = usePostHog();
  const profile = useQuery(api.profiles.getMyProfile);
  const artifacts = useQuery(api.artifacts.getMyArtifacts);
  const createArtifact = useMutation(api.artifacts.create);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [isExpanded, setIsExpanded] = useState(false);
  const [type, setType] = useState("link");
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
  const inputRef = useRef<HTMLInputElement>(null);

  if (!profile) return null;

  function resetForm() {
    setType("link");
    setTitle("");
    setContent("");
    setMediaUrl("");
    setUploadedStorageId(null);
    setUploadedPreview(null);
    setIsExpanded(false);
  }

  function handleExpand() {
    setIsExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File must be less than 5MB");
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const isAudio = file.type.startsWith("audio/");

    if (!isImage && !isVideo && !isAudio) {
      alert("Please select an image, video, or audio file");
      return;
    }

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

      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => setUploadedPreview(e.target?.result as string);
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload file. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit() {
    if (type === "text" && !content.trim()) return;
    if (type !== "text" && !mediaUrl.trim() && !uploadedStorageId) return;
    if (type === "link" && !title.trim()) return;

    const isFirstWork = !artifacts || artifacts.length === 0;

    setSaving(true);
    try {
      await createArtifact({
        type,
        title: title.trim() || undefined,
        content: type === "text" ? content.trim() : undefined,
        mediaUrl:
          type !== "text" && !uploadedStorageId
            ? normalizeUrl(mediaUrl)
            : undefined,
        mediaStorageId: uploadedStorageId
          ? (uploadedStorageId as any)
          : undefined,
      });

      if (isFirstWork) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      }

      // Track work created
      posthog?.capture("work_created", {
        work_type: type,
        has_title: !!title.trim(),
        is_first_work: isFirstWork,
        has_uploaded_file: !!uploadedStorageId,
      });

      resetForm();
      onCreated?.();
    } finally {
      setSaving(false);
    }
  }

  const hasMedia = mediaUrl.trim().length > 0 || uploadedStorageId;
  const hasTitle = title.trim().length > 0;
  const canSubmit =
    type === "text"
      ? content.trim().length > 0
      : type === "link"
        ? hasMedia && hasTitle
        : hasMedia;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300">
      {/* Collapsed State */}
      {!isExpanded ? (
        <button
          onClick={handleExpand}
          className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
        >
          {profile.imageUrl ? (
            <img
              src={profile.imageUrl}
              alt={profile.name}
              className="w-11 h-11 rounded-full object-cover ring-2 ring-gray-100 dark:ring-gray-700"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg ring-2 ring-gray-100 dark:ring-gray-700">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 text-sm">
            Share something you've made...
          </div>
        </button>
      ) : (
        /* Expanded State */
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {profile.imageUrl ? (
                <img
                  src={profile.imageUrl}
                  alt={profile.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">
                  {profile.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Sharing to community
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Type Selector Pills */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
            {WORK_TYPES.map((t) => {
              const Icon = t.icon;
              const isSelected = type === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-purple-500/25"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Title Input */}
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              type === "link" ? "Give it a title..." : "Add a title (optional)"
            }
            className="w-full px-0 py-2 text-lg font-medium text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 bg-transparent border-0 focus:ring-0 focus:outline-none"
          />

          {/* Content Area */}
          {type === "text" ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={4}
              className="w-full px-0 py-2 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 bg-transparent border-0 focus:ring-0 focus:outline-none resize-none"
            />
          ) : (
            <div className="mt-2">
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
                <div className="relative rounded-xl overflow-hidden mb-3">
                  {uploadedPreview ? (
                    <img
                      src={uploadedPreview}
                      alt="Preview"
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-20 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span className="text-sm font-medium">
                          File uploaded
                        </span>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setUploadedStorageId(null);
                      setUploadedPreview(null);
                    }}
                    className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ) : !mediaUrl ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-12 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl text-gray-400 dark:text-gray-500 hover:border-purple-400 hover:text-purple-500 dark:hover:border-purple-500 dark:hover:text-purple-400 transition-all group"
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-purple-500" />
                      <span className="text-sm">Uploading...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 flex items-center justify-center transition-colors">
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <span className="text-sm">
                        Drop a file or click to upload
                      </span>
                      <span className="text-xs text-gray-400">Max 5MB</span>
                    </div>
                  )}
                </button>
              ) : null}

              {/* URL Input */}
              {!uploadedStorageId && (
                <div className="relative mt-3">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <LinkIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder={
                      type === "link"
                        ? "Paste a link..."
                        : type === "video"
                          ? "Or paste a YouTube URL..."
                          : "Or paste a URL..."
                    }
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                title="Upload file"
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
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
              className={`px-6 py-2.5 rounded-xl font-medium text-sm transition-all ${
                canSubmit && !saving
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              }`}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  Posting...
                </span>
              ) : (
                "Post"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function ImageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function AudioIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
      />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  );
}

function TextIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}
