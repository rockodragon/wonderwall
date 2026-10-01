// /communities — shows The Garden's community page directly (Rick's
// decision: there is one community, so the directory collapses into it).
// See docs/features/community-groups.md §0 and docs/features/community-ux.md
// §5. Reuses CommunityPage from communities.$slug.tsx so every behavior on
// /communities/:slug (join, host tools, products, fund, members) keeps
// working unchanged — this route just points it at "the-garden" and appends
// two links: the about page and the host-application page.

import { useLayoutEffect } from "react";
import { Link, useRouteError } from "react-router";
import { FF_V2 } from "../lib/featureFlags";
import { CommunityPage } from "./communities.$slug";

export function meta() {
  return [
    { title: "The Garden — TheCreative.exchange" },
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
      <Link to="/about" className="text-[15px]" style={{ color: "var(--garden-citron)" }}>
        About TheCreative.exchange →
      </Link>
      {FF_V2 && (
        <Link to="/communities/apply" className="text-[13.5px]" style={{ color: "var(--garden-dim)" }}>
          Apply to host your own community →
        </Link>
      )}
    </div>
  );
}

function CommunitiesIntro() {
  const rows = [
    {
      name: "The Creative Exchange",
      to: "/about/agreements",
      body: "The public community for everyone. Its base agreements set the minimum guidelines every community follows.",
    },
    {
      name: "The Garden",
      to: "/communities/the-garden",
      body: "Faith-based creatives community.",
    },
  ];
  return (
    <section id="top" className="p-4 sm:p-6 max-w-7xl mx-auto pb-0 sm:pb-0">
      <h1
        className="text-2xl sm:text-3xl font-semibold mb-3"
        style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
      >
        Communities
      </h1>
      <p className="text-[15px] leading-relaxed max-w-2xl" style={{ color: "var(--garden-body)" }}>
        The Creative Exchange is a platform for the creative economy. It helps creatives, patrons, and community
        organizations connect, collaborate, and grow, with far less friction. It is owned and run by its members.
      </p>
      <ul className="mt-5 max-w-2xl flex flex-col">
        {rows.map((r) => (
          <li key={r.name} className="py-3 border-t" style={{ borderColor: "var(--garden-hairline)" }}>
            <Link to={r.to} className="text-[15px] font-medium" style={{ color: "var(--garden-citron)" }}>
              {r.name} →
            </Link>
            <p className="text-[15px] mt-1" style={{ color: "var(--garden-body)" }}>
              {r.body}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13.5px]" style={{ color: "var(--garden-muted)" }}>
        Additional communities coming soon.
      </p>
    </section>
  );
}

export default function CommunitiesIndex() {
  // Landing here from the rail's "The Exchange" button should show the intro
  // first, not wherever the previous page was scrolled to.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector("main")?.scrollTo?.(0, 0);
  }, []);
  return (
    <>
      <CommunitiesIntro />
      <CommunityPage slug="the-garden" footer={<IndexFooter />} />
    </>
  );
}
