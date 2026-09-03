// /admin/waitlist — review "move up the list" answers and approve people
// off the waitlist. Approving sends the applicant an email with the
// approving admin's fixed short code (profiles.adminCode); they sign up
// at /signup/:code exactly like a peer invite (convex/invites.ts's
// findInviterProfile resolves either kind of code). See convex/waitlist.ts
// (listForAdmin, approveEntry) and convex/helpers.ts (ensureAdminCode).
//
// Admin detection mirrors admin.garden.tsx: the client-checkable
// profile.isAdmin flag, not admin.tsx's server-side requireAdmin() throw,
// so an unauthenticated or non-admin visitor gets a message instead of a
// stuck loading state.

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const meta: MetaFunction = () => {
  return [{ title: "Waitlist Admin | creatives.exchange" }];
};

const ROLE_LABEL: Record<string, string> = {
  creative: "Creative",
  patron: "Patron",
  partner: "Partner",
};

export default function AdminWaitlistPage() {
  const profile = useQuery(api.profiles.getMyProfile);
  const entries = useQuery(api.waitlist.listForAdmin);
  const approveEntry = useMutation(api.waitlist.approveEntry);

  const [approving, setApproving] = useState<Id<"waitlist"> | null>(null);
  const [error, setError] = useState<string>("");

  if (profile === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Checking access…</div>
      </div>
    );
  }

  if (!profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-500">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  const handleApprove = async (id: Id<"waitlist">) => {
    setApproving(id);
    setError("");
    try {
      await approveEntry({ waitlistId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setApproving(null);
    }
  };

  const approvedCount = entries?.filter((e) => e.approved).length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link
              to="/admin"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              ← Admin Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mt-1">
              Waitlist
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {entries === undefined
                ? "Loading…"
                : `${entries.length} on the list · ${approvedCount} approved`}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {entries === undefined ? (
          <div className="text-gray-500">Loading waitlist…</div>
        ) : entries.length === 0 ? (
          <div className="bg-white shadow-md rounded-lg p-8 text-center text-gray-500">
            Nobody on the waitlist yet.
          </div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Signals
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Heard via
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entries.map((entry) => (
                    <tr key={entry._id} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {entry.rank}
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900 max-w-[220px] break-words">
                        {entry.email}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                        {entry.role ? ROLE_LABEL[entry.role] : "—"}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 max-w-[280px]">
                        {entry.projectDescription && (
                          <div className="text-gray-900">
                            {entry.projectDescription}
                          </div>
                        )}
                        {entry.projectUrl && (
                          <a
                            href={entry.projectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline break-all"
                          >
                            {entry.projectUrl}
                          </a>
                        )}
                        {entry.portfolioUrl &&
                          entry.portfolioUrl !== entry.projectUrl && (
                            <a
                              href={entry.portfolioUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-blue-600 hover:underline break-all"
                            >
                              {entry.portfolioUrl}
                            </a>
                          )}
                        {!entry.projectDescription &&
                          !entry.projectUrl &&
                          !entry.portfolioUrl && (
                            <span className="text-gray-400 italic">—</span>
                          )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <div className="flex flex-col gap-1">
                          {entry.hasLaunchProject && (
                            <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                              Ready to launch
                            </span>
                          )}
                          {entry.interestedInHosting && (
                            <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                              Wants to host
                            </span>
                          )}
                          {!entry.hasLaunchProject &&
                            !entry.interestedInHosting && (
                              <span className="text-gray-400">—</span>
                            )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 max-w-[160px] break-words">
                        {entry.hearAboutUsOther ||
                          entry.hearAboutUs || (
                            <span className="text-gray-400">—</span>
                          )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {entry.approved ? (
                          <div className="text-sm">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                              Approved
                            </span>
                            <div className="mt-1 text-xs text-gray-500">
                              by {entry.approvedByName}
                              {entry.approvedAt &&
                                ` · ${new Date(entry.approvedAt).toLocaleDateString()}`}
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleApprove(entry._id)}
                            disabled={approving === entry._id}
                            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {approving === entry._id
                              ? "Approving…"
                              : "Approve"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
