// /about/agreements — the platform-wide agreements, inside the app shell
// (replaces public/about/agreements.html). See about.tsx.

import { AboutShell, AgreementList } from "./about";

export function meta() {
  return [{ title: "Community agreements — TheCreative.exchange" }];
}

export default function AboutAgreements() {
  return (
    <AboutShell>
      <h1
        style={{
          color: "var(--garden-paper)",
          fontFamily: "var(--garden-font-display)",
          fontSize: "clamp(34px, 6vw, 52px)",
          lineHeight: 1.08,
          margin: 0,
        }}
      >
        Community <span style={{ color: "var(--garden-citron)" }}>agreements.</span>
      </h1>
      <p style={{ color: "var(--garden-body)", fontSize: 18, lineHeight: 1.6, margin: "18px 0 28px" }}>
        Every community on TheCreative.exchange holds these in common.
      </p>
      <AgreementList />
      <p
        style={{
          color: "var(--garden-paper)",
          fontFamily: "var(--garden-font-display)",
          fontSize: 22,
          lineHeight: 1.35,
          margin: "40px 0 0",
        }}
      >
        Communities add their own agreements on their page.
      </p>
    </AboutShell>
  );
}
