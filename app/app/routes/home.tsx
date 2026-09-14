import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/home";
import { api } from "../../convex/_generated/api";
import { SiteHeader } from "../components/SiteHeader";
import { WaitlistFollowUpDark } from "../components/WaitlistFollowUpDark";
import { CAMPAIGN_IMAGES, CAMPAIGN_QUOTES } from "../lib/campaign";
import { Reveal } from "../hooks/useReveal";

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
      window.history.replaceState({}, "", "/");
    }
  }, []);

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

    let slug = inviteInput.trim();

    if (slug.includes("/signup/")) {
      const match = slug.match(/\/signup\/([^/?]+)/);
      if (match) {
        slug = match[1];
      }
    } else if (slug.includes("/")) {
      slug = slug.replace(/^\/+|\/+$/g, "");
    }

    if (slug) {
      setInviteSlug(slug);
    } else {
      setInviteError("Invalid invite format");
    }
  }

  const displayFont = "'Bricolage Grotesque', sans-serif";
  const monoFont = "'JetBrains Mono', monospace";

  return (
    <div className="min-h-screen bg-[var(--garden-ink)] overflow-hidden">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <SiteHeader overlay />

      {/* Hero — editorial left-aligned, 7fr/5fr grid */}
      <main className="relative pt-28 md:pt-32 pb-16 md:pb-24 px-6 md:px-14 max-w-[1280px] mx-auto">
        <div className="grid md:grid-cols-12 gap-10 md:gap-16 items-end">
          {/* Left column — headline + subtext */}
          <div className="md:col-span-7">
            <p
              className="mb-6 md:mb-7 text-[var(--garden-dim)] text-xs tracking-[0.14em] uppercase"
              style={{ fontFamily: monoFont }}
            >
              Give<span className="text-[var(--garden-citron)]">.</span>{" "}
              Receive<span className="text-[var(--garden-citron)]">.</span>{" "}
              Grow<span className="text-[var(--garden-citron)]">.</span>
            </p>
            <h1
              className="text-5xl sm:text-7xl md:text-8xl lg:text-[104px] text-[var(--garden-paper)] leading-[0.95] mb-6 md:mb-8"
              style={{
                fontFamily: displayFont,
                fontWeight: 500,
                letterSpacing: "-0.035em",
                textWrap: "balance",
              }}
            >
              Create{" "}
              <span className="text-[var(--garden-citron)]">together.</span>
            </h1>
            <p className="text-lg md:text-[22px] leading-relaxed md:leading-[1.5] text-[var(--garden-body)] max-w-[560px]" style={{ textWrap: "pretty" }}>
              Creatives, patrons, hosts, churches and venues, in one place.
              Every project shows who made it and who backed it.
            </p>
          </div>

          {/* Right column — invite + waitlist forms */}
          <div className="md:col-span-5 flex flex-col gap-7 pb-1.5">
            {!inviteSlug ? (
              <>
                <div
                  className="flex items-center gap-2 text-[var(--garden-dim)] text-xs tracking-[0.1em] uppercase"
                  style={{ fontFamily: monoFont }}
                >
                  <svg
                    className="w-3.5 h-3.5"
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
                  Closed beta · invite only
                </div>

                {/* Invite form — stacked */}
                <form
                  onSubmit={handleInviteSubmit}
                  className="flex flex-col gap-2.5"
                >
                  <input
                    type="text"
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleInviteSubmit(e);
                    }}
                    placeholder="Paste your invite code"
                    className="w-full px-[18px] py-[15px] text-base border border-[var(--garden-hairline-raised)] rounded-[10px] bg-[var(--garden-ink-raised)] text-[var(--garden-paper)] placeholder-[var(--garden-muted)] outline-none focus:border-[var(--garden-citron)] transition-colors"
                    style={{ fontFamily: "inherit" }}
                  />
                  {inviteError && (
                    <p className="text-sm text-red-400">{inviteError}</p>
                  )}
                  <button
                    type="submit"
                    className="w-full px-[18px] py-[15px] text-base bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold hover:opacity-90 transition-all cursor-pointer"
                  >
                    Enter with invite
                  </button>
                </form>

                {/* Gradient divider */}
                <div
                  className="h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, var(--garden-hairline-raised) 20%, var(--garden-hairline-raised) 80%, transparent)",
                  }}
                />

                {/* Waitlist form */}
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
                  <form
                    onSubmit={handleWaitlistSubmit}
                    className="flex gap-2.5"
                  >
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="flex-1 min-w-0 px-[18px] py-[15px] text-base border border-[var(--garden-hairline-raised)] rounded-[10px] bg-[var(--garden-ink-raised)] text-[var(--garden-paper)] placeholder-[var(--garden-muted)] outline-none focus:border-[var(--garden-hairline-raised)] transition-colors"
                      style={{ fontFamily: "inherit" }}
                      disabled={status === "loading"}
                    />
                    {status === "error" && (
                      <p className="text-sm text-red-400 absolute">{message}</p>
                    )}
                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="px-[18px] py-[15px] text-base bg-transparent border border-[var(--garden-hairline-raised)] text-[var(--garden-paper)] rounded-[10px] font-medium hover:bg-[var(--garden-ink-raised)] transition-all cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {status === "loading"
                        ? "Joining..."
                        : "Join the waitlist"}
                    </button>
                  </form>
                )}
              </>
            ) : inviterInfo === undefined ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--garden-citron)]" />
              </div>
            ) : inviterInfo === null ? (
              <div className="text-center py-4">
                <p className="text-sm text-red-400 mb-3">
                  Invalid invite link
                </p>
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
              <div className="bg-[var(--garden-ink-raised)] rounded-2xl shadow-2xl border border-[var(--garden-hairline)] overflow-hidden">
                <div className="bg-[var(--garden-ink)] border-b border-[var(--garden-hairline)] px-6 py-5">
                  <p className="text-[var(--garden-citron)] text-xs font-medium uppercase tracking-wide mb-1">
                    You've been invited
                  </p>
                  <h3 className="text-2xl font-bold text-[var(--garden-paper)]">
                    {inviterInfo.name} invited you to join
                  </h3>
                </div>
                <div className="p-6">
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
                  {inviterInfo.recentInvitees &&
                  inviterInfo.recentInvitees.length > 0 ? (
                    <div className="mb-4 p-4 bg-[var(--garden-ink)] border border-[var(--garden-hairline)] rounded-xl">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex -space-x-2">
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
                  <div className="space-y-2">
                    <button
                      onClick={() => {
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

      {/* Passage — 2-column: headline left, body right */}
      <section className="py-16 md:py-[88px] px-6 md:px-14 bg-[var(--garden-ink-raised)]">
        <Reveal className="max-w-[1280px] mx-auto grid md:grid-cols-12 gap-8 md:gap-16">
          <h2
            className="md:col-span-5 text-3xl md:text-[44px] text-[var(--garden-paper)] leading-[1.1]"
            style={{
              fontFamily: displayFont,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              textWrap: "balance",
            }}
          >
            Nothing here gets made alone.
          </h2>
          <div className="md:col-span-7 flex flex-col gap-5 text-xl leading-[1.6] text-[var(--garden-body)] md:pt-2 max-w-[600px]">
            <p>
              A creative posts the work. A patron backs it. A partner opens
              their doors. A host runs the table where it all started. When
              it's done, every name is on it.
            </p>
            <p className="text-[var(--garden-dim)]">
              The Garden is the founding Christian creative community on the
              platform.
            </p>
          </div>
        </Reveal>
      </section>

      {/* Who it's for — alternating image/text persona rows */}
      <section className="py-16 md:py-24 px-6 md:px-14 max-w-[1280px] mx-auto">
        {/* Section header — 2-column */}
        <div className="grid md:grid-cols-12 gap-6 md:gap-16 mb-14 md:mb-[72px] items-baseline">
          <h2
            className="md:col-span-5 text-4xl md:text-[56px] text-[var(--garden-paper)] leading-none"
            style={{
              fontFamily: displayFont,
              fontWeight: 500,
              letterSpacing: "-0.03em",
            }}
          >
            Who it's for
          </h2>
          <p className="md:col-span-7 text-lg md:text-xl text-[var(--garden-dim)]">
            Four seats at the table. One room.
          </p>
        </div>

        <div className="flex flex-col gap-16 md:gap-[88px]">
          {/* Creatives — image left (5fr / 7fr) */}
          <div className="grid md:grid-cols-12 gap-8 md:gap-16 items-center">
            <Reveal className="md:col-span-5">
              <img
                src={CAMPAIGN_IMAGES.ade.src}
                alt={CAMPAIGN_IMAGES.ade.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-[10px] bg-[var(--garden-ink-raised)]"
              />
            </Reveal>
            <Reveal delay={150} className="md:col-span-7 max-w-[560px]">
              <p className="text-[var(--garden-citron)] text-xs font-semibold tracking-wide uppercase mb-5">
                For creatives
              </p>
              <h3
                className="text-2xl md:text-[40px] text-[var(--garden-paper)] leading-[1.1] mb-5"
                style={{
                  fontFamily: displayFont,
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  textWrap: "balance",
                }}
              >
                Show your work. Find your people. Get paid.
              </h3>
              <p className="text-base md:text-lg leading-[1.6] text-[var(--garden-body)] mb-8" style={{ textWrap: "pretty" }}>
                Get found by what you make and where you are. Post paid or
                passion projects, find collaborators, and set crowdfunding
                targets with real deadlines. Join a community. Find a coach.
                When someone backs you, you keep all of it.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/join"
                  className="px-[22px] py-[13px] bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold text-base hover:opacity-90 transition-all"
                >
                  Join as a creative
                </Link>
                <Link
                  to="/for/creatives"
                  className="px-2 py-[13px] font-medium text-base text-[var(--garden-body)] hover:text-[var(--garden-paper)] transition-colors"
                >
                  Learn more →
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Patrons — image right (7fr / 5fr) */}
          <div className="grid md:grid-cols-12 gap-8 md:gap-16 items-center">
            <Reveal delay={150} className="md:col-span-7 max-w-[560px] md:justify-self-end order-2 md:order-none">
              <p className="text-[var(--garden-citron)] text-xs font-semibold tracking-wide uppercase mb-5">
                For patrons
              </p>
              <h3
                className="text-2xl md:text-[40px] text-[var(--garden-paper)] leading-[1.1] mb-5"
                style={{
                  fontFamily: displayFont,
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  textWrap: "balance",
                }}
              >
                Back someone you believe in.
              </h3>
              <p className="text-base md:text-lg leading-[1.6] text-[var(--garden-body)] mb-8" style={{ textWrap: "pretty" }}>
                Sponsor a project you believe in. Gift memberships to the
                creatives around you. Offer a venue, gear, an introduction —
                every kind of backing is credited, and your name goes on the
                finished work.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/opportunities"
                  className="px-[22px] py-[13px] bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold text-base hover:opacity-90 transition-all"
                >
                  Pick someone to back
                </Link>
                <Link
                  to="/for/patrons"
                  className="px-2 py-[13px] font-medium text-base text-[var(--garden-body)] hover:text-[var(--garden-paper)] transition-colors"
                >
                  Learn more →
                </Link>
              </div>
            </Reveal>
            <Reveal className="md:col-span-5 order-1 md:order-none">
              <img
                src={CAMPAIGN_IMAGES.viewing.src}
                alt={CAMPAIGN_IMAGES.viewing.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-[10px] bg-[var(--garden-ink-raised)]"
              />
            </Reveal>
          </div>

          {/* Hosts — image left (5fr / 7fr) */}
          <div className="grid md:grid-cols-12 gap-8 md:gap-16 items-center">
            <Reveal className="md:col-span-5">
              <img
                src={CAMPAIGN_IMAGES.gallery.src}
                alt={CAMPAIGN_IMAGES.gallery.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-[10px] bg-[var(--garden-ink-raised)]"
              />
            </Reveal>
            <Reveal delay={150} className="md:col-span-7 max-w-[560px]">
              <p className="text-[var(--garden-citron)] text-xs font-semibold tracking-wide uppercase mb-5">
                For hosts
              </p>
              <h3
                className="text-2xl md:text-[40px] text-[var(--garden-paper)] leading-[1.1] mb-5"
                style={{
                  fontFamily: displayFont,
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  textWrap: "balance",
                }}
              >
                Bring your community. Earn from what you teach.
              </h3>
              <p className="text-base md:text-lg leading-[1.6] text-[var(--garden-body)] mb-8" style={{ textWrap: "pretty" }}>
                Run a paid or free community — a cohort, a class, a creative
                table. Offer spiritual or creative coaching. You keep 90% of
                what you sell, hosting is free, and your people can apply to
                the Grant Fund.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/for/hosts"
                  className="px-[22px] py-[13px] bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold text-base hover:opacity-90 transition-all"
                >
                  Start hosting
                </Link>
                <Link
                  to="/join"
                  className="px-2 py-[13px] font-medium text-base text-[var(--garden-body)] hover:text-[var(--garden-paper)] transition-colors"
                >
                  Join now →
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Community Partners — image right (7fr / 5fr) */}
          <div className="grid md:grid-cols-12 gap-8 md:gap-16 items-center">
            <Reveal delay={150} className="md:col-span-7 max-w-[560px] md:justify-self-end order-2 md:order-none">
              <p className="text-[var(--garden-citron)] text-xs font-semibold tracking-wide uppercase mb-5">
                For community partners
              </p>
              <h3
                className="text-2xl md:text-[40px] text-[var(--garden-paper)] leading-[1.1] mb-5"
                style={{
                  fontFamily: displayFont,
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  textWrap: "balance",
                }}
              >
                Open your doors. Help something grow.
              </h3>
              <p className="text-base md:text-lg leading-[1.6] text-[var(--garden-body)] mb-8" style={{ textWrap: "pretty" }}>
                Churches, venues, businesses — post paid work, gift
                memberships to your creatives, or open your space. When it's
                done, everyone knows who made it possible.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/for/partners"
                  className="px-[22px] py-[13px] bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold text-base hover:opacity-90 transition-all"
                >
                  Partner with us
                </Link>
                <Link
                  to="/for/churches"
                  className="px-2 py-[13px] font-medium text-base text-[var(--garden-body)] hover:text-[var(--garden-paper)] transition-colors"
                >
                  For churches →
                </Link>
              </div>
            </Reveal>
            <Reveal className="md:col-span-5 order-1 md:order-none">
              <img
                src={CAMPAIGN_IMAGES.opening.src}
                alt={CAMPAIGN_IMAGES.opening.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-[10px] bg-[var(--garden-ink-raised)]"
              />
            </Reveal>
          </div>
        </div>

        <p className="mt-14 md:mt-[72px] text-lg text-[var(--garden-dim)]">
          Or just{" "}
          <Link
            to="/opportunities"
            className="text-[var(--garden-citron)] font-medium hover:opacity-80 transition-opacity"
          >
            see what's open right now
          </Link>
          .
        </p>
      </section>

      {/* Campaign atmosphere — 4-column image/quote grid */}
      <section className="px-6 md:px-14 pb-16 md:pb-24 max-w-[1280px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {(["busker", "ade", "band", "gallery"] as const).map((key, i) => (
            <Reveal key={key} delay={i * 120}>
              <figure className="m-0">
                <img
                  src={CAMPAIGN_IMAGES[key].src}
                  alt={CAMPAIGN_IMAGES[key].alt}
                  loading="lazy"
                  className="w-full aspect-[4/5] object-cover rounded-[10px] bg-[var(--garden-ink-raised)] mb-[18px]"
                />
                <figcaption>
                  <p
                    className="text-[var(--garden-paper)] text-lg md:text-xl leading-[1.3] mb-2"
                    style={{
                      fontFamily: displayFont,
                      fontWeight: 500,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    "{CAMPAIGN_QUOTES[key].said}"
                  </p>
                  <p
                    className="text-[var(--garden-dim)] text-[13px]"
                    style={{ fontFamily: monoFont }}
                  >
                    {CAMPAIGN_QUOTES[key].who}
                  </p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-14 py-7 border-t border-[var(--garden-hairline)]">
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-[var(--garden-dim)]">
          <p>
            creatives.exchange — creatives and the people who back them, in
            one place
          </p>
          <div className="flex items-center gap-6">
            <a
              href="/about/"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
            >
              About
            </a>
            <Link
              to="/legal/credits"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
            >
              Credits
            </Link>
            <Link
              to="/legal/terms"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
            >
              Terms
            </Link>
            <Link
              to="/legal/privacy"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
            >
              Privacy
            </Link>
            <Link
              to="/login"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
