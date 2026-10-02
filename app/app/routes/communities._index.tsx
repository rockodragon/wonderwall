// /communities — shows The Garden's community page directly (Rick's
// decision: there is one community, so the directory collapses into it).
// See docs/features/community-groups.md §0 and docs/features/community-ux.md
// §5. Reuses CommunityPage from communities.$slug.tsx so every behavior on
// /communities/:slug (join, host tools, products, fund, members) keeps
// working unchanged — this route just points it at "the-garden" and appends
// two links: the about page and the host-application page.

import { useLayoutEffect } from "react";
import type React from "react";
import { useQuery } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import { FF_V2 } from "../lib/featureFlags";
import { CommunityPage } from "./communities.$slug";
import { PAGE_WIDTH } from "../lib/pageWidth";

export function meta() {
  return [
    { title: "Communities — TheCreative.exchange" },
    {
      name: "description",
      content: "Creative communities on TheCreative.exchange.",
    },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className={`p-4 sm:p-6 ${PAGE_WIDTH.list} mx-auto`}>
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
  if (!FF_V2) return null;
  return (
    <div className="mt-10 pt-6 border-t flex flex-col gap-2" style={{ borderColor: "var(--garden-hairline)" }}>
      <Link to="/communities/apply" className="text-[13.5px]" style={{ color: "var(--garden-dim)" }}>
        Apply to host your own community →
      </Link>
    </div>
  );
}

const CARD: React.CSSProperties = {
  border: "1px solid var(--garden-hairline)",
  borderRadius: 10,
  padding: "16px 18px",
  background: "var(--garden-ink-raised, #1c1c19)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

function CommunitiesIntro() {
  // The Garden's words come from its record (host tools), like the page
  // below — the same query, so it's one fetch.
  const garden = useQuery(api.garden.communities.getCommunity, { slug: "the-garden" });
  return (
    <section id="top" className={`p-4 sm:p-6 ${PAGE_WIDTH.list} mx-auto pb-0 sm:pb-0`}>
      <h1
        className="text-2xl sm:text-3xl font-semibold mb-3"
        style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
      >
        Communities
      </h1>
      <p className="text-[15px] leading-relaxed max-w-[62ch]" style={{ color: "var(--garden-body)" }}>
        The Creative Exchange is a platform for the creative economy. It helps creatives, patrons, and community
        organizations connect, collaborate, and grow.
      </p>
      <Link to="/about" className="inline-block mt-2 text-[15px]" style={{ color: "var(--garden-citron)" }}>
        About TheCreative.exchange →
      </Link>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div style={CARD}>
          <span className="text-[13.5px]" style={{ color: "var(--garden-muted)" }}>
            Coming soon
          </span>
          <b className="text-[19px]" style={{ color: "var(--garden-paper)" }}>
            The Creative Exchange
          </b>
          <span className="text-[15px]" style={{ color: "var(--garden-paper)" }}>
            Public community
          </span>
          <p className="text-[15px]" style={{ color: "var(--garden-body)" }}>
            Its base agreements set the minimum guidelines every community follows.
          </p>
          <a href="#agreements" className="text-[15px] mt-auto pt-1" style={{ color: "var(--garden-citron)" }}>
            See the base agreements below ↓
          </a>
        </div>
        <div style={{ ...CARD, border: "1px solid var(--garden-citron)", boxShadow: "inset 4px 0 0 var(--garden-citron)" }}>
          <span className="text-[13.5px]" style={{ color: "var(--garden-citron)" }}>
            Open now
          </span>
          <b className="text-[19px]" style={{ color: "var(--garden-paper)" }}>
            The Garden
          </b>
          {garden?.tagline && (
            <p className="text-[15px]" style={{ color: "var(--garden-body)" }}>
              {garden.tagline}
            </p>
          )}
          <a href="#the-garden" className="text-[15px] mt-auto pt-1" style={{ color: "var(--garden-citron)" }}>
            See The Garden below ↓
          </a>
        </div>
      </div>
      <p className="mt-3 text-[13.5px]" style={{ color: "var(--garden-muted)" }}>
        Additional communities coming soon.
      </p>
      <hr className="mt-8" style={{ borderColor: "var(--garden-hairline)" }} />
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
      <div id="the-garden" className="scroll-mt-4">
        <CommunityPage slug="the-garden" footer={<IndexFooter />} head={false} />
      </div>
    </>
  );
}
