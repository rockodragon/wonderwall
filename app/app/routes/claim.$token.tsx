// /claim/:token — claiming an off-platform project credit
// (docs/features/project-teams.md §3, §7 "Claim route"). Public and
// deliberately OUTSIDE the _app.tsx layout: the person holding this link
// may not have an account yet, and that layout redirects anyone signed out
// straight to /login.

import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { SiteHeader } from "../components/SiteHeader";

export function meta() {
  return [
    { title: "Claim your credit — creatives.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

// Convex surfaces a thrown ConvexError's payload on err.data, not
// err.message (same pattern as offerings.tsx's errorMessage / projects.tsx).
// getClaim's codes are blocked, expired, forbidden.
function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

export default function ClaimToken() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const claim = useQuery(
    api.garden.projectTeam.getClaim,
    token ? { token } : "skip",
  );
  const claimInvite = useMutation(api.garden.projectTeam.claimInvite);
  const [error, setError] = useState<string | null>(null);
  // Guards against firing the mutation twice — once on mount, and again if
  // this component re-renders before navigate() away completes.
  const claimed = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !token || claimed.current) return;
    claimed.current = true;
    claimInvite({ token })
      .then(({ projectId }) => {
        navigate(`/projects/${projectId}`);
      })
      .catch((err) => {
        claimed.current = false;
        setError(reasonFor(err, "This link couldn't be used."));
      });
  }, [isAuthenticated, token, claimInvite, navigate]);

  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <SiteHeader />
      <main className="px-6 pt-8 pb-24 max-w-[640px] mx-auto">
        {isLoading || claim === undefined ? (
          <p className="text-[var(--garden-dim)] text-sm">Loading…</p>
        ) : error ? (
          <>
            <h1 className="text-2xl font-bold text-[var(--garden-paper)] mb-4">
              Something went wrong
            </h1>
            <p className="text-[var(--garden-body)] leading-relaxed">
              {error}
            </p>
          </>
        ) : claim === null ? (
          <>
            <h1 className="text-2xl font-bold text-[var(--garden-paper)] mb-4">
              This link has expired or was already used.
            </h1>
            <Link
              to="/"
              className="text-[var(--garden-body)] hover:text-[var(--garden-citron)] font-medium text-sm"
            >
              Go home →
            </Link>
          </>
        ) : isAuthenticated ? (
          <p className="text-[var(--garden-dim)] text-sm">Adding you to the team…</p>
        ) : (
          <SignedOutClaim claim={claim} token={token!} />
        )}
      </main>
    </div>
  );
}

function SignedOutClaim({
  claim,
  token,
}: {
  claim: {
    projectId: string;
    projectTitle: string;
    role: string;
    leadName: string;
    leadInviteSlug: string | null;
  };
  token: string;
}) {
  useEffect(() => {
    // Stashed so _app.tsx can pick it back up and redirect here once this
    // person has an account (project-teams.md §3). Signup itself still goes
    // through the lead's normal invite link, not this token.
    try {
      localStorage.setItem("pendingClaim", token);
    } catch {
      // Private browsing / storage disabled — the person can still sign up
      // and come back to this same link manually.
    }
  }, [token]);

  return (
    <>
      <h1 className="text-3xl font-bold text-[var(--garden-paper)] mb-3 leading-tight">
        {claim.leadName} credited you on {claim.projectTitle}
      </h1>
      <p className="text-[var(--garden-body)] mb-8">as {claim.role}</p>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {claim.leadInviteSlug ? (
          <Link
            to={`/signup/${claim.leadInviteSlug}`}
            className="px-6 py-3 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all"
          >
            Sign up with {claim.leadName}'s invite
          </Link>
        ) : (
          <Link
            to="/join"
            className="px-6 py-3 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all"
          >
            Sign up
          </Link>
        )}
        <Link
          to="/login"
          className="px-6 py-3 rounded-xl font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors"
        >
          Sign in
        </Link>
      </div>
      <p className="text-[var(--garden-dim)] text-sm">
        After you sign up, you'll come back here and the credit will be added
        to your profile.
      </p>
    </>
  );
}
