import { useQuery, useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigate, Link } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { admin } from "../components/admin/adminStyles";
import {
  AdminFrame,
  AdminHeader,
  AdminLoading,
  AdminNotice,
} from "../components/admin/AdminUi";
import {
  DestinationCards,
  type Destination,
} from "../components/admin/DestinationCards";
import { MembersTable } from "../components/admin/MembersTable";
import { Binoculars, HourglassMedium, Megaphone, Plant, Receipt, Trophy } from "@phosphor-icons/react";

// Where each admin tool lives. A grid of cards, not a column of rows.
const DESTINATIONS: readonly Destination[] = [
  {
    to: "/admin/garden",
    title: "Garden Operator Console",
    icon: Plant,
    blurb:
      "Create tables, sessions, coverage codes, and record AP fund allocations.",
  },
  {
    to: "/admin/ledger",
    title: "Platform Ledger",
    icon: Receipt,
    blurb: "Fees, grant pools, host earnings, and platform seats.",
  },
  {
    to: "/admin/crawler",
    title: "Lead Crawler",
    icon: Binoculars,
    blurb: "Find and classify faith-aligned organizations.",
  },
  {
    to: "/admin/waitlist",
    title: "Waitlist",
    icon: HourglassMedium,
    blurb: "Review answers and approve people off the waitlist.",
  },
  {
    to: "/admin/updates",
    title: "Updates",
    icon: Megaphone,
    blurb: "Write the cards members see on their canvas.",
  },
  {
    to: "/admin/showcase",
    title: "Showcase jury",
    icon: Trophy,
    blurb: "Vote on open call applications.",
  },
];

export default function AdminPage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const navigate = useNavigate();
  const users = useQuery(api.admin.getAllUsersWithInvites);
  const debugData = useQuery(api.admin.debugInvites);
  const manuallyLinkInvite = useMutation(api.admin.manuallyLinkInvite);
  const deleteUser = useMutation(api.admin.deleteUser);
  const syncAdminGroup = useMutation(api.admin.syncAdminGroup);
  const backfillInviteFollows = useMutation(api.admin.backfillInviteFollows);

  const [linkingUser, setLinkingUser] = useState<string | null>(null);
  const [selectedInviter, setSelectedInviter] = useState<string>("");
  const [linkStatus, setLinkStatus] = useState<string>("");
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<string>("");
  const [syncingAdmins, setSyncingAdmins] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState<string>("");

  const handleBackfillInviteFollows = async () => {
    setBackfilling(true);
    setBackfillStatus("");
    try {
      const result = await backfillInviteFollows({});
      setBackfillStatus(
        `${result.pairs} inviter/invitee pairs · ${result.followsCreated} follows created`,
      );
    } catch (err) {
      setBackfillStatus(
        err instanceof Error ? err.message : "Failed to backfill follows",
      );
    } finally {
      setBackfilling(false);
    }
  };

  const handleSyncAdminGroup = async () => {
    setSyncingAdmins(true);
    setSyncStatus("");
    try {
      const result = await syncAdminGroup({});
      const parts = [
        `${result.grantedAdmin} granted admin`,
        `${result.codesGenerated} approval codes generated`,
      ];
      if (result.notFound.length > 0) {
        parts.push(
          `${result.notFound.length} not signed up yet (${result.notFound.join(", ")})`,
        );
      }
      setSyncStatus(parts.join(" · "));
    } catch (err) {
      setSyncStatus(
        err instanceof Error ? err.message : "Failed to sync admin group",
      );
    } finally {
      setSyncingAdmins(false);
    }
  };

  const handleLinkInvite = async (inviteeUserId: string) => {
    if (!selectedInviter) {
      setLinkStatus("Please select an inviter");
      return;
    }

    try {
      const result = await manuallyLinkInvite({
        inviteeUserId: inviteeUserId as any,
        inviterUserId: selectedInviter as any,
      });
      setLinkStatus(result.message);
      setLinkingUser(null);
      setSelectedInviter("");
      setTimeout(() => setLinkStatus(""), 3000);
    } catch (err) {
      setLinkStatus(
        err instanceof Error ? err.message : "Failed to link invite",
      );
    }
  };

  // Stable, so the members table can keep its column definitions between
  // renders.
  const handleDeleteUser = useCallback(
    async (userId: string, userName: string) => {
      const confirmed = window.confirm(
        `Are you sure you want to delete ${userName}? This will permanently delete their profile, works, wonderings, and all associated data.`,
      );

      if (!confirmed) return;

      setDeletingUser(userId);
      setDeleteStatus("");

      try {
        await deleteUser({ userId: userId as any });
        setDeleteStatus(`Successfully deleted ${userName}`);
        setTimeout(() => setDeleteStatus(""), 3000);
      } catch (err) {
        setDeleteStatus(
          err instanceof Error ? err.message : "Failed to delete user",
        );
      } finally {
        setDeletingUser(null);
      }
    },
    [deleteUser],
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, authLoading, navigate]);


  if (authLoading) {
    return <AdminLoading>Loading...</AdminLoading>;
  }

  if (!users) {
    return <AdminLoading>Loading users...</AdminLoading>;
  }

  const withoutInviter = users.filter((u) => !u.invitedBy);

  return (
    <AdminFrame>
      <AdminHeader title="Admin Dashboard" sub={`Total Users: ${users.length}`} />

      {deleteStatus && (
        <AdminNotice tone="ok" className="mb-6">
          {deleteStatus}
        </AdminNotice>
      )}

      <DestinationCards destinations={DESTINATIONS} />

      <div className="mt-8 space-y-6">
        <HiddenContent />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className={admin.panel}>
            <h2 className={admin.h2}>Admin Group</h2>
            <p className={`mt-1 ${admin.body}`}>
              The standing admin list lives in{" "}
              <code className={admin.code}>convex/adminEmails.ts</code>. New
              signups from those emails get admin access automatically; this
              backfills anyone who already had an account before their email
              was added, and generates each admin's fixed waitlist-approval
              code.
            </p>
            <button
              onClick={handleSyncAdminGroup}
              disabled={syncingAdmins}
              className={`mt-4 ${admin.btnSecondary}`}
            >
              {syncingAdmins ? "Syncing…" : "Sync Admin Group"}
            </button>
            {syncStatus && (
              <AdminNotice className="mt-4">{syncStatus}</AdminNotice>
            )}
          </div>

          <div className={admin.panel}>
            <h2 className={admin.h2}>Invite Follows</h2>
            <p className={`mt-1 ${admin.body}`}>
              Accepting an invite now makes the inviter and the new member
              follow each other. This does the same for invites accepted
              before that — run it once; a re-run re-follows anyone who has
              since unfollowed their inviter.
            </p>
            <button
              onClick={handleBackfillInviteFollows}
              disabled={backfilling}
              className={`mt-4 ${admin.btnSecondary}`}
            >
              {backfilling ? "Backfilling…" : "Backfill Invite Follows"}
            </button>
            {backfillStatus && (
              <AdminNotice className="mt-4">{backfillStatus}</AdminNotice>
            )}
          </div>
        </div>

        <MembersTable
          users={users}
          deletingUserId={deletingUser}
          onDelete={handleDeleteUser}
        />

        <div className={admin.panel}>
          <h2 className={`${admin.h2} mb-4`}>Statistics</h2>
          <dl className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat label="Total Users" value={users.length} />
            <Stat
              label="Users with Invites Used"
              value={users.filter((u) => u.inviteUsageCount > 0).length}
            />
            <Stat
              label="Total Invites Used"
              value={users.reduce((sum, u) => sum + u.inviteUsageCount, 0)}
            />
          </dl>
        </div>

        {/* Manual Invite Linking */}
        <div className={admin.panel}>
          <h2 className={`${admin.h2} mb-4`}>Manual Invite Linking</h2>
          {linkStatus && (
            <AdminNotice className="mb-4">{linkStatus}</AdminNotice>
          )}
          <div className="space-y-3">
            {withoutInviter.map((user) => (
              <div
                key={user._id}
                className={`${admin.inset} flex flex-wrap items-center gap-3 p-4`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[color:var(--app-text)]">
                    {user.name}
                  </div>
                  <div className={admin.meta}>{user.email}</div>
                </div>
                {linkingUser === user.userId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedInviter}
                      onChange={(e) => setSelectedInviter(e.target.value)}
                      aria-label={`Inviter for ${user.name}`}
                      className={`${admin.select} max-w-full`}
                    >
                      <option value="">Select inviter...</option>
                      {users
                        .filter((u) => u.userId !== user.userId)
                        .map((u) => (
                          <option key={u.userId} value={u.userId}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => handleLinkInvite(user.userId)}
                      className={admin.btnPrimary}
                    >
                      Link
                    </button>
                    <button
                      onClick={() => {
                        setLinkingUser(null);
                        setSelectedInviter("");
                      }}
                      className={admin.btnSecondary}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setLinkingUser(user.userId)}
                    className={admin.btnSecondary}
                  >
                    Set Inviter
                  </button>
                )}
              </div>
            ))}
            {withoutInviter.length === 0 && (
              <p className={`${admin.meta} py-4 text-center`}>
                All users have inviters linked
              </p>
            )}
          </div>
        </div>

        {/* Debug Section */}
        {debugData && (
          <div className="rounded-xl border border-amber-400/30 bg-[var(--app-surface-raised)] p-5 sm:p-6">
            <h2 className={`${admin.h2} mb-4`}>Debug: Invite Records</h2>
            <dl className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Stat label="Total Invites" value={debugData.totalInvites} />
              <Stat label="Used Invites" value={debugData.usedInvites} />
              <Stat label="Unused Invites" value={debugData.unusedInvites} />
            </dl>
            {debugData.invites.length > 0 && (
              <div className={`${admin.inset} max-h-96 overflow-y-auto p-4`}>
                <h3 className={`${admin.h3} mb-2`}>All Invite Records:</h3>
                <pre className="overflow-x-auto text-[12.5px] text-[color:var(--garden-body)]">
                  {JSON.stringify(debugData.invites, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminFrame>
  );
}

// One number and what it counts, set into the card like a hollow.
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${admin.inset} p-4`}>
      <dt className={admin.meta}>{label}</dt>
      <dd className="mt-1 text-3xl font-semibold text-[color:var(--app-text)]">
        {value}
      </dd>
    </div>
  );
}

// What admins have hidden with the ⋮ on a project or event page
// (components/AdminMenu.tsx, convex/moderation.ts). Hidden rows are off
// every browse list, so this is the way back to them: open one to delete
// it from its own ⋮, or unhide it here.
function HiddenContent() {
  const hidden = useQuery(api.moderation.listHidden);
  const setProjectHidden = useMutation(api.moderation.setProjectHidden);
  const setEventHidden = useMutation(api.moderation.setEventHidden);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!hidden) return null;

  const rows = [
    ...hidden.events.map((e) => ({
      key: e._id as string,
      kind: "Event",
      title: e.title,
      ownerName: e.ownerName,
      hiddenAt: e.hiddenAt,
      href: `/events/${e._id}`,
      unhide: () => setEventHidden({ eventId: e._id, hidden: false }),
    })),
    ...hidden.projects.map((p) => ({
      key: p._id as string,
      kind: "Project",
      title: p.title,
      ownerName: p.ownerName,
      hiddenAt: p.hiddenAt,
      href: `/projects/${p._id}`,
      unhide: () => setProjectHidden({ projectId: p._id, hidden: false }),
    })),
  ].sort((a, b) => (b.hiddenAt ?? 0) - (a.hiddenAt ?? 0));

  async function unhide(row: (typeof rows)[number]) {
    setBusyId(row.key);
    try {
      await row.unhide();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't unhide that.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={admin.panel}>
      <h2 className={admin.h2}>Hidden</h2>
      <p className={`mt-1 ${admin.body}`}>
        Projects and events hidden with the ⋮ on their page. Only their owner
        and admins can open them. Open one to delete it for good.
      </p>
      {rows.length === 0 ? (
        <p className={`mt-4 italic ${admin.meta}`}>Nothing hidden.</p>
      ) : (
        <ul className={`mt-4 ${admin.divide}`}>
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <span className="mr-2 text-[12.5px] font-semibold uppercase tracking-wide text-[color:var(--app-text-muted)]">
                  {row.kind}
                </span>
                <Link
                  to={row.href}
                  className={`text-[14px] font-medium text-[color:var(--app-text)] ${admin.link}`}
                >
                  {row.title}
                </Link>
                <div className={admin.hint}>
                  {row.ownerName}
                  {row.hiddenAt &&
                    ` · hidden ${new Date(row.hiddenAt).toLocaleDateString()}`}
                </div>
              </div>
              <button
                onClick={() => unhide(row)}
                disabled={busyId === row.key}
                className={admin.btnRowSecondary}
              >
                {busyId === row.key ? "Unhiding…" : "Unhide"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
