// /communities — shows The Garden's community page directly (Rick's
// decision: there is one community, so the directory collapses into it).
// See docs/features/community-groups.md §0 and docs/features/community-ux.md
// §5. Reuses CommunityPage from communities.$slug.tsx so every behavior on
// /communities/:slug (join, host tools, products, fund, members) keeps
// working unchanged — this route just points it at "the-garden" and appends
// two links: the about page and the host-application page.

import { Link, useRouteError } from "react-router";
import { FF_V2 } from "../lib/featureFlags";
import { CommunityPage } from "./communities.$slug";

export function meta() {
  return [
    { title: "The Garden — creatives.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1
          className="text-2xl sm:text-3xl font-semibold mb-2"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          Communities isn't live yet
        </h1>
        <p className="text-[var(--garden-body)]">Check back soon.</p>
      </div>
    </div>
  );
}

function IndexFooter() {
  return (
    <div className="mt-10 pt-6 border-t flex flex-col gap-2" style={{ borderColor: "var(--garden-hairline)" }}>
      <a href="/about/index.html" className="text-[15px]" style={{ color: "var(--garden-citron)" }}>
        About creatives.exchange →
      </a>
      {FF_V2 && (
        <Link to="/communities/apply" className="text-[13.5px]" style={{ color: "var(--garden-dim)" }}>
          Apply to host your own community →
        </Link>
      )}
    </div>
  );
}

export default function CommunitiesIndex() {
  return <CommunityPage slug="the-garden" footer={<IndexFooter />} />;
}
