// /about and /about/agreements — inside the app shell (Rick, 2026-09-29),
// replacing the static public/about/index.html and agreements.html. The
// four audience pages (/about/creatives/ …) are still static files.
// Public: _app.tsx lists "/about" in PUBLIC_PATH_PREFIXES.

import type { ReactNode } from "react";
import { Link } from "react-router";
import { CLAIMS } from "../constants/claims";

export function meta() {
  return [
    { title: "About — TheCreative.exchange" },
    {
      name: "description",
      content:
        "Where creatives find the people who support their work — with funding, with collaboration, with a seat at a table.",
    },
    { property: "og:title", content: "TheCreative.exchange" },
    { property: "og:description", content: "Where creatives find the people who support their work." },
    { property: "og:image", content: "https://creatives.exchange/og-image.png" },
  ];
}

/** The platform-wide agreements every community holds in common. Shown on
 * /about and /about/agreements; communities add their own on their page. */
export const PLATFORM_AGREEMENTS = [
  "No harassment. No fraud.",
  "Credit your sources. If AI made any part of the work, say so on it.",
  "Put your name only on work that's yours.",
  "Each community can add its own agreements.",
  "Break these and you lose your account, in every community.",
];

const AUDIENCES = [
  {
    href: "/about/creatives",
    name: "For creatives",
    desc: `A seat, a project, and people who'll help you make it — from $10/mo. ${CLAIMS.dues}`,
    go: "Take a seat →",
  },
  {
    href: "/about/patrons",
    name: "For patrons",
    desc: "Shape the creative economy of your community — cover a seat from $10/mo, fund a Fellowship, commission a project.",
    go: "Support a creative →",
  },
  {
    href: "/about/hosts",
    name: "For hosts",
    desc: "You're a creative who leads a community. Get paid to gather the people you already gather.",
    go: "Host a table →",
  },
  {
    href: "/about/partners",
    name: "For community partners",
    desc: "Coffee shops, galleries, venues, libraries — you bring the place, creatives bring the people. Be the place it happens.",
    go: "Offer a night →",
  },
];

export function AboutShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--garden-ink)" }}>
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="px-4 sm:px-8 py-10 sm:py-14 max-w-3xl">{children}</div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2
      className="uppercase"
      style={{
        fontFamily: "var(--garden-font-mono)",
        fontSize: 12,
        letterSpacing: "0.12em",
        color: "var(--garden-dim)",
        margin: "48px 0 16px",
      }}
    >
      {children}
    </h2>
  );
}

export function AgreementList() {
  return (
    <ul className="flex flex-col gap-2.5" style={{ margin: 0, paddingLeft: 20, listStyle: "disc" }}>
      {PLATFORM_AGREEMENTS.map((a) => (
        <li key={a} style={{ color: "var(--garden-body)", fontSize: 17, lineHeight: 1.55 }}>
          {a}
        </li>
      ))}
    </ul>
  );
}

const h1Style = {
  color: "var(--garden-paper)",
  fontFamily: "var(--garden-font-display)",
  fontSize: "clamp(34px, 6vw, 52px)",
  lineHeight: 1.08,
  margin: 0,
} as const;
const ledeStyle = { color: "var(--garden-body)", fontSize: 18, lineHeight: 1.6, margin: "18px 0 0" } as const;
const statementStyle = {
  color: "var(--garden-paper)",
  fontFamily: "var(--garden-font-display)",
  fontSize: 24,
  lineHeight: 1.3,
  margin: "40px 0 0",
} as const;

export default function About() {
  return (
    <AboutShell>
      <h1 style={h1Style}>
        Nobody makes anything <span style={{ color: "var(--garden-citron)" }}>alone.</span>
      </h1>
      <p style={ledeStyle}>
        TheCreative.exchange is where creatives find the people who support their work — with funding, with
        collaboration, with a seat at a table. Sit down with people who make things. Propose the work you're
        called to. Get it made.
      </p>

      <nav className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ marginTop: 36 }}>
        {AUDIENCES.map((a) => (
          <Link
            key={a.href}
            to={a.href}
            className="flex flex-col gap-2 rounded-xl p-5 transition-colors hover:border-[var(--garden-citron)]"
            style={{ backgroundColor: "var(--garden-ink-raised)", border: "1px solid var(--garden-hairline-raised)" }}
          >
            <span style={{ color: "var(--garden-paper)", fontSize: 18, fontWeight: 600 }}>{a.name}</span>
            <span style={{ color: "var(--garden-body)", fontSize: 15, lineHeight: 1.5 }}>{a.desc}</span>
            <span style={{ color: "var(--garden-citron)", fontSize: 15, marginTop: "auto" }}>{a.go}</span>
          </Link>
        ))}
      </nav>

      <p style={statementStyle}>There is no algorithm here. You seek and you find.</p>

      <SectionLabel>Why we're here</SectionLabel>
      <p style={{ ...statementStyle, margin: 0 }}>Human creativity, in service of human flourishing.</p>
      <p style={ledeStyle}>
        Creativity is more than content. It's how people make meaning, earn a living and work through hard
        questions. TheCreative.exchange exists so creative work can serve the common good.
      </p>
      <p style={ledeStyle}>We back work that:</p>
      <ul className="flex flex-col gap-2.5" style={{ margin: "12px 0 0", paddingLeft: 20, listStyle: "disc" }}>
        {[
          "is made by people, for people",
          "strengthens the livelihoods of the people who make it",
          "gives something back to the community it comes from",
          "points toward what is true, good and beautiful",
        ].map((t) => (
          <li key={t} style={{ color: "var(--garden-body)", fontSize: 17, lineHeight: 1.55 }}>
            {t}
          </li>
        ))}
      </ul>
      <p style={ledeStyle}>Technology can amplify human creativity. It must not erase the person behind it.</p>

      <SectionLabel>Community agreements</SectionLabel>
      <AgreementList />
      <p style={{ margin: "20px 0 0" }}>
        <Link to="/about/agreements" style={{ color: "var(--garden-citron)", fontSize: 16 }}>
          Read the agreements →
        </Link>
      </p>
    </AboutShell>
  );
}
