// /admin/showcase was project voting's first address (the November 6
// showcase jury). It lives at /admin/voting now — the same page, for the
// showcase, a grant or a community fund — and this keeps old links and
// bookmarks landing there.
import { Navigate } from "react-router";

export default function AdminShowcaseRedirect() {
  return <Navigate to="/admin/voting" replace />;
}
