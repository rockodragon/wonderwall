import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
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
