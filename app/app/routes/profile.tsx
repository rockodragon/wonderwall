import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { toEmbedUrl } from "../lib/videoEmbed";
import type { Id } from "../../convex/_generated/dataModel";
import { EmbedStill, PlayBadge } from "../components/EmbedStill";
import { FavoriteButton } from "../components/FavoriteButton";
import { ShareButton } from "../components/ShareButton";
import { usePostHog } from "@posthog/react";
import { stageLabel, type Stage } from "../lib/stage";

// Matches listAffiliations's return shape (project-teams.md §4). Annotated
// explicitly here — not inferred from the query — so this section still
// typechecks while app/convex/garden/projectTeam.ts is still being written.
export default function Profile() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const myProfile = useQuery(api.profiles.getMyProfile);
  const profile = useQuery(
    api.profiles.getProfile,
    profileId ? { profileId: profileId as Id<"profiles"> } : "skip",
  );
  const inviteStats = useQuery(
    api.invites.getInviteStats,
    profile?.userId ? { userId: profile.userId } : "skip",
  );
  const recordView = useMutation(api.analytics.recordProfileView);
  // The profile→table link: which rooms this person is part of, so a visitor
  // can follow a person into a community instead of hitting a dead end.
  const theirTables = useQuery(
    api.garden.tables.listTablesForUser,
    profile?.userId ? { userId: profile.userId } : "skip",
  );
  // Projects this person leads or is accepted on (project-teams.md §7).
  const affiliations = useQuery(
    api.garden.projectTeam.listAffiliations,
    profile?._id ? { profileId: profile._id } : "skip",
  );
  const getOrCreateConversation = useMutation(
    api.messaging.getOrCreateConversation,
  );
  const posthog = usePostHog();
  const [startingConversation, setStartingConversation] = useState(false);

  // Check if viewing own profile
  const isOwnProfile = myProfile?._id === profileId;

  // Following is private to the pair, so the only signal shown is whether
  // this person follows the viewer. Skipped on the own profile.
  const followsMe = useQuery(
    api.follows.followsMe,
    profile?._id && !isOwnProfile ? { profileId: profile._id } : "skip",
  );
  const blockStatus = useQuery(
    api.messaging.isBlocked,
    profile?.userId && !isOwnProfile ? { userId: profile.userId } : "skip",
  );
  const blockUser = useMutation(api.messaging.blockUser);
  const unblockUser = useMutation(api.messaging.unblockUser);
  const profileNeedsSetup =
    isOwnProfile &&
    !profile?.bio?.trim() &&
    (!profile?.interests || profile.interests.length === 0) &&
    (!profile?.artifacts || profile.artifacts.length === 0);

  // Record profile view on mount
  useEffect(() => {
    if (profileId) {
      recordView({ profileId: profileId as Id<"profiles"> }).catch(() => {});
    }
  }, [profileId, recordView]);

  // Start a conversation with this user
  const handleStartConversation = async () => {
    if (!profile?.userId || startingConversation) return;
    setStartingConversation(true);
    try {
      const conversation = await getOrCreateConversation({
        otherUserId: profile.userId,
      });
      posthog?.capture("conversation_started", {
        profileId: profile._id,
        profileName: profile.name,
      });
      if (conversation) {
        navigate(`/messages/${conversation._id}`);
      }
    } catch (error) {
      console.error("Failed to start conversation:", error);
    } finally {
      setStartingConversation(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!profile?.userId) return;
    try {
      if (blockStatus?.blockedByMe) {
        await unblockUser({ userId: profile.userId });
        return;
      }
      if (
        !window.confirm(
          `Block ${profile.name}? They won't be able to message you.`,
        )
      ) {
        return;
      }
      await blockUser({ userId: profile.userId });
    } catch (error) {
      console.error("Failed to update block:", error);
    }
  };

  if (profile === undefined) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="flex items-start gap-6 mb-8">
            <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="flex-1">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Profile not found</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Profile header. Identity (name/role/location/network) sits on the
          left, all the ways to act on this person are grouped on the right
          — Follow/Message/Share stay one click away, Block moves into the
          kebab since it's rare and destructive, not a peer of the others. */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 mb-8">
        <div
          className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center overflow-hidden shrink-0"
          style={{ backgroundColor: "var(--app-hairline-raised)" }}
        >
          {profile.imageUrl ? (
            <img
              src={profile.imageUrl}
              alt={profile.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span
              className="text-2xl sm:text-3xl font-medium"
              style={{ color: "var(--app-text-dim)" }}
            >
              {profile.name.charAt(0)}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-4">
          {/* Identity column */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1
                className="text-xl sm:text-2xl font-bold"
                style={{ color: "var(--app-text)" }}
              >
                {profile.name}
              </h1>
              {followsMe === true && (
                <span className="text-xs" style={{ color: "var(--app-text-dim)" }}>
                  Follows you
                </span>
              )}
            </div>
            {profile.interests.length > 0 && (
              <p className="mt-1 text-sm sm:text-base" style={{ color: "var(--app-text-muted)" }}>
                {profile.interests.join(" • ")}
              </p>
            )}
            {profile.location && (
              <p className="mt-0.5 text-sm sm:text-base" style={{ color: "var(--app-text-dim)" }}>
                {profile.location}
              </p>
            )}
            {/* Invite stats — moved up next to identity instead of below the
                action row, so "who this person is" reads as one block. */}
            {inviteStats && (
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                {inviteStats.invitedBy && (
                  <Link
                    to={`/profile/${inviteStats.invitedBy.profileId}`}
                    className="transition-colors hover:text-[var(--app-accent-ink)]"
                    style={{ color: "var(--app-text-dim)" }}
                  >
                    Invited by{" "}
                    <span className="font-medium">
                      {inviteStats.invitedBy.name}
                    </span>
                  </Link>
                )}
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full">
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
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <span className="font-semibold">
                      {inviteStats.networkSize}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-500">
                      in network
                    </span>
                  </span>
                  {inviteStats.directInvitees > 0 && (
                    <span className="text-xs" style={{ color: "var(--app-text-dim)" }}>
                      ({inviteStats.directInvitees} invited
                      {inviteStats.downstreamCount > 0 &&
                        `, +${inviteStats.downstreamCount} downstream`}
                      )
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action cluster — Follow/Share always available (including on
              your own profile, matching prior behavior); Message and the
              Block kebab only make sense on someone else's. */}
          <div className="flex items-center gap-2 shrink-0">
            <FavoriteButton targetType="profile" targetId={profile._id} />
            {!isOwnProfile && (
              <button
                onClick={handleStartConversation}
                disabled={startingConversation}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50 hover:border-[var(--app-accent)]"
                style={{
                  backgroundColor: "var(--app-surface-raised)",
                  color: "var(--app-text)",
                  borderColor: "var(--app-hairline)",
                }}
              >
                {startingConversation ? (
                  <div
                    className="w-4 h-4 animate-spin rounded-full border-2 border-t-transparent"
                    style={{ borderColor: "var(--app-text)" }}
                  />
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                )}
                Message
              </button>
            )}
            <ShareButton type="profile" title={profile.name} size="sm" />
            {!isOwnProfile && blockStatus !== undefined && (
              <ProfileOverflowMenu
                blocked={blockStatus.blockedByMe}
                onToggleBlock={handleToggleBlock}
              />
            )}
          </div>
        </div>
      </div>

      {profile.bio && (
        <p
          className="-mt-4 mb-8 text-sm sm:text-base"
          style={{ color: "var(--app-text-muted)" }}
        >
          {profile.bio}
        </p>
      )}

      {/* Profile setup prompt for own incomplete profile */}
      {profileNeedsSetup && (
        <div
          className="mb-8 p-6 rounded-2xl border"
          style={{ backgroundColor: "var(--app-accent-wash)", borderColor: "var(--app-hairline)" }}
        >
          <div className="text-center">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "var(--app-accent)" }}
            >
              <svg
                className="w-8 h-8"
                style={{ color: "var(--garden-ink)" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--app-text)" }}>
              Complete your profile
            </h3>
            <p className="mb-4 max-w-md mx-auto" style={{ color: "var(--app-text-muted)" }}>
              Add a bio and share your work to help others discover and connect
              with you.
            </p>
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors"
              style={{ backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }}
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
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              Set Up Profile
            </Link>
          </div>
        </div>
      )}

      {/* Tables this person sits at — follow a person into their rooms. */}
      {theirTables && theirTables.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
            Tables
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {theirTables.map((t) => (
              <Link
                key={t.slug}
                to={`/tables/${t.slug}`}
                className="block p-4 rounded-lg border transition-colors hover:border-[var(--app-accent)]"
                style={{ borderColor: "var(--app-hairline)" }}
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="font-medium" style={{ color: "var(--app-text)" }}>
                    {t.name}
                  </span>
                  {t.format && (
                    <span className="text-xs uppercase tracking-wide" style={{ color: "var(--app-text-dim)" }}>
                      {t.format}
                    </span>
                  )}
                </div>
                {t.program && (
                  <div className="text-xs mt-1" style={{ color: "var(--app-text-dim)" }}>
                    {t.program}
                  </div>
                )}
                <div className="text-sm mt-2" style={{ color: "var(--app-text-muted)" }}>
                  {t.cadence ?? t.mode} · {t.roster} on the roster
                </div>
                <div className="text-sm mt-2" style={{ color: "var(--app-text-dim)" }}>
                  See the table →
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Projects this person leads or is on the team of. Above Work —
          project-teams.md §7 — hidden entirely when there are none.
          ≤ 3 projects → card grid with thumbnails. ≥ 4 → compact list. */}
      {affiliations && affiliations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
            Projects
          </h2>
          {affiliations.length <= 3 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {affiliations.map((a: any) => (
                <Link
                  key={a.projectId}
                  to={`/projects/${a.projectId}`}
                  className="group block rounded-xl border transition-colors hover:border-[var(--app-accent)] overflow-hidden"
                  style={{ borderColor: "var(--app-hairline)", backgroundColor: "var(--app-surface-raised)" }}
                >
                  <div
                    className="aspect-[16/10] relative overflow-hidden"
                    style={{ backgroundColor: "var(--app-hairline-raised)" }}
                  >
                    {a.imageUrl ? (
                      <img
                        src={a.imageUrl}
                        alt={a.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ backgroundColor: "var(--app-accent-wash)" }}
                      >
                        <span
                          className="text-2xl font-semibold"
                          style={{ color: "var(--app-accent-ink)" }}
                        >
                          {a.title?.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium line-clamp-1" style={{ color: "var(--app-text)" }}>
                      {a.title}
                    </h3>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm" style={{ color: "var(--app-text-muted)" }}>
                        {a.role || "Lead"}
                      </span>
                      <span className="text-xs" style={{ color: "var(--app-text-dim)" }}>
                        {stageLabel(a.stage as Stage)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-[var(--app-hairline)]">
              {affiliations.map((a: any) => (
                <div
                  key={a.projectId}
                  className="flex items-center gap-3 py-3"
                >
                  {a.imageUrl ? (
                    <img
                      src={a.imageUrl}
                      alt={a.title}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm font-semibold"
                      style={{ backgroundColor: "var(--app-accent-wash)", color: "var(--app-accent-ink)" }}
                    >
                      {a.title?.charAt(0)}
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-3 flex-wrap flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                      <Link
                        to={`/projects/${a.projectId}`}
                        className="font-medium hover:underline truncate"
                        style={{ color: "var(--app-text)" }}
                      >
                        {a.title}
                      </Link>
                      <span className="text-sm" style={{ color: "var(--app-text-muted)" }}>
                        {a.role || "Lead"}
                      </span>
                    </div>
                    <span className="text-sm shrink-0" style={{ color: "var(--app-text-dim)" }}>
                      {stageLabel(a.stage as Stage)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Artifacts grid */}
      {profile.artifacts && profile.artifacts.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
            Portfolio
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {profile.artifacts.map((artifact) => {
              // A pasted Instagram, TikTok, YouTube or Vimeo link
              // (convex/videoEmbed.ts). `linkUrl` is the stored link;
              // `mediaUrl` may be an uploaded file's storage URL instead.
              // An uploaded image with a video link keeps showing the image
              // (the branch below comes first); a reel with a cover shows
              // the cover from `ogImageUrl`.
              const embed = toEmbedUrl(artifact.linkUrl ?? artifact.mediaUrl ?? undefined);

              return (
                <Link
                  key={artifact._id}
                  to={`/works/${artifact._id}`}
                  className="aspect-square rounded-xl overflow-hidden block hover:ring-2 hover:ring-[var(--app-accent)] transition-all"
                  style={{ backgroundColor: "var(--app-hairline-raised)" }}
                >
                  {artifact.type === "image" && artifact.mediaUrl ? (
                    <div className="relative w-full h-full">
                      <img
                        src={artifact.mediaUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      {/* Link indicator for images that have an associated link */}
                      {artifact.linkUrl && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-white/90 dark:bg-black/70 rounded-full flex items-center justify-center">
                          <svg
                            className="w-3 h-3"
                            style={{ color: "var(--app-text-muted)" }}
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
                        </div>
                      )}
                    </div>
                  ) : embed ? (
                    <EmbedStill
                      embed={embed}
                      previewUrl={artifact.ogImageUrl}
                      title={artifact.title}
                      badgeSize="sm"
                    />
                  ) : artifact.type === "video" && artifact.mediaUrl ? (
                    // An uploaded video file — a static poster. The `#t=0.1`
                    // fragment makes Safari and Chrome paint a frame instead
                    // of black; the badge is the neutral one (Vimeo's colour)
                    // because this is the creative's own file, not a platform's.
                    <div
                      className="relative w-full h-full"
                      style={{ backgroundColor: "var(--garden-ink)" }}
                    >
                      <video
                        src={`${artifact.mediaUrl}#t=0.1`}
                        className="w-full h-full object-cover"
                        preload="metadata"
                        muted
                        playsInline
                      />
                      <PlayBadge kind="vimeo" size="sm" />
                    </div>
                  ) : artifact.type === "text" && artifact.content ? (
                    <div
                      className="p-4 text-sm line-clamp-6"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      {artifact.content}
                    </div>
                  ) : artifact.type === "link" && artifact.ogImageUrl ? (
                    <div
                      className="relative w-full h-full"
                      style={{ backgroundColor: "var(--app-hairline-raised)" }}
                    >
                      <img
                        src={artifact.ogImageUrl}
                        alt={artifact.title || "Link preview"}
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-2 right-2 w-6 h-6 bg-white/90 dark:bg-black/70 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3"
                          style={{ color: "var(--app-text-muted)" }}
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
                      </div>
                    </div>
                  ) : artifact.type === "link" ? (
                    <LinkFallbackCard
                      title={artifact.title}
                      url={artifact.mediaUrl}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[var(--garden-hairline-raised)] to-[var(--garden-ink)] flex items-end">
                      <div className="p-3">
                        {artifact.title ? (
                          <p className="text-white text-sm font-medium line-clamp-2">
                            {artifact.title}
                          </p>
                        ) : (
                          <p className="text-white/70 text-xs uppercase tracking-wide">
                            {artifact.type}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* Empty state for no artifacts - only show for other profiles */}
      {(!profile.artifacts || profile.artifacts.length === 0) &&
        !profileNeedsSetup && (
          <div className="text-center py-12" style={{ color: "var(--app-text-dim)" }}>
            <p>This profile doesn't have any content yet</p>
          </div>
        )}
    </div>
  );
}

// The overflow menu for rare/destructive profile actions — just Block today.
// Same fixed-backdrop dropdown pattern as projects.tsx's PostProjectMenu.
function ProfileOverflowMenu({
  blocked,
  onToggleBlock,
}: {
  blocked: boolean;
  onToggleBlock: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-[var(--app-hairline)]"
        style={{ color: "var(--app-text-dim)" }}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 6a2 2 0 100-4 2 2 0 000 4zM12 14a2 2 0 100-4 2 2 0 000 4zM12 22a2 2 0 100-4 2 2 0 000 4z" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-2 w-40 rounded-xl border overflow-hidden z-50"
            style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onToggleBlock();
              }}
              className="block w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-[var(--app-hairline)]"
              style={{ color: "var(--app-text)" }}
            >
              {blocked ? "Unblock" : "Block"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function LinkFallbackCard({
  title,
  url,
}: {
  title?: string | null;
  url?: string | null;
}) {
  // Extract domain from URL for display
  const domain = url
    ? (() => {
        try {
          const parsed = new URL(url);
          return parsed.hostname.replace("www.", "");
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="w-full h-full p-4 flex flex-col justify-between bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-900/30 dark:to-cyan-900/30">
      {/* Link icon */}
      <div className="flex justify-between items-start">
        <svg
          className="w-8 h-8 text-emerald-600 dark:text-emerald-400"
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
        <svg
          className="w-4 h-4 text-emerald-500/50 dark:text-emerald-400/50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </div>

      {/* Title and domain */}
      <div>
        {title && (
          <h3
            className="text-sm font-semibold line-clamp-2 mb-1"
            style={{ color: "var(--app-text)" }}
          >
            {title}
          </h3>
        )}
        {domain && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 truncate">
            {domain}
          </p>
        )}
      </div>
    </div>
  );
}
