import { useLocation, useNavigate } from "react-router";

/**
 * A detail page's back link should return to wherever the person came from
 * (a profile, Today, a search) — not always to the section's list. When
 * there's no in-app page to go back to (a shared link opened cold, where
 * React Router's first location has key "default"), it falls back to
 * `fallback`. Spread the result onto a <Link to={fallback}>: the href stays
 * real for new-tab/middle clicks, and a plain click goes back instead.
 */
export function useBack(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== "default";
  return {
    to: fallback,
    onClick: (e: React.MouseEvent) => {
      if (!canGoBack || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(-1);
    },
  };
}
