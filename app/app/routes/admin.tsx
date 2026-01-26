import { useQuery, useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigate, Link } from "react-router";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const navigate = useNavigate();
  const users = useQuery(api.admin.getAllUsersWithInvites);
  const debugData = useQuery(api.admin.debugInvites);
  const manuallyLinkInvite = useMutation(api.admin.manuallyLinkInvite);
  const deleteUser = useMutation(api.admin.deleteUser);

  const [linkingUser, setLinkingUser] = useState<string | null>(null);
  const [selectedInviter, setSelectedInviter] = useState<string>("");
  const [linkStatus, setLinkStatus] = useState<string>("");
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<string>("");

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

  const handleDeleteUser = async (userId: string, userName: string) => {
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
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!users) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Total Users: {users.length}
          </p>
          {deleteStatus && (
            <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-lg">
              {deleteStatus}
            </div>
          )}
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invited By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invite Slug
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invites Used
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/profile/${user._id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {user.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.invitedBy ? (
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.invitedBy.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {user.invitedBy.email}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 italic">
                          Direct signup
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {user.inviteSlug || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {user.inviteUsageCount}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleDeleteUser(user.userId, user.name)}
                        disabled={deletingUser === user.userId}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingUser === user.userId
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Statistics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-blue-600 font-medium">
                Total Users
              </div>
              <div className="text-3xl font-bold text-blue-900">
                {users.length}
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-green-600 font-medium">
                Users with Invites Used
              </div>
              <div className="text-3xl font-bold text-green-900">
                {users.filter((u) => u.inviteUsageCount > 0).length}
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-sm text-purple-600 font-medium">
                Total Invites Used
              </div>
              <div className="text-3xl font-bold text-purple-900">
                {users.reduce((sum, u) => sum + u.inviteUsageCount, 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Manual Invite Linking */}
        <div className="mt-8 bg-white shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Manual Invite Linking
          </h2>
          {linkStatus && (
            <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg">
              {linkStatus}
            </div>
          )}
          <div className="space-y-4">
            {users
              ?.filter((u) => !u.invitedBy)
              .map((user) => (
                <div
                  key={user._id}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{user.name}</div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                  {linkingUser === user.userId ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedInviter}
                        onChange={(e) => setSelectedInviter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Select inviter...</option>
                        {users
                          ?.filter((u) => u.userId !== user.userId)
                          .map((u) => (
                            <option key={u.userId} value={u.userId}>
                              {u.name} ({u.email})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => handleLinkInvite(user.userId)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                      >
                        Link
                      </button>
                      <button
                        onClick={() => {
                          setLinkingUser(null);
                          setSelectedInviter("");
                        }}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setLinkingUser(user.userId)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                    >
                      Set Inviter
                    </button>
                  )}
                </div>
              ))}
            {users?.filter((u) => !u.invitedBy).length === 0 && (
              <p className="text-gray-500 text-center py-4">
                All users have inviters linked
              </p>
            )}
          </div>
        </div>

        {/* Debug Section */}
        {debugData && (
          <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Debug: Invite Records
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white rounded-lg p-4">
                <div className="text-sm text-gray-600">Total Invites</div>
                <div className="text-2xl font-bold text-gray-900">
                  {debugData.totalInvites}
                </div>
              </div>
              <div className="bg-white rounded-lg p-4">
                <div className="text-sm text-gray-600">Used Invites</div>
                <div className="text-2xl font-bold text-green-600">
                  {debugData.usedInvites}
                </div>
              </div>
              <div className="bg-white rounded-lg p-4">
                <div className="text-sm text-gray-600">Unused Invites</div>
                <div className="text-2xl font-bold text-gray-600">
                  {debugData.unusedInvites}
                </div>
              </div>
            </div>
            {debugData.invites.length > 0 && (
              <div className="bg-white rounded-lg p-4 max-h-96 overflow-y-auto">
                <h3 className="font-semibold mb-2">All Invite Records:</h3>
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(debugData.invites, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
