import { Navigate } from "react-router";

// /garden — The Garden's page is its community page, whose words come from
// host tools (2026-10-02). This used to be a separate hub with its own
// description, pricing and "tables" copy, which drifted from what the
// hosts wrote. This keeps the old address working.
export default function GardenIndex() {
  return <Navigate to="/communities/the-garden" replace />;
}
