import { useAuthActions } from "@convex-dev/auth/react";
import { usePostHog } from "@posthog/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import confetti from "canvas-confetti";
import { api } from "../../convex/_generated/api";
import { normalizePhone } from "../../convex/phone";
import { normalizeInviteCode } from "../../convex/inviteCode";
import { codeRequestParams, ensureOAuthHost, oauthReturnTo } from "../lib/oauthHost";
import { AgreementsConsent } from "../components/AgreementsConsent";
import { InviteGate } from "../components/InviteGate";
import { joinWithInvite } from "../lib/joinWithInvite";
import { setPendingIntent } from "../lib/pendingIntent";
import { isCheckoutSessionId } from "../../convex/garden/ticketLink";
import { useBrand } from "../brand/brands";
import { GardenLockupThemed } from "../brand/GardenMark";

export function meta() {
  return [
    { title: "Join TheCreative.exchange" },
    {
      name: "description",
      content: "Join TheCreative.exchange, a community of creatives.",
    },
    { property: "og:title", content: "Join TheCreative.exchange" },
    {
      property: "og:description",
      content: "Join TheCreative.exchange, a community of creatives.",
    },
    { property: "og:type", content: "website" },
    {
      property: "og:image",
      content: "https://thecreative.exchange/og-image.png",
    },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    {
      name: "twitter:image",
      content: "https://thecreative.exchange/og-image.png",
    },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "Join TheCreative.exchange" },
    {
      name: "twitter:description",
      content: "Join TheCreative.exchange, a community of creatives.",
    },
  ];
}

export default function Signup() {
  const { inviteSlug } = useParams();
  const garden = useBrand() === "garden";
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();

  /** Someone still signed in (a shared device, a second account) is signed
   * out before a new account is made. Otherwise the steps that run right
   * after sign-up — joining with the invite, crediting it — go out on the
   * old session's token before the new one lands, and land on the wrong
   * account (seen 2026-10-02). Signed out, they wait for the new one. */
  async function signOutStaleSession() {
    if (isAuthenticated) await signOut();
  }
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  // Came from a page that needed an account (login's ?redirect=): go back
  // there once onboarding is done — _app.tsx replays the pending intent.
  useEffect(() => {
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    if (redirect) setPendingIntent(redirect);
  }, []);

  // Phone sign-up: mobile number -> text a code -> enter the code.
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneStep, setPhoneStep] = useState<"phone" | "code">("phone");
  // Phone code or password — both visible, both ask for name and email
  // first, because every account needs an email (receipts, notifications)
  // no matter how the person signs in.
  const [method, setMethod] = useState<"phone" | "password">("phone");
  const [phoneError, setPhoneError] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);

  // Get inviter information if arriving via invite link
  // A paid ticket's Stripe checkout session id stands in for an invite
  // (event.tsx sends ticket buyers to /signup/<session id>) — one account
  // per ticket, checked by ticketSessionOpensSignup.
  const ticketSession = isCheckoutSessionId(inviteSlug) ? inviteSlug : null;
  const inviterInfo = useQuery(
    api.invites.getInviterInfo,
    inviteSlug && !ticketSession ? { slug: inviteSlug } : "skip",
  );
  const ticketOpensSignup = useQuery(
    api.garden.eventRsvps.ticketSessionOpensSignup,
    ticketSession ? { sessionId: ticketSession } : "skip",
  );

  // The slug to credit, if any. A link whose lookup came back empty
  // (inviterInfo === null) is dropped: no credit, but they can still sign
  // up. While the lookup loads (undefined) the slug is kept and the server
  // checks it when it's redeemed.
  const inviteNotFound = !!inviteSlug && !ticketSession && inviterInfo === null;
  const creditSlug = inviteSlug && !inviteNotFound ? inviteSlug : null;
  // The optional code field shows until a code has been accepted.
  const showCodeEntry = !ticketSession && (!inviteSlug || inviteNotFound);

  const redeemInvite = useMutation(api.invites.redeemBySlug);
  const generateSlug = useMutation(api.invites.generateInviteSlug);
  const fillMissingBasics = useMutation(api.profiles.fillMissingBasics);
  const joinCommunity = useMutation(api.garden.communities.joinCommunity);

  // The community a new account joins. While it's invite-only (2026-10-02)
  // an account needs a code that opens it: a member's code we found, or an
  // unclaimed ticket. No code shows InviteGate (code box + waitlist)
  // instead of the form. The server checks the code again when they join.
  const signupCommunity = useQuery(api.garden.defaultCommunity.getSignupCommunity, {});
  const inviteOnly = !!signupCommunity?.inviteOnly;
  const inviteChecking =
    !!inviteSlug && (ticketSession ? ticketOpensSignup === undefined : inviterInfo === undefined);
  const hasInvite = ticketSession ? ticketOpensSignup === true : !!inviterInfo;
  const needsCode = inviteOnly && !inviteChecking && !hasInvite;

  /** Right after the account exists: join the invite-only community with
   * the code that opened signup, before crediting it (crediting counts
   * against the code's limit). A refusal is logged, not shown here: the
   * app's gate sends them to /invite to try another code. */
  async function joinSignupCommunity() {
    if (!inviteOnly || !signupCommunity || !inviteSlug) return;
    const refused = await joinWithInvite(joinCommunity, signupCommunity.id, inviteSlug);
    if (refused) posthog?.capture("signup_invite_join_refused", { reason: refused, invite_slug: inviteSlug });
  }

  // Sign-up is open: an invite only credits whoever sent it. The one gate
  // left is a paid ticket's checkout session (one account per ticket).
  // Returns the error message to show, or null when it's fine to proceed.
  function inviteGateError(): string | null {
    if (inviteOnly && !hasInvite) return "You need an invite code from a member to join.";
    if (!inviteSlug) return null;
    if (ticketSession) {
      if (ticketOpensSignup === undefined) return "Checking your ticket...";
      return ticketOpensSignup
        ? null
        : "We couldn't find an unclaimed ticket for this link. If you just paid, wait a minute and try again.";
    }
    return null;
  }

  // After a successful phone code verification, redeem the invite (when
  // there is one) the way oauth-callback.tsx does for Google: redeemInvite
  // then generateInviteSlug, then on to onboarding — reusing those mutations
  // rather than inventing new ones.
  async function redeemInviteAfterSignIn() {
    await joinSignupCommunity();
    if (creditSlug && !ticketSession) {
      try {
        await redeemInvite({ slug: creditSlug });
      } catch (err) {
        posthog?.capture("invite_redemption_failed", {
          error: err instanceof Error ? err.message : "Unknown error",
          invite_slug: creditSlug,
        });
      }
    }
    try {
      await generateSlug({});
    } catch (err) {
      posthog?.capture("invite_slug_generation_failed", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError("");

    const gateError = inviteGateError();
    if (gateError) {
      setPhoneError(gateError);
      return;
    }

    if (!name.trim()) {
      setPhoneError("Add your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setPhoneError("Add an email we can reach you at.");
      return;
    }

    const normalized = normalizePhone(phone);
    if (!normalized.ok) {
      setPhoneError(normalized.reason);
      return;
    }

    setPhoneLoading(true);
    try {
      await signOutStaleSession();
      await signIn("phone", { phone: normalized.value, ...codeRequestParams() });
      setPhone(normalized.value);
      setPhoneStep("code");
      posthog?.capture("phone_signup_code_sent", { invite_slug: inviteSlug });
    } catch (err) {
      setPhoneError(
        err instanceof Error ? err.message : "Couldn't send a code. Try again.",
      );
      posthog?.capture("phone_signup_code_send_error", {
        error: err instanceof Error ? err.message : "Unknown error",
        invite_slug: inviteSlug,
      });
    } finally {
      setPhoneLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError("");
    setPhoneLoading(true);

    try {
      await signIn("phone", { phone, code });

      // A phone sign-in carries no email or name; save the ones they typed.
      // signIn resolves before the Convex client is sending the new token,
      // so the first tries can fail as "not signed in". Retry a few times.
      // fillMissingBasics only fills a blank or placeholder name and a
      // missing email, so it is safe to call every time.
      let saved = false;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 8 && !saved; attempt++) {
        try {
          await fillMissingBasics({
            name: name.trim() || undefined,
            email: email.trim() || undefined,
          });
          saved = true;
        } catch (err) {
          lastError = err;
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
      if (!saved) {
        posthog?.capture("phone_signup_profile_error", {
          error: lastError instanceof Error ? lastError.message : "Unknown error",
        });
      }

      await redeemInviteAfterSignIn();

      posthog?.capture("user_signed_up", {
        method: "phone",
        invite_slug: inviteSlug,
        inviter_name: inviterInfo?.name,
      });

      setShowWelcome(true);
    } catch (err) {
      setPhoneError("That code didn't work. Check it and try again.");
      posthog?.capture("phone_signup_verify_error", {
        error: err instanceof Error ? err.message : "Unknown error",
        invite_slug: inviteSlug,
      });
      setPhoneLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const gateError = inviteGateError();
    if (gateError) {
      setError(gateError);
      return;
    }

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      // Sign up with password
      await signOutStaleSession();
      await signIn("password", {
        email,
        password,
        name,
        flow: "signUp",
      });

      // Wait a moment for Convex auth session to fully establish
      await new Promise((resolve) => setTimeout(resolve, 500));

      await joinSignupCommunity();

      // Credit the inviter, when there is one. Never blocks sign-up.
      if (creditSlug && !ticketSession) {
        try {
          await redeemInvite({ slug: creditSlug });
          console.log("✅ Successfully redeemed invite:", creditSlug);
        } catch (err) {
          console.error("❌ Failed to redeem invite:", err);
          posthog?.capture("invite_redemption_failed", {
            error: err instanceof Error ? err.message : "Unknown error",
            invite_slug: creditSlug,
          });
        }
      }

      // Generate invite slug for new user
      try {
        const newSlug = await generateSlug({});
        console.log("✅ Generated new invite slug:", newSlug);
      } catch (err) {
        console.error("❌ Failed to generate invite slug:", err);
        posthog?.capture("invite_slug_generation_failed", {
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      // Identify user and capture signup event
      posthog?.identify(email, { email, name, invite_slug: inviteSlug });
      posthog?.capture("user_signed_up", {
        email,
        name,
        invite_slug: inviteSlug,
        inviter_name: inviterInfo?.name,
      });

      // Show welcome modal
      setShowWelcome(true);
    } catch (err) {
      console.error("Signup error:", err);
      setError(err instanceof Error ? err.message : "Signup failed");
      posthog?.capture("signup_error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setError("");

    const gateError = inviteGateError();
    if (gateError) {
      setError(gateError);
      return;
    }
    if (!ensureOAuthHost()) return;

    setGoogleLoading(true);

    try {
      posthog?.capture("google_signup_initiated", {
        invite_slug: creditSlug,
        inviter_name: inviterInfo?.name,
      });

      // Pass invite slug via redirectTo URL param so it survives OAuth
      // redirect. No invite: oauth-callback still sends a new account to
      // onboarding (new=1 only marks the sign-up path; it isn't read).
      await signOutStaleSession();
      await signIn("google", {
        redirectTo: oauthReturnTo(
          creditSlug ? `/oauth-callback?invite=${encodeURIComponent(creditSlug)}` : "/oauth-callback?new=1",
        ),
      });
    } catch (err) {
      setError("Failed to sign up with Google");
      posthog?.capture("google_signup_error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setGoogleLoading(false);
    }
  }

  // Show welcome modal after successful signup
  if (showWelcome) {
    return (
      <WelcomeModal
        onContinue={() => {
          setShowWelcome(false);
          navigate("/onboarding");
        }}
      />
    );
  }

  // Show signup form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="max-w-md w-full space-y-6">
        {/* Header with logo and sign in link */}
        <div className="flex items-center justify-between mb-2">
          <Link
            to="/"
            className="text-xl font-bold text-gray-900 dark:text-white"
            aria-label={garden ? "The Garden home" : undefined}
          >
            {garden ? <GardenLockupThemed fontSize={20} /> : "TheCreative.exchange"}
          </Link>
          <Link
            to="/login"
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Sign in
          </Link>
        </div>

        {ticketSession && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <p className="font-semibold text-gray-900 dark:text-white">
              {ticketOpensSignup === false
                ? "We couldn't find an unclaimed ticket for this link."
                : "Your ticket is saved."}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {ticketOpensSignup === false
                ? "If you just paid, wait a minute and refresh. Your ticket is still good either way."
                : "Make an account and it goes on your profile, with everyone else who's going."}
            </p>
          </div>
        )}

        {inviteNotFound && (
          <div
            role="status"
            className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-lg border border-gray-200 dark:border-gray-700"
          >
            <p className="text-[13.5px] text-gray-700 dark:text-gray-300">
              {inviteOnly ? "That invite code didn't work." : "That invite link didn't work. You can still sign up."}
            </p>
          </div>
        )}

        {/* Invite-only and no code that opens it: the code box and the
            waitlist, not the form. Until we know (the community, or the
            code's lookup, still loading), nothing — no flash of a form
            that then disappears. */}
        {(signupCommunity === undefined || (inviteOnly && inviteChecking)) && <div className="h-64" />}
        {needsCode && signupCommunity && <InviteGate community={signupCommunity} signedIn={false} />}

        {/* Inviter Card */}
        {inviterInfo && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-4 mb-4">
              {inviterInfo.imageUrl ? (
                <img
                  src={inviterInfo.imageUrl}
                  alt={inviterInfo.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-white text-xl font-bold">
                  {inviterInfo.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-0.5">
                  You're invited by
                </p>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {inviterInfo.name}
                </h2>
                {inviterInfo.interests &&
                  inviterInfo.interests.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {inviterInfo.interests.join(", ")}
                    </p>
                  )}
              </div>
            </div>

            {inviterInfo.recentInvitees &&
            inviterInfo.recentInvitees.length > 0 ? (
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Also connected here:
                </p>
                <div className="space-y-2">
                  {inviterInfo.recentInvitees.map((invitee, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {invitee.imageUrl ? (
                        <img
                          src={invitee.imageUrl}
                          alt={invitee.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                          {invitee.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {invitee.name}
                        </div>
                        {invitee.interests &&
                          invitee.interests.length > 0 && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {invitee.interests.join(", ")}
                            </div>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Be one of the first to join{" "}
                  <span className="font-semibold">{inviterInfo.name}</span>'s
                  network
                </p>
              </div>
            )}
          </div>
        )}

        {/* Signup Form */}
        {signupCommunity !== undefined && !(inviteOnly && inviteChecking) && !needsCode && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
          <h1
            className={`text-2xl font-bold text-gray-900 dark:text-white ${
              showCodeEntry ? "mb-2" : "mb-6"
            }`}
          >
            Create your account
          </h1>

          {showCodeEntry && <InviteCodeEntry />}

          {phoneStep === "phone" && (
            <div className="space-y-4 mb-5">
              <div>
                <label htmlFor="name" className="block text-[13.5px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 text-[13.5px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Your name"
                  required
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-[13.5px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 text-[13.5px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div
                className="grid grid-cols-2 gap-1 rounded-lg p-1 bg-gray-100 dark:bg-gray-900"
                role="group"
                aria-label="How do you want to sign in?"
              >
                {(["phone", "password"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={method === m}
                    onClick={() => {
                      setMethod(m);
                      setError("");
                      setPhoneError("");
                    }}
                    className={`rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                      method === m
                        ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {m === "phone" ? "Text me a code" : "Use a password"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {method === "password" && phoneStep === "phone" ? null : phoneStep === "phone" ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              {phoneError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-[13.5px]">
                  {phoneError}
                </div>
              )}

              <div>
                <label
                  htmlFor="phone"
                  className="block text-[13.5px] font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Mobile number
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 text-[13.5px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(619) 555-0100"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={phoneLoading}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium text-[13.5px] hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {phoneLoading ? "Sending..." : "Text me a code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              {phoneError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-[13.5px]">
                  {phoneError}
                </div>
              )}

              <p className="text-[13.5px] text-gray-600 dark:text-gray-400">
                We texted a code to {phone}.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setPhoneStep("phone");
                    setCode("");
                    setPhoneError("");
                  }}
                  className="text-blue-600 hover:text-blue-500 font-medium"
                >
                  Use a different number
                </button>
              </p>

              <div>
                <label
                  htmlFor="code"
                  className="block text-[13.5px] font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  6-digit code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-full px-4 py-3 text-[13.5px] tracking-[0.3em] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={phoneLoading || code.length !== 6}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium text-[13.5px] hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {phoneLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          )}

          {method === "password" && phoneStep === "phone" && (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-[13.5px]">
                    {error}
                  </div>
                )}
  
                
  
                
  
                <div>
                  <label
                    htmlFor="password"
                    className="block text-[13.5px] font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 text-[13.5px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="At least 8 characters"
                    required
                  />
                </div>
  
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium text-[13.5px] hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Creating account..." : "Sign Up"}
                </button>
              </form>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-[13.5px]">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                or continue with
              </span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignUp}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm text-[13.5px] font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {googleLoading ? "Signing up..." : "Google"}
          </button>



          {/* Sits below every signup path — phone, the password form, and the
              Google button — because it has to cover whichever one is used.
              Links are public routes on purpose: there is no account yet to
              authenticate, see routes.ts. */}
          <AgreementsConsent lead="By creating an account" className="mt-6" />

          <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-blue-600 hover:text-blue-500 font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
        )}
      </div>
    </div>
  );
}

// ——— Optional invite code ————————————————————————————————————————————————
// While sign-up is open, this is only a way to credit whoever sent the
// code; while the signup community is invite-only, InviteGate takes its
// place until there's a code.
// Accepts a bare code or a pasted /signup/<code> link and lands on
// /signup/<code>, where the inviter card shows (or the "didn't work" note).

function InviteCodeEntry() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const slug = normalizeInviteCode(input);
    if (!slug) {
      setError("Paste your invite code.");
      return;
    }
    navigate(`/signup/${encodeURIComponent(slug)}`);
  }

  if (!open) {
    return (
      <p className="mb-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[13.5px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
        >
          Have an invite code?
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <label htmlFor="invite-code" className="sr-only">
        Invite code
      </label>
      <div className="flex gap-2">
        <input
          id="invite-code"
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError("");
          }}
          className="min-w-0 flex-1 px-4 py-3 text-[13.5px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Invite code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
        />
        <button
          type="submit"
          className="shrink-0 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-[13.5px] font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Use code
        </button>
      </div>
      {error && (
        <p className="mt-2 text-[13.5px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}

function WelcomeModal({ onContinue }: { onContinue: () => void }) {
  // Trigger confetti on mount
  useEffect(() => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: ReturnType<typeof setInterval> = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex p-4 z-50 overflow-y-auto">
      <div className="m-auto bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-10 text-center">
        <div className="w-24 h-24 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
          <svg
            className="w-14 h-14 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
        </div>

        <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome!
        </h2>

        <p className="text-xl text-gray-700 dark:text-gray-300 mb-6 font-medium">
          You're joining a community of{" "}
          <span className="text-blue-600 dark:text-blue-400">
            makers, dreamers, and doers
          </span>
        </p>

        <div className="space-y-4 mb-8 text-left">
          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mt-0.5">
              <svg
                className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              <strong className="text-gray-900 dark:text-white">
                Share your creative work
              </strong>{" "}
              and inspire others with your gifts
            </p>
          </div>

          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mt-0.5">
              <svg
                className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              <strong className="text-gray-900 dark:text-white">
                Wonder together
              </strong>{" "}
              by asking questions and exploring ideas with peers
            </p>
          </div>

          <div className="flex gap-3 items-start">
            <div className="w-6 h-6 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mt-0.5">
              <svg
                className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              <strong className="text-gray-900 dark:text-white">
                Find collaborators
              </strong>{" "}
              and build meaningful connections
            </p>
          </div>
        </div>

        <button
          onClick={onContinue}
          className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl text-lg"
        >
          Let's get started
        </button>
      </div>
    </div>
  );
}
