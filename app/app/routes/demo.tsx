// /demo layout — Garden credit-sheet chrome + persona switcher.
// Entirely client-side and Convex-free: safe to deploy, safe to demo offline.

import { Link, Outlet, useLocation } from "react-router";
import { DemoProvider, PersonaBar, useDemo } from "../garden/demo-context";
import { LEVEL_LABEL } from "../garden/capabilities";
import "../garden/garden.css";

const NAV = [
  { to: "/demo", label: "Cast" },
  { to: "/demo/join", label: "Join" },
  { to: "/demo/create", label: "Create" },
  { to: "/demo/patron", label: "Patron" },
  { to: "/demo/host", label: "Host" },
  { to: "/demo/host/dashboard", label: "Dashboard" },
  { to: "/demo/offers", label: "Offers" },
  { to: "/demo/app", label: "App" },
];

function Masthead() {
  const { persona } = useDemo();
  const { pathname } = useLocation();
  return (
    <header style={{ paddingBottom: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Link className="g-wordmark" to="/demo">
          The Garden
        </Link>
        <span className="g-label">
          {persona.name} · {LEVEL_LABEL[persona.level]}
          {persona.coveredBy ? ` · covered by ${persona.coveredBy}` : ""}
          {persona.patronRole ? " · patron" : ""}
          {persona.partnerRole ? " · partner" : ""}
        </span>
      </div>
      <hr className="g-rule-heavy" style={{ marginTop: 14 }} />
      <nav style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="g-label"
            aria-pressed={pathname === n.to}
            style={{
              textDecoration: "none",
              color: pathname === n.to ? "var(--g-citron)" : undefined,
            }}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function meta() {
  return [
    { title: "The Garden — demo" },
    { name: "robots", content: "noindex" },
  ];
}

export default function DemoLayout() {
  return (
    <DemoProvider>
      <div className="garden-root">
        <link rel="stylesheet" href="/tokens.css" />
        <link rel="stylesheet" href="/about/fonts/fonts.css" />
        <div className="g-wrap g-wrap-wide">
          <Masthead />
          <Outlet />
        </div>
        <PersonaBar />
      </div>
    </DemoProvider>
  );
}
