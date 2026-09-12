// /join/success — where Stripe sends someone after membership checkout.
//
// createMembershipCheckout has pointed its success_url here since it was
// written; the route never existed, so anyone who actually paid landed on
// the 404 page. The membership itself is granted by the webhook, not by
// this page — so this confirms and gets out of the way, and degrades to
// "it's on its way" if the webhook hasn't landed yet.

import { useQuery } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import { GardenErrorState, GardenPage } from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "You're a member — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="We couldn't load this page — your membership isn't affected." />
      </div>
    </GardenPage>
  );
}

export default function JoinSuccess() {
  const membership = useQuery(api.garden.memberships.getMyMembership);

  return (
    <GardenPage>
      <div style={{ marginTop: 28, maxWidth: "52ch" }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          You're in.
        </h1>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          {membership
            ? "Your membership is active. Start a project, apply to paid work, or propose to the Grant Fund."
            : "Payment went through. Your membership turns on within a minute — refresh if it isn't showing yet."}
        </p>
        <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/opportunities" className="g-btn g-btn-citron">
            See what's open
          </Link>
          <Link to="/projects" className="g-btn g-btn-ghost">
            Start a project
          </Link>
        </div>
        <p className="g-hint" style={{ marginTop: 18 }}>
          Receipts and billing live in{" "}
          <Link to="/settings" style={{ textDecoration: "underline" }}>
            Settings
          </Link>
          .
        </p>
      </div>
    </GardenPage>
  );
}
