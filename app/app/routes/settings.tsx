import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

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
  const upsertProfile = useMutation(api.profiles.upsertProfile);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [jobFunctions, setJobFunctions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Load profile data when available
  useEffect(() => {
    if (profile && !initialized) {
      setName(profile.name || "");
      setBio(profile.bio || "");
      setLocation(profile.location || "");
      setJobFunctions(profile.jobFunctions || []);
      setInitialized(true);
    }
  }, [profile, initialized]);

  function toggleJobFunction(fn: string) {
    setJobFunctions((prev) =>
      prev.includes(fn) ? prev.filter((f) => f !== fn) : [...prev, fn],
    );
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
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Profile Settings
      </h1>

      <form onSubmit={handleSave} className="space-y-6">
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
          disabled={saving}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </form>

      {/* Wondering section */}
      <WonderingSection />

      {/* Invites section */}
      <InvitesSection />

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

function WonderingSection() {
  const wondering = useQuery(api.wonderings.getMyWondering);
  const createWondering = useMutation(api.wonderings.create);
  const updateWondering = useMutation(api.wonderings.update);
  const archiveWondering = useMutation(api.wonderings.archive);

  const [isEditing, setIsEditing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);

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
    await archiveWondering({ wonderingId: wondering._id });
    setPrompt("");
  }

  const isExpired = wondering?.expiresAt && Date.now() > wondering.expiresAt;

  return (
    <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        What are you wondering?
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Share a question you're pondering. Others can respond with their
        thoughts.
      </p>

      {wondering && !isEditing ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
          <p className="text-gray-900 dark:text-white mb-3">
            "{wondering.prompt}"
          </p>
          {wondering.expiresAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {isExpired
                ? "Expired - no longer accepting responses"
                : `Expires ${new Date(wondering.expiresAt).toLocaleDateString()}`}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Edit
            </button>
            <button
              onClick={handleArchive}
              className="text-sm text-gray-500 hover:text-gray-400"
            >
              Archive
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What's on your mind? e.g., 'How do you stay creative when you're burnt out?'"
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !prompt.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : wondering ? "Update" : "Post"}
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

function InvitesSection() {
  const invites = useQuery(api.invites.getMyInvites);
  const createInvite = useMutation(api.invites.create);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleCreateInvite() {
    setCreating(true);
    try {
      const code = await createInvite({});
      copyToClipboard(code);
    } finally {
      setCreating(false);
    }
  }

  function copyToClipboard(code: string) {
    const url = `${window.location.origin}/signup/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Invite Friends
        </h2>
        <button
          onClick={handleCreateInvite}
          disabled={creating}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create Invite"}
        </button>
      </div>

      {invites && invites.length > 0 ? (
        <div className="space-y-2">
          {invites.map((invite: Doc<"invites">) => (
            <div
              key={invite._id}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div>
                <code className="text-sm font-mono text-gray-700 dark:text-gray-300">
                  {invite.code}
                </code>
                {invite.usedBy && (
                  <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                    Used
                  </span>
                )}
              </div>
              {!invite.usedBy && (
                <button
                  onClick={() => copyToClipboard(invite.code)}
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  {copied === invite.code ? "Copied!" : "Copy Link"}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Create an invite to share with friends
        </p>
      )}
    </div>
  );
}
