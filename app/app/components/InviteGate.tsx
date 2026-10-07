// What someone without an invite sees when the community new accounts join
// is invite-only (2026-10-02): a member's code gets you in; no code puts
// you on the waitlist, and an admin's approval emails you one
// (convex/waitlist.ts approveEntry). Two places use it: the signup page
// before an account exists (a code goes on to /signup/<code>), and /invite
// for someone signed in who isn't a member yet (a code joins right here).

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { normalizeInviteCode } from "../../convex/inviteCode";
import { isCheckoutSessionId } from "../../convex/garden/ticketLink";
import { joinWithInvite } from "../lib/joinWithInvite";
import { rememberedInvite } from "../lib/carriedInvite";
import { takePendingIntent } from "../lib/pendingIntent";
import { AgreementsConsent } from "./AgreementsConsent";

const inputClass =
  "flex-1 min-w-0 px-4 py-3 text-[13.5px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const buttonClass =
  "px-4 py-3 rounded-lg text-[13.5px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed";

export function InviteGate({
  community,
  signedIn,
}: {
  community: { id: Id<"hostOrgs">; slug: string; name: string };
  signedIn: boolean;
}) {
  const navigate = useNavigate();
  const { signOut } = useAuthActions();
  const join = useMutation(api.garden.communities.joinCommunity);
  const redeemInvite = useMutation(api.invites.redeemBySlug);
  const addToWaitlist = useMutation(api.waitlist.addToWaitlist);

  const [code, setCode] = useState("");
  // A code a shared link left in this browser is filled in (lib/carriedInvite.ts),
  // after the first paint so a prerendered page matches.
  useEffect(() => {
    const carried = rememberedInvite();
    if (carried) setCode((typed) => typed || carried);
  }, []);
  const [codeError, setCodeError] = useState("");
  const [joining, setJoining] = useState(false);

  const [email, setEmail] = useState("");
  const [waitlist, setWaitlist] = useState<{ state: "idle" | "saving" | "done" | "error"; message: string }>({
    state: "idle",
    message: "",
  });

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    const slug = normalizeInviteCode(code);
    if (!slug) {
      setCodeError("Paste your invite code.");
      return;
    }
    if (!signedIn) {
      navigate(`/signup/${encodeURIComponent(slug)}`);
      return;
    }
    setJoining(true);
    setCodeError("");
    const failed = await joinWithInvite(join, community.id, slug);
    if (failed) {
      setCodeError(failed);
      setJoining(false);
      return;
    }
    // Credit whoever sent it, as signup does; never blocks getting in.
    if (!isCheckoutSessionId(slug)) {
      try {
        await redeemInvite({ slug });
      } catch {
        // Over their credit limit or already credited — they're in either way.
      }
    }
    navigate(takePendingIntent() ?? "/today", { replace: true });
  }

  async function submitWaitlist(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setWaitlist({ state: "error", message: "Enter an email we can reach you at." });
      return;
    }
    setWaitlist({ state: "saving", message: "" });
    try {
      const result = await addToWaitlist({
        email: email.trim(),
        communitySlug: community.slug,
        host: window.location.hostname,
      });
      setWaitlist({ state: "done", message: result.message });
    } catch {
      setWaitlist({ state: "error", message: "That didn't go through. Try again in a moment." });
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{community.name} is invite-only</h1>
      <p className="mt-2 text-[13.5px] text-gray-600 dark:text-gray-400">
        Use a member's invite code, or join the waitlist and we'll email you one.
      </p>

      <form onSubmit={submitCode} className="mt-6">
        <label htmlFor="gate-code" className="block text-[13.5px] font-medium text-gray-700 dark:text-gray-300 mb-1">
          Invite code
        </label>
        <div className="flex gap-2">
          <input
            id="gate-code"
            type="text"
            autoComplete="off"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError("");
            }}
            className={inputClass}
          />
          <button type="submit" disabled={joining} className={buttonClass}>
            {joining ? "Checking…" : "Continue"}
          </button>
        </div>
        {codeError && (
          <p role="alert" className="mt-2 text-[13.5px] text-red-600 dark:text-red-400">
            {codeError}
          </p>
        )}
        {signedIn && <AgreementsConsent lead="By joining" className="mt-3" />}
      </form>

      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        {waitlist.state === "done" ? (
          <p className="text-[13.5px] text-gray-700 dark:text-gray-300">{waitlist.message}</p>
        ) : (
          <form onSubmit={submitWaitlist}>
            <label htmlFor="gate-email" className="block text-[13.5px] font-medium text-gray-700 dark:text-gray-300 mb-1">
              No code? Join the waitlist
            </label>
            <div className="flex gap-2">
              <input
                id="gate-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
              <button type="submit" disabled={waitlist.state === "saving"} className={buttonClass}>
                {waitlist.state === "saving" ? "Adding…" : "Join the waitlist"}
              </button>
            </div>
            {waitlist.state === "error" && (
              <p role="alert" className="mt-2 text-[13.5px] text-red-600 dark:text-red-400">
                {waitlist.message}
              </p>
            )}
          </form>
        )}
      </div>

      {signedIn && (
        <p className="mt-6 text-center text-[13.5px]">
          <button
            type="button"
            onClick={() => void signOut().then(() => navigate("/"))}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Sign out
          </button>
        </p>
      )}
    </div>
  );
}
