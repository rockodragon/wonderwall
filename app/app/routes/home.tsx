import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/home";
import { api } from "../../convex/_generated/api";
import { SiteHeader } from "../components/SiteHeader";
import { WaitlistFollowUpDark } from "../components/WaitlistFollowUpDark";
import { CAMPAIGN_IMAGES, CAMPAIGN_QUOTES } from "../lib/campaign";

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
      <SiteHeader overlay />

      {/* Hero Section with Marquees */}
      <main className="relative pt-28 md:pt-24 pb-20">
        {/* Hero Content - Centered */}
        <div className="relative z-10 px-6 max-w-5xl mx-auto text-center mb-16 md:mb-20">
          <h2
            className="text-5xl md:text-6xl font-bold text-[var(--garden-paper)] leading-tight mb-5"
            style={{ fontFamily: "var(--garden-font-display)" }}
          >
            Create{" "}
            <span className="text-[var(--garden-citron)]">together.</span>
          </h2>
          <p className="mt-5 text-lg md:text-xl text-[var(--garden-body)] max-w-2xl mx-auto mb-6">
            Creatives, patrons, hosts, and community partners — all in one
            place. Every project shows who made it and who backed it.
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
                        // Send to /join with the invite pre-validated so
                        // they see tier options before creating an account.
                        navigate(`/join?invite=${inviteSlug}`);
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

      {/* The passage — sets the tone before the personas */}
      <section className=”py-16 bg-[var(--garden-ink)]”>
        <div className=”px-6 max-w-6xl mx-auto”>
          <div className=”max-w-3xl text-[var(--garden-body)] text-lg md:text-xl leading-relaxed flex flex-col gap-5”>
            <p className=”text-[var(--garden-paper)]”>Nothing here gets made alone.</p>
            <p>
              A creative posts the work. A patron backs it. A partner opens
              their doors. A host runs the table where it all started. When
              it's done, every name is on it.
            </p>
            <p>
              The Garden is the founding Christian creative community on the
              platform.
            </p>
          </div>
        </div>
      </section>

      {/* Who it's for — alternating image/text rows per persona */}
      <section className="py-16 max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-[var(--garden-paper)] mb-3">
          Who it's for
        </h2>
        <p className="text-[var(--garden-body)] mb-14 max-w-2xl">
          Four seats at the table. One room.
        </p>

        <div className="flex flex-col gap-20">
          {/* Creatives — image left */}
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <img
              src={CAMPAIGN_IMAGES.ade.src}
              alt={CAMPAIGN_IMAGES.ade.alt}
              loading="lazy"
              className="w-full aspect-[4/5] object-cover rounded-2xl bg-[var(--garden-ink-raised)]"
            />
            <div>
              <p className="text-[var(--garden-citron)] text-xs font-semibold tracking-wide uppercase mb-3">
                For creatives
              </p>
              <h3
                className="text-2xl md:text-3xl font-bold text-[var(--garden-paper)] leading-tight mb-4"
                style={{ fontFamily: "var(--garden-font-display)" }}
              >
                Show your work. Find your people. Get paid.
              </h3>
              <p className="text-[var(--garden-body)] leading-relaxed mb-6 max-w-md">
                Get found by what you make and where you are. Post paid or
                passion projects, find collaborators, and set crowdfunding
                targets with real deadlines. Join a community. Find a coach.
                When someone backs you, you keep all of it.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                <Link
                  to="/join"
                  className="px-6 py-3.5 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all text-center"
                >
                  Join as a creative
                </Link>
                <Link
                  to="/for/creatives"
                  className="px-6 py-3.5 rounded-xl font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors text-center"
                >
                  Learn more
                </Link>
              </div>
            </div>
          </div>

          {/* Patrons — image right */}
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div className="md:order-1">
              <img
                src={CAMPAIGN_IMAGES.viewing.src}
                alt={CAMPAIGN_IMAGES.viewing.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-2xl bg-[var(--garden-ink-raised)]"
              />
            </div>
            <div>
              <p className="text-[var(--garden-citron)] text-xs font-semibold tracking-wide uppercase mb-3">
                For patrons
              </p>
              <h3
                className="text-2xl md:text-3xl font-bold text-[var(--garden-paper)] leading-tight mb-4"
                style={{ fontFamily: "var(--garden-font-display)" }}
              >
                Back someone you believe in.
              </h3>
              <p className="text-[var(--garden-body)] leading-relaxed mb-6 max-w-md">
                Sponsor a project you believe in. Gift memberships to the
                creatives around you. Offer a venue, gear, an introduction —
                every kind of backing is credited, and your name goes on the
                finished work.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                <Link
                  to="/opportunities"
                  className="px-6 py-3.5 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all text-center"
                >
                  Pick someone to back
                </Link>
                <Link
                  to="/for/patrons"
                  className="px-6 py-3.5 rounded-xl font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors text-center"
                >
                  Learn more
                </Link>
              </div>
            </div>
          </div>

          {/* Hosts — image left */}
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <img
              src={CAMPAIGN_IMAGES.gallery.src}
              alt={CAMPAIGN_IMAGES.gallery.alt}
              loading="lazy"
              className="w-full aspect-[4/5] object-cover rounded-2xl bg-[var(--garden-ink-raised)]"
            />
            <div>
              <p className="text-[var(--garden-citron)] text-xs font-semibold tracking-wide uppercase mb-3">
                For hosts
              </p>
              <h3
                className="text-2xl md:text-3xl font-bold text-[var(--garden-paper)] leading-tight mb-4"
                style={{ fontFamily: "var(--garden-font-display)" }}
              >
                Bring your community. Earn from what you teach.
              </h3>
              <p className="text-[var(--garden-body)] leading-relaxed mb-6 max-w-md">
                Run a paid or free community — a cohort, a class, a creative
                table. Offer spiritual or creative coaching. You keep 90% of
                what you sell, hosting is free, and your people can apply to
                the Grant Fund.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                <Link
                  to="/for/hosts"
                  className="px-6 py-3.5 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all text-center"
                >
                  Start hosting
                </Link>
                <Link
                  to="/join"
                  className="px-6 py-3.5 rounded-xl font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors text-center"
                >
                  Join now
                </Link>
              </div>
            </div>
          </div>

          {/* Community Partners — image right */}
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div className="md:order-1">
              <img
                src={CAMPAIGN_IMAGES.opening.src}
                alt={CAMPAIGN_IMAGES.opening.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-2xl bg-[var(--garden-ink-raised)]"
              />
            </div>
            <div>
              <p className="text-[var(--garden-citron)] text-xs font-semibold tracking-wide uppercase mb-3">
                For community partners
              </p>
              <h3
                className="text-2xl md:text-3xl font-bold text-[var(--garden-paper)] leading-tight mb-4"
                style={{ fontFamily: "var(--garden-font-display)" }}
              >
                Open your doors. Your name goes on it.
              </h3>
              <p className="text-[var(--garden-body)] leading-relaxed mb-6 max-w-md">
                Churches, venues, businesses — post paid work, gift
                memberships to your creatives, or open your space. When it's
                done, everyone knows who made it possible.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                <Link
                  to="/for/partners"
                  className="px-6 py-3.5 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all text-center"
                >
                  Partner with us
                </Link>
                <Link
                  to="/for/churches"
                  className="px-6 py-3.5 rounded-xl font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors text-center"
                >
                  For churches
                </Link>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-14 text-[var(--garden-body)]">
          Or just{" "}
          <Link
            to="/opportunities"
            className="text-[var(--garden-citron)] font-semibold hover:opacity-80 transition-opacity"
          >
            see what's open right now
          </Link>
          .
        </p>
      </section>

      {/* "Create together." — the campaign atmosphere. Four frames with
          quotes, moved to the bottom so the personas land first. */}
      <section className="py-16 bg-[var(--garden-ink)]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--garden-hairline)]">
          {(["busker", "ade", "band", "gallery"] as const).map((key) => (
            <figure key={key} className="m-0 bg-[var(--garden-ink)]">
              <img
                src={CAMPAIGN_IMAGES[key].src}
                alt={CAMPAIGN_IMAGES[key].alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover bg-[var(--garden-ink-raised)]"
              />
              <figcaption className="px-4 pt-4 pb-6">
                <p
                  className="text-[var(--garden-paper)] text-lg md:text-xl leading-tight mb-1"
                  style={{ fontFamily: "var(--garden-font-display)", fontWeight: 500 }}
                >
                  "{CAMPAIGN_QUOTES[key].said}"
                </p>
                <p className="text-[var(--garden-dim)] text-xs">
                  {CAMPAIGN_QUOTES[key].who}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-[var(--garden-hairline)]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[var(--garden-dim)] text-sm">
            creatives.exchange — creatives and the people who back them, in
            one place
          </p>
          <div className="flex items-center gap-6">
            <a
              href="/about/"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] text-sm transition-colors"
            >
              About
            </a>
            <Link
              to="/legal/credits"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] text-sm transition-colors"
            >
              Credits
            </Link>
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
