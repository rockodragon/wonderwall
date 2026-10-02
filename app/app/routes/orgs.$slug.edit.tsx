// /orgs/:slug/edit — an organization's admins edit its page and its people
// (docs/features/organizations.md). The page itself is public; this one
// checks viewer.canEdit, which the server derives (an org admin or a platform
// admin), and every mutation re-checks it.

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ORG_CATEGORIES, ORG_LIMITS, yearsLabel } from "../../convex/organizationRules";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { OrgLogo } from "../components/OrgLogo";
import { useLocationField } from "../lib/useLocationField";
import { PAGE_WIDTH } from "../lib/pageWidth";

const inputClass =
  "w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[var(--app-accent)] focus:border-transparent placeholder:text-[var(--app-text-dim)]";
const inputStyle = {
  borderColor: "var(--app-hairline)",
  backgroundColor: "var(--app-surface-raised)",
  color: "var(--app-text)",
};
const labelClass = "block text-sm font-medium mb-2";
const labelStyle = { color: "var(--app-text-muted)" };
const cardClass = "rounded-2xl border p-4 sm:p-5";
const cardStyle = { borderColor: "var(--app-hairline)", backgroundColor: "var(--app-surface)" };

function reason(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | string | undefined;
    if (typeof data === "object" && data?.reason) return data.reason;
    if (typeof data === "string" && data) return data;
  }
  return "Something went wrong.";
}

export default function OrgEdit() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isLoading: authLoading } = useConvexAuth();
  const org = useQuery(api.organizations.getBySlug, slug ? { slug } : "skip");

  const updateOrg = useMutation(api.organizations.update);
  const setLogo = useMutation(api.organizations.setLogo);
  const setAdmin = useMutation(api.organizations.setAdmin);
  const removePerson = useMutation(api.organizations.removePerson);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [tagline, setTagline] = useState("");
  const [mission, setMission] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [x, setX] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const location = useLocationField();
  const [initialized, setInitialized] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [peopleError, setPeopleError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (org && !initialized) {
      setName(org.name);
      setCategory(org.category ?? "");
      setTagline(org.tagline ?? "");
      setMission(org.mission ?? "");
      setWebsiteUrl(org.websiteUrl ?? "");
      setInstagram(org.instagram ?? "");
      setX(org.x ?? "");
      setLinkedin(org.linkedin ? `linkedin.com/${org.linkedin}` : "");
      location.hydrate({
        location: org.location ?? undefined,
        locationType: org.locationType ?? undefined,
        address: org.address ?? undefined,
        coordinates: org.coordinates ?? undefined,
        placeId: org.placeId ?? undefined,
      });
      setInitialized(true);
    }
    // location.hydrate is stable (useCallback with no deps); omitting it keeps
    // this a once-on-load init, as in settings.tsx's ProfileEditForm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, initialized]);

  if (org === undefined || authLoading) return <Shell><Skeleton /></Shell>;

  if (org === null) {
    return (
      <Shell>
        <Notice text="Organization not found." linkTo="/people?tab=orgs" linkLabel="All organizations" />
      </Shell>
    );
  }

  if (!org.viewer.signedIn) {
    return (
      <Shell>
        <Notice text="Sign in to edit this organization." linkTo="/login" linkLabel="Sign in" />
      </Shell>
    );
  }

  if (!org.viewer.canEdit) {
    return (
      <Shell>
        <Notice
          text="Only this organization's admins can edit it."
          linkTo={`/orgs/${org.slug}`}
          linkLabel={`Back to ${org.name}`}
        />
      </Shell>
    );
  }

  const pageUrl = `/orgs/${org.slug}`;
  const everyone = [
    ...org.people.map((p) => ({ ...p, former: false })),
    ...org.alumni.map((p) => ({ ...p, former: true })),
  ];

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !org) return;
    setLogoError("");
    if (!file.type.startsWith("image/")) {
      setLogoError("Pick an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("Image must be under 5MB.");
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
      await setLogo({ organizationId: org._id, storageId });
    } catch (err) {
      console.error("Logo upload error:", err);
      setLogoError(err instanceof ConvexError ? reason(err) : "Couldn't upload that. Try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    if (!org || !window.confirm("Remove the logo?")) return;
    setLogoError("");
    try {
      await setLogo({ organizationId: org._id });
    } catch (err) {
      setLogoError(reason(err));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!org || !name.trim() || saving) return;
    setError("");
    setSaving(true);
    try {
      const saved = await updateOrg({
        organizationId: org._id,
        name: name.trim(),
        category,
        tagline: tagline.trim(),
        mission: mission.trim(),
        websiteUrl: websiteUrl.trim(),
        instagram: instagram.trim(),
        x: x.trim(),
        linkedin: linkedin.trim(),
        ...location.toArgs(),
      });
      navigate(`/orgs/${saved.slug}`);
    } catch (err) {
      setError(reason(err));
      setSaving(false);
    }
  }

  async function handleAdmin(profileId: Id<"profiles">, isAdmin: boolean) {
    if (!org) return;
    setPeopleError("");
    setBusyProfileId(profileId);
    try {
      await setAdmin({ organizationId: org._id, profileId, isAdmin });
    } catch (err) {
      setPeopleError(reason(err));
    } finally {
      setBusyProfileId(null);
    }
  }

  async function handleRemove(profileId: Id<"profiles">, personName: string) {
    if (!org || !window.confirm(`Remove ${personName} from ${org.name}?`)) return;
    setPeopleError("");
    setBusyProfileId(profileId);
    try {
      await removePerson({ organizationId: org._id, profileId });
    } catch (err) {
      setPeopleError(reason(err));
    } finally {
      setBusyProfileId(null);
    }
  }

  return (
    <Shell>
      <Link
        to={pageUrl}
        className="inline-block text-sm font-medium hover:opacity-80"
        style={{ color: "var(--app-text-muted)" }}
      >
        ← {org.name}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold" style={{ color: "var(--app-text)" }}>
        Edit organization
      </h1>

      <form onSubmit={handleSave} className={`${cardClass} space-y-6`} style={cardStyle}>
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <OrgLogo name={name || org.name} logoUrl={org.logoUrl} size="lg" />
            {uploading && (
              <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }}
              >
                {uploading ? "Uploading..." : org.logoUrl ? "Change logo" : "Upload logo"}
              </button>
              {org.logoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={uploading}
                  className="px-3 py-2 text-sm font-medium hover:underline disabled:opacity-50"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Remove
                </button>
              )}
            </div>
            {logoError && (
              <p className="mt-2 text-sm" style={{ color: "var(--app-text)" }} role="alert">
                {logoError}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="org-name" className={labelClass} style={labelStyle}>
            Name
          </label>
          <input
            id="org-name"
            type="text"
            value={name}
            required
            maxLength={ORG_LIMITS.name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="org-category" className={labelClass} style={labelStyle}>
            Category
          </label>
          <select
            id="org-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            <option value="">—</option>
            {ORG_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="org-tagline" className={labelClass} style={labelStyle}>
            Tagline
          </label>
          <input
            id="org-tagline"
            type="text"
            value={tagline}
            maxLength={ORG_LIMITS.tagline}
            placeholder="One line about what you do"
            onChange={(e) => setTagline(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="org-about" className={labelClass} style={labelStyle}>
            About
          </label>
          <textarea
            id="org-about"
            value={mission}
            rows={6}
            maxLength={ORG_LIMITS.mission}
            placeholder="Your mission, in your words"
            onChange={(e) => setMission(e.target.value)}
            className={`${inputClass} resize-y`}
            style={inputStyle}
          />
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>
            Location
          </label>
          <LocationAutocomplete
            value={location.value}
            onChange={location.onChange}
            onSelect={(suggestion) => location.onSelect(suggestion)}
            placeholder="Search for an address or city"
          />
        </div>

        <div>
          <label htmlFor="org-website" className={labelClass} style={labelStyle}>
            Website
          </label>
          <input
            id="org-website"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            value={websiteUrl}
            maxLength={200}
            placeholder="abidingpractice.org"
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="org-instagram" className={labelClass} style={labelStyle}>
            Instagram
          </label>
          <input
            id="org-instagram"
            type="text"
            autoCapitalize="none"
            value={instagram}
            maxLength={100}
            placeholder="@handle"
            onChange={(e) => setInstagram(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="org-x" className={labelClass} style={labelStyle}>
            X
          </label>
          <input
            id="org-x"
            type="text"
            autoCapitalize="none"
            value={x}
            maxLength={100}
            placeholder="@handle"
            onChange={(e) => setX(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="org-linkedin" className={labelClass} style={labelStyle}>
            LinkedIn
          </label>
          <input
            id="org-linkedin"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            value={linkedin}
            maxLength={200}
            placeholder="linkedin.com/company/…"
            onChange={(e) => setLinkedin(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--app-text)" }} role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <Link
            to={pageUrl}
            className="text-sm font-medium hover:underline"
            style={{ color: "var(--app-text-muted)" }}
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* People */}
      <section className={`${cardClass} mt-6`} style={cardStyle}>
        <h2 className="text-lg font-semibold" style={{ color: "var(--app-text)" }}>
          People
        </h2>

        {everyone.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
            No one yet.
          </p>
        ) : (
          <ul className="mt-2">
            {everyone.map((p, i) => {
              const busy = busyProfileId === p.profileId;
              const detail = [p.title, p.former ? yearsLabel(p.startYear, p.endYear) || "Former" : ""]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={p.profileId}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-3 ${i > 0 ? "border-t" : ""}`}
                  style={{ borderColor: "var(--app-hairline)" }}
                >
                  <div className="flex items-center gap-3 min-w-[12rem] flex-1">
                    <Avatar name={p.name} imageUrl={p.imageUrl} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--app-text)" }}>
                        {p.name}
                      </div>
                      {detail && (
                        <div className="text-sm truncate" style={{ color: "var(--app-text-muted)" }}>
                          {detail}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pl-[3.25rem] sm:pl-0">
                    <label
                      className="inline-flex items-center gap-2 min-h-9 text-sm cursor-pointer"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      <input
                        type="checkbox"
                        checked={p.isAdmin}
                        disabled={busy}
                        onChange={(e) => handleAdmin(p.profileId, e.target.checked)}
                        className="h-4 w-4"
                        style={{ accentColor: "var(--app-accent)" }}
                      />
                      Admin
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemove(p.profileId, p.name)}
                      disabled={busy}
                      className="min-h-9 text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <AddPerson
          organizationId={org._id}
          listed={new Set(everyone.map((p) => String(p.profileId)))}
          onError={setPeopleError}
        />

        {peopleError && (
          <p className="mt-3 text-sm" style={{ color: "var(--app-text)" }} role="alert">
            {peopleError}
          </p>
        )}
      </section>
    </Shell>
  );
}

// Admins list people themselves (docs/features/organizations.md): search
// the directory, pick someone, and they show right away — the person is
// told and can change or remove it in Settings.
function AddPerson({
  organizationId,
  listed,
  onError,
}: {
  organizationId: Id<"organizations">;
  listed: Set<string>;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const addPerson = useMutation(api.organizations.addPerson);
  const typed = query.trim();
  const results = useQuery(api.profiles.search, typed.length >= 2 ? { query: typed } : "skip");
  const matches = (results ?? []).filter((r) => !listed.has(String(r._id))).slice(0, 6);

  async function add(profileId: Id<"profiles">) {
    setBusy(true);
    onError("");
    try {
      await addPerson({ organizationId, profileId });
      setQuery("");
    } catch (err) {
      onError(reason(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative mt-4">
      <input
        type="text"
        value={query}
        disabled={busy}
        placeholder="Add a person"
        onChange={(e) => setQuery(e.target.value)}
        className={inputClass}
        style={inputStyle}
      />
      {typed.length >= 2 && results !== undefined && (
        <ul
          className="absolute z-20 left-0 right-0 mt-1 rounded-lg border shadow-lg overflow-hidden"
          style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-sm" style={{ color: "var(--app-text-dim)" }}>
              No one by that name.
            </li>
          ) : (
            matches.map((r) => (
              <li key={r._id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => add(r._id as Id<"profiles">)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--app-hairline)]"
                >
                  <Avatar name={r.name} imageUrl={r.imageUrl ?? null} />
                  <span className="text-sm font-medium truncate" style={{ color: "var(--app-text)" }}>
                    {r.name}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className={`p-4 sm:p-6 ${PAGE_WIDTH.reading} mx-auto`}>{children}</div>;
}

function Notice({ text, linkTo, linkLabel }: { text: string; linkTo: string; linkLabel: string }) {
  return (
    <div className={`${cardClass} text-center py-10`} style={cardStyle}>
      <p className="text-base" style={{ color: "var(--app-text)" }}>
        {text}
      </p>
      <Link
        to={linkTo}
        className="mt-3 inline-block text-sm font-medium hover:underline"
        style={{ color: "var(--app-accent-ink)" }}
      >
        {linkLabel}
      </Link>
    </div>
  );
}

function Skeleton() {
  const bar = { backgroundColor: "var(--app-hairline-raised)" };
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-4 w-32 rounded" style={bar} />
      <div className="mt-4 mb-6 h-8 w-56 rounded" style={bar} />
      <div className={`${cardClass} space-y-6`} style={cardStyle}>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl" style={bar} />
          <div className="h-9 w-32 rounded-lg" style={bar} />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="mb-2 h-4 w-20 rounded" style={bar} />
            <div className="h-10 w-full rounded-lg" style={bar} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Avatar({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  return (
    <div
      className="w-10 h-10 shrink-0 rounded-full overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: "var(--app-hairline-raised)" }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </div>
  );
}
