import { usePostHog } from "@posthog/react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";
import { LocationAutocomplete, LocationVerifiedHint } from "./LocationAutocomplete";
import { useLocationField } from "../lib/useLocationField";
import { EVENT_TAGS } from "../constants/eventTags";
import { CommunityPicker } from "./CommunityPicker";
import { useCommunityContext } from "./CommunityFilter";
import {
  TicketTierEditor,
  draftsToTiers,
  type TicketTierDraft,
} from "./TicketTierEditor";
import { normalizeUrl } from "../lib/richText";
import {
  EMBED_PROVIDER_LABEL,
  type EmbedKind,
  isTikTokShortLink,
  toEmbedUrl,
} from "../lib/videoEmbed";

// ——— Pasted media link (docs/features/creator-media-cross-post.md) ———
//
// An organizer can paste an Instagram, TikTok, YouTube or Vimeo link instead
// of uploading a cover image: the event page plays it in the platform's own
// player, cards show a still. The field and the rule for what it accepts
// live here and are shared with the edit form in routes/event.tsx, so the two
// forms can't drift on copy or on what counts as playable.

export type MediaLinkState =
  | { status: "empty" }
  | { status: "ok"; url: string; kind: EmbedKind }
  | { status: "invalid" };

/** What the field holds right now. A bare host gets https:// so the check
    judges what was meant. A TikTok "Copy link" from the app
    (vm.tiktok.com/…) can't be read client-side, but the server follows it
    to the permalink (convex/linkPreview.ts), so it counts as TikTok. */
export function readMediaLink(value: string): MediaLinkState {
  const url = normalizeUrl(value);
  if (!url) return { status: "empty" };
  const embed = toEmbedUrl(url);
  if (embed) return { status: "ok", url: embed.canonicalUrl, kind: embed.kind };
  if (isTikTokShortLink(url)) return { status: "ok", url, kind: "tiktok" };
  return { status: "invalid" };
}

export const MEDIA_LINK_INVALID =
  "That isn't a link we can play. Paste an Instagram, TikTok, YouTube or Vimeo link, or upload an image.";

export function EventMediaLinkField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const link = readMediaLink(value);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Video or reel link (Instagram, TikTok, YouTube or Vimeo)
      </label>
      {/* type="text", not "url": the browser's own url check would refuse a
          bare host the normalizer is about to accept. */}
      <input
        type="text"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://www.instagram.com/reel/…"
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
      />
      {link.status === "ok" && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {EMBED_PROVIDER_LABEL[link.kind]} video. It plays here on your event page; cards show a
          still.
        </p>
      )}
      {link.status === "invalid" && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{MEDIA_LINK_INVALID}</p>
      )}
    </div>
  );
}

export function CreateEventModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const createEvent = useMutation(api.events.create);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");
  const [ticketTiers, setTicketTiers] = useState<TicketTierDraft[]>([]);
  const location = useLocationField();
  const [tags, setTags] = useState<string[]>([]);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [hostOrgId, setHostOrgId] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Pre-fill from the sidebar switcher's current context (community-ux.md
  // §2/§6) — still changeable to "No community — just me" via CommunityPicker.
  const { selected: switcherCommunitySlug, communities: myCommunities } = useCommunityContext();
  const defaultHostOrgId = myCommunities.find((c) => c.slug === switcherCommunitySlug)?._id;

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim() || !description.trim() || !date || !time) {
      setError("Please fill in all required fields");
      return;
    }

    const datetime = new Date(`${date}T${time}`).getTime();
    if (datetime < Date.now()) {
      setError("Event date must be in the future");
      return;
    }

    // Optional end time — same day as the start; must be after it.
    let endTime: number | undefined;
    if (endTimeStr) {
      endTime = new Date(`${date}T${endTimeStr}`).getTime();
      if (endTime <= datetime) {
        setError("End time must be after the start time");
        return;
      }
    }

    const { tiers, error: tiersError } = draftsToTiers(ticketTiers);
    if (tiersError) {
      setError(tiersError);
      return;
    }

    // A link we can't play is never submitted — the field already says so
    // inline; this repeats it where a failed submit is looked for.
    const mediaLink = readMediaLink(mediaUrl);
    if (mediaLink.status === "invalid") {
      setError(MEDIA_LINK_INVALID);
      return;
    }

    setSaving(true);
    try {
      const eventId = await createEvent({
        title,
        description,
        datetime,
        endTime,
        ticketTiers: tiers,
        ...location.toArgs(),
        tags,
        requiresApproval,
        hostOrgId: hostOrgId ? (hostOrgId as any) : undefined,
        mediaUrl: mediaLink.status === "ok" ? mediaLink.url : undefined,
      });

      // Track event created
      posthog?.capture("event_created", {
        has_location: !!location.value,
        location_type: location.selected?.locationType || "manual",
        has_coordinates: !!location.selected?.coordinates,
        tags_count: tags.length,
        requires_approval: requiresApproval,
        media_provider: mediaLink.status === "ok" ? mediaLink.kind : null,
      });

      navigate(`/events/${eventId}`);
    } catch (err) {
      setError("Failed to create event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Create Event
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this event about?"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start time *
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End time
                </label>
                <input
                  type="time"
                  value={endTimeStr}
                  onChange={(e) => setEndTimeStr(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Location
              </label>
              <LocationAutocomplete
                value={location.value}
                onChange={location.onChange}
                onSelect={location.onSelect}
                placeholder="Search by venue name or street address, type 'Online', or 'TBD'"
              />
              <LocationVerifiedHint value={location.value} selected={location.selected} />
            </div>

            <EventMediaLinkField value={mediaUrl} onChange={setMediaUrl} />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Ticket tiers
              </label>
              <TicketTierEditor tiers={ticketTiers} onChange={setTicketTiers} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tags
              </label>
              <div className="flex flex-wrap gap-2">
                {EVENT_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      tags.includes(tag)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <CommunityPicker
              value={hostOrgId}
              onChange={setHostOrgId}
              variant="tailwind"
              defaultHostOrgId={defaultHostOrgId}
            />

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="approval"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <label
                htmlFor="approval"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                Require approval for attendees
              </label>
            </div>

            <div className="flex gap-3 pt-4">
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
                {saving ? "Creating..." : "Create Event"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
