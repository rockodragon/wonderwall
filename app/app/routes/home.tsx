import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/home";
import { api } from "../../convex/_generated/api";
import { Wordmark } from "../components/Wordmark";
import { WaitlistFollowUpDark } from "../components/WaitlistFollowUpDark";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "creatives.exchange - Show Your Craft, Collaborate & Find Work" },
    {
      name: "description",
      content:
        "A creative community to show your work, grow through events and sessions, collaborate, and find paid opportunities.",
    },
    {
      property: "og:title",
      content: "creatives.exchange - Show Your Craft, Collaborate & Find Work",
    },
    {
      property: "og:description",
      content:
        "A creative community to show your work, grow through events and sessions, collaborate, and find paid opportunities.",
    },
    { property: "og:type", content: "website" },
    {
      property: "og:image",
      content: "https://creatives.exchange/og-image.png",
    },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    {
      name: "twitter:image",
      content: "https://creatives.exchange/og-image.png",
    },
    { name: "twitter:card", content: "summary_large_image" },
    {
      name: "twitter:title",
      content: "creatives.exchange - Show Your Craft, Collaborate & Find Work",
    },
    {
      name: "twitter:description",
      content:
        "A creative community to show your work, grow through events and sessions, collaborate, and find paid opportunities.",
    },
  ];
}

export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSlug, setInviteSlug] = useState<string | null>(null);
  const addToWaitlist = useMutation(api.waitlist.addToWaitlist);

  // Fetch inviter info when slug is set
  const inviterInfo = useQuery(
    api.invites.getInviterInfo,
    inviteSlug ? { slug: inviteSlug } : "skip",
  );

  // Check for invite parameter in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteParam = urlParams.get("invite");
    if (inviteParam) {
      setInviteSlug(inviteParam);
      // Clean up URL
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // No longer auto-redirect - show homepage with "Go to App" button instead

  async function handleWaitlistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatus("error");
      setMessage("Please enter a valid email");
      return;
    }

    setStatus("loading");
    try {
      const result = await addToWaitlist({ email });
      setStatus("success");
      setMessage(result.message);
      setWaitlistPosition(result.position ?? null);
      setSubmittedEmail(email);
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");

    if (!inviteInput.trim()) {
      setInviteError("Please enter an invite link or code");
      return;
    }

    // Parse the invite - accept full URL or just the slug
    let slug = inviteInput.trim();

    // If it's a full URL, extract the slug
    if (slug.includes("/signup/")) {
      const match = slug.match(/\/signup\/([^/?]+)/);
      if (match) {
        slug = match[1];
      }
    } else if (slug.includes("/")) {
      // Remove any leading/trailing slashes
      slug = slug.replace(/^\/+|\/+$/g, "");
    }

    // Set slug to fetch invite info and show preview (don't navigate yet)
    if (slug) {
      setInviteSlug(slug);
    } else {
      setInviteError("Invalid invite format");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--garden-ink)] overflow-hidden">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between gap-3 max-w-7xl mx-auto">
        <h1 className="min-w-0">
          <div className="sm:hidden">
            <Wordmark size="sm" />
          </div>
          <div className="hidden sm:flex">
            <Wordmark size="lg" tagline />
          </div>
        </h1>
        <div className="flex items-center gap-4 shrink-0">
          {isAuthenticated ? (
            <Link
              to="/search"
              className="px-4 py-2 sm:px-6 sm:py-2.5 text-[14px] sm:text-base whitespace-nowrap bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all"
            >
              Go to App
            </Link>
          ) : (
            <Link
              to="/login"
              className="px-4 py-2 text-[14px] sm:text-[15px] whitespace-nowrap text-[var(--garden-body)] hover:text-[var(--garden-paper)] font-medium transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section with Marquees */}
      <main className="relative pt-28 md:pt-24 pb-20">
        {/* Hero Content - Centered */}
        <div className="relative z-10 px-6 max-w-5xl mx-auto text-center mb-16 md:mb-20">
          <h2
            className="text-5xl md:text-6xl font-bold text-[var(--garden-paper)] leading-tight mb-5"
            style={{ fontFamily: "var(--garden-font-display)" }}
          >
            Show and grow
            <br />
            your craft.
            <br />
            <span className="text-[var(--garden-citron)]">Collaborate</span>
            <br />
            & find work.
          </h2>
          <p className="mt-5 text-lg md:text-xl text-[var(--garden-body)] max-w-2xl mx-auto mb-6">
            A community for creatives and the people who support them — post
            projects, find collaborators, and grow through events and paid work.
          </p>

          {/* Closed Beta Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--garden-ink)] border border-[var(--garden-hairline)] text-[var(--garden-dim)] rounded-full text-sm font-medium mb-5">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Closed Beta • Invite Only
          </div>

          {/* The two ways in, side by side on desktop. No card chrome and no
              "Have an invite?" / "No invite yet?" labels — the placeholder and
              the button already say which is which, and the boxes were just
              nesting: the waitlist success state renders its own card
              (WaitlistFollowUpDark), so a card around it made three borders
              deep. items-start, not items-stretch, so the invite column keeps
              its own height when the waitlist grows into the follow-up form. */}
          <div
            className={
              inviteSlug ? "max-w-md mx-auto" : "max-w-4xl mx-auto"
            }
          >
            {!inviteSlug ? (
              <div className="grid gap-4 md:gap-6 md:grid-cols-2 md:items-start text-left">
                {/* Paste an invite */}
                <form onSubmit={handleInviteSubmit} className="space-y-3">
                  <input
                    type="text"
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleInviteSubmit(e);
                      }
                    }}
                    placeholder="Paste your invite code"
                    className="w-full px-5 py-4 text-base border border-[var(--garden-hairline-raised)] rounded-xl bg-[var(--garden-ink-raised)]/60 backdrop-blur-sm text-[var(--garden-paper)] placeholder-[var(--garden-muted)] focus:ring-2 focus:ring-[var(--garden-citron)] focus:border-transparent transition-all"
                  />
                  {inviteError && (
                    <p className="text-sm text-red-400">{inviteError}</p>
                  )}
                  <button
                    type="submit"
                    className="w-full px-5 py-4 text-base bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all"
                  >
                    Enter with Invite
                  </button>
                </form>

                {/* Or ask for one */}
                {status === "success" ? (
                  <div>
                    <div className="flex items-center gap-2 text-green-400">
                      <svg
                        className="w-5 h-5 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="font-semibold">You're on the list</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--garden-dim)]">
                      {message}
                    </p>
                    <WaitlistFollowUpDark
                      email={submittedEmail}
                      initialPosition={waitlistPosition}
                    />
                  </div>
                ) : (
                  <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-5 py-4 text-base border border-[var(--garden-hairline-raised)] rounded-xl bg-[var(--garden-ink-raised)]/60 backdrop-blur-sm text-[var(--garden-paper)] placeholder-[var(--garden-muted)] focus:ring-2 focus:ring-[var(--garden-hairline-raised)] focus:border-transparent transition-all"
                      disabled={status === "loading"}
                    />
                    {status === "error" && (
                      <p className="text-sm text-red-400">{message}</p>
                    )}
                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="w-full px-5 py-4 text-base bg-transparent border border-[var(--garden-hairline-raised)] text-[var(--garden-paper)] rounded-xl font-semibold hover:bg-[var(--garden-ink-raised)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {status === "loading" ? "Joining..." : "Join the Waitlist"}
                    </button>
                  </form>
                )}
              </div>
            ) : inviterInfo === undefined ? (
              // Loading state
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--garden-citron)]" />
              </div>
            ) : inviterInfo === null ? (
              // Invalid invite
              <div className="text-center py-4">
                <p className="text-sm text-red-400 mb-3">Invalid invite link</p>
                <button
                  onClick={() => {
                    setInviteSlug(null);
                    setInviteInput("");
                  }}
                  className="text-sm text-[var(--garden-citron)] hover:opacity-80 font-medium transition-colors"
                >
                  Try again
                </button>
              </div>
            ) : (
              // Show personalized invite preview
              <div className="bg-[var(--garden-ink-raised)] rounded-2xl shadow-2xl border border-[var(--garden-hairline)] overflow-hidden backdrop-blur-sm">
                <div className="bg-[var(--garden-ink)] border-b border-[var(--garden-hairline)] px-6 py-5">
                  <p className="text-[var(--garden-citron)] text-xs font-medium uppercase tracking-wide mb-1">
                    You've been invited
                  </p>
                  <h3 className="text-2xl font-bold text-[var(--garden-paper)]">
                    {inviterInfo.name} invited you to join
                  </h3>
                </div>

                <div className="p-6">
                  {/* Inviter Info */}
                  <div className="flex items-center gap-3 mb-4">
                    {inviterInfo.imageUrl ? (
                      <img
                        src={inviterInfo.imageUrl}
                        alt={inviterInfo.name}
                        className="w-14 h-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-[var(--garden-hairline-raised)] flex items-center justify-center text-[var(--garden-paper)] text-lg font-bold">
                        {inviterInfo.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="text-left flex-1">
                      <div className="font-semibold text-[var(--garden-paper)]">
                        {inviterInfo.name}
                      </div>
                      {inviterInfo.interests &&
                        inviterInfo.interests.length > 0 && (
                          <div className="text-sm text-[var(--garden-muted)]">
                            {inviterInfo.interests.join(", ")}
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Connected Members - Show who's already here */}
                  {inviterInfo.recentInvitees &&
                  inviterInfo.recentInvitees.length > 0 ? (
                    <div className="mb-4 p-4 bg-[var(--garden-ink)] border border-[var(--garden-hairline)] rounded-xl">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex -space-x-2">
                          {/* Show inviter + recent invitees */}
                          <div
                            className="w-8 h-8 rounded-full bg-[var(--garden-hairline-raised)] flex items-center justify-center text-[var(--garden-paper)] text-xs font-bold ring-2 ring-[var(--garden-ink-raised)]"
                            title={inviterInfo.name}
                          >
                            {inviterInfo.name.charAt(0).toUpperCase()}
                          </div>
                          {inviterInfo.recentInvitees.map((invitee, idx) => (
                            <div
                              key={idx}
                              className="w-8 h-8 rounded-full bg-[var(--garden-hairline-raised)] flex items-center justify-center text-[var(--garden-paper)] text-xs font-bold ring-2 ring-[var(--garden-ink-raised)]"
                              title={invitee.name}
                            >
                              {invitee.name.charAt(0).toUpperCase()}
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-[var(--garden-body)]">
                        Join{" "}
                        <span className="font-semibold">
                          {inviterInfo.name}
                        </span>
                        {inviterInfo.recentInvitees.map((invitee, idx) => (
                          <span key={idx}>
                            {idx === 0 && ", "}
                            <span className="font-semibold">
                              {invitee.name}
                            </span>
                            {idx < inviterInfo.recentInvitees.length - 1 &&
                              ", "}
                          </span>
                        ))}{" "}
                        and others on The Exchange
                      </p>
                    </div>
                  ) : (
                    <div className="mb-4 p-4 bg-[var(--garden-ink)] border border-[var(--garden-hairline)] rounded-xl">
                      <p className="text-sm text-[var(--garden-body)]">
                        Be one of the first to join{" "}
                        <span className="font-semibold text-[var(--garden-paper)]">
                          {inviterInfo.name}
                        </span>
                        's network on The Exchange
                      </p>
                    </div>
                  )}

                  {/* CTA Buttons */}
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        // Mark that user accepted invite from home page
                        sessionStorage.setItem("invite-accepted", inviteSlug);
                        navigate(`/signup/${inviteSlug}`);
                      }}
                      className="w-full px-6 py-4 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all"
                    >
                      Accept Invite & Join
                    </button>
                    <button
                      onClick={() => {
                        setInviteSlug(null);
                        setInviteInput("");
                      }}
                      className="w-full px-4 py-2 text-[var(--garden-muted)] hover:text-[var(--garden-paper)] text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Features */}
      <section className="px-6 py-20 max-w-6xl mx-auto bg-[var(--garden-ink)]">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            title="Show Your Craft"
            description="Build a portfolio that shows your work, taste, process, and availability so the right people can find you."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            }
          />
          <FeatureCard
            title="Find Work"
            description="Discover projects, commissions, and creative opportunities from organizations that value your craft and character."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            }
          />
          <FeatureCard
            title="Collaborate"
            description="Connect directly with other creatives for projects, gigs, partnerships, and shared creative practice."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            }
          />
          <FeatureCard
            title="Grow Through Events"
            description="Join interviews, podcasts, trainings, classes, workshops, and creative sessions with Christian creatives."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            }
          />
        </div>
      </section>

      {/* Who it's for — one door per constituent, see
          docs/marketing/constituent-playbook.md */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-[var(--garden-paper)] mb-3">
          Who it's for
        </h2>
        <p className="text-[var(--garden-body)] mb-10 max-w-2xl">
          Six ways in. You can always start free.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              to: "/for/creatives",
              label: "Creatives",
              line: "Find collaborators. Find paid work.",
            },
            {
              to: "/for/hosts",
              label: "Hosts",
              line: "Earn from the community you already lead.",
            },
            {
              to: "/for/patrons",
              label: "Patrons",
              line: "Support a creative you believe in.",
            },
            {
              to: "/for/churches",
              label: "Churches",
              line: "Support the creatives in your church.",
            },
            {
              to: "/for/donors",
              label: "Donors",
              line: "Support creatives. Tax-deductible.",
            },
            {
              to: "/for/partners",
              label: "Venues & businesses",
              line: "Hire a creative, or open your doors.",
            },
          ].map((d) => (
            <Link
              key={d.to}
              to={d.to}
              className="group p-6 bg-[var(--garden-ink-raised)] rounded-2xl border border-[var(--garden-hairline)] hover:border-[var(--garden-citron)] transition-all duration-300"
            >
              <h3 className="text-lg font-bold text-[var(--garden-paper)] mb-1">
                {d.label}
              </h3>
              <p className="text-[var(--garden-muted)] leading-relaxed">
                {d.line}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-[var(--garden-hairline)]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[var(--garden-dim)] text-sm">
            creatives.exchange — Show your craft, grow with others,
            collaborate, and find work
          </p>
          <div className="flex items-center gap-6">
            <a
              href="/about/"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] text-sm transition-colors"
            >
              About
            </a>
            <Link
              to="/legal/terms"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] text-sm transition-colors"
            >
              Terms
            </Link>
            <Link
              to="/legal/privacy"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] text-sm transition-colors"
            >
              Privacy
            </Link>
            <Link
              to="/login"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] text-sm transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group p-8 bg-[var(--garden-ink-raised)] rounded-2xl border border-[var(--garden-hairline)] hover:border-[var(--garden-citron)] transition-all duration-300">
      <div className="w-14 h-14 bg-[var(--garden-ink)] rounded-xl flex items-center justify-center mb-4 border border-[var(--garden-hairline)] transition-colors">
        <svg
          className="w-7 h-7 text-[var(--garden-body)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {icon}
        </svg>
      </div>
      <h3 className="text-xl font-bold text-[var(--garden-paper)] mb-3">
        {title}
      </h3>
      <p className="text-[var(--garden-muted)] leading-relaxed">{description}</p>
    </div>
  );
}
