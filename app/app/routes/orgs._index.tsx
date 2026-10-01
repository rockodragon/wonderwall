import { Navigate } from "react-router";

// /orgs — the directory lives as a tab on People (docs/features/
// organizations.md), so there is one place to browse, not two. This keeps
// the short address working.
export default function OrganizationsIndex() {
  return <Navigate to="/people?tab=orgs" replace />;
}
