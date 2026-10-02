import { Navigate, useSearchParams } from "react-router";
import { PhoneShortlist } from "../components/shortlist/PhoneShortlist";
import { shortlistHref } from "../desk/deskState";
import { formatMoney } from "../garden/ui";
import { useIsDesktop } from "../hooks/useMediaQuery";
import { FF_DESK } from "../lib/featureFlags";
import { PAGE_WIDTH } from "../lib/pageWidth";
import type { ProjectKind } from "../lib/shortlist/types";
import { parseShortlistArea, parseShortlistKind, type ShortlistArea } from "../lib/shortlist/url";
import { useShortlist } from "../lib/shortlist/useShortlist";

// /favorites is the Shortlist (docs/handoff/favorites-redesign/README.md).
// On desktop it sends you to the desk's Shortlist, behind the same FF_DESK
// and breakpoint as the desk itself (today.tsx); on a phone it is the
// Shortlist page, components/shortlist/PhoneShortlist. ?area= and ?kind=
// ride along either way (lib/shortlist/url.ts), so a link to Projects or to
// Paid work lands in the same place on both. Both branches mount their own
// hooks, so the switch never changes hook order inside either one.
export default function Favorites() {
  const isDesktop = useIsDesktop();
  const [params] = useSearchParams();
  const area = parseShortlistArea(params.get("area"));
  const kind = parseShortlistKind(params.get("kind"), area);
  return FF_DESK && isDesktop ? <Navigate to={shortlistHref(area, kind)} replace /> : <FavoritesPage area={area} kind={kind} />;
}

function FavoritesPage({ area, kind }: { area: ShortlistArea | null; kind: ProjectKind | null }) {
  const state = useShortlist();

  if (state.status === "loading") {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-24">
          <div
            className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{
              borderColor: "var(--app-accent)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PhoneShortlist state={state} area={area} kind={kind} money={formatMoney} />
    </PageShell>
  );
}

// Page chrome, shared by the loading and loaded states. This is an app-shell
// page (part of the authenticated nav, not a marketing page), so its surface
// and text use the --app-* tokens and follow the OS light/dark preference the
// same way _app.tsx and search.tsx do — unlike /events and /projects, which
// stay on the fixed-dark --garden-* palette on purpose.
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--app-surface)" }}>
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className={`p-4 sm:p-6 ${PAGE_WIDTH.list} mx-auto`}>{children}</div>
    </div>
  );
}
