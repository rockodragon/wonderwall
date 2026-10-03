// A community's front door at /<slug> — /sd for The Creative Exchange San
// Diego, /the-garden for The Garden (2026-09-29: communities are paths on
// the one site, so sign-in is shared; a vanity domain like createsd.org
// forwards here with a Cloudflare redirect rule). Public: it's handed to
// people with no account.
//
// Open community → its full page (communities.$slug.tsx's CommunityPage).
// Not open yet → its name and a waitlist that tags signups to it.
// Not a community → the normal 404. Static routes (/today, /events, …)
// always win over this one.

import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import { useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { CommunityPage } from "./communities.$slug";
import NotFound from "./404";
import { RichContent } from "../components/RichContent";
import { descriptionBlocks } from "../lib/descriptionBlocks";
import { stripInlineMarks } from "../lib/richText";

export function meta() {
  return [{ title: "TheCreative.exchange" }];
}

export default function CommunityLanding() {
  const { communitySlug = "" } = useParams();
  const landing = useQuery(api.garden.communityDomains.getCommunityLanding, {
    slug: communitySlug,
  });

  if (landing === undefined) {
    return <div className="min-h-screen" style={{ backgroundColor: "var(--garden-ink)" }} />;
  }
  if (landing === null) return <NotFound />;
  if (landing.open) return <CommunityPage slug={landing.slug} />;
  return <ComingSoon landing={landing} />;
}

function ComingSoon({
  landing,
}: {
  landing: {
    slug: string;
    name: string;
    tagline: string | null;
    description: string | null;
    locationLabel: string | null;
  };
}) {
  const addToWaitlist = useMutation(api.waitlist.addToWaitlist);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus("error");
      setMessage("Enter an email we can reach you at.");
      return;
    }
    setStatus("saving");
    try {
      const result = await addToWaitlist({
        email: email.trim(),
        communitySlug: landing.slug,
        host: window.location.hostname,
      });
      setStatus("done");
      setMessage(result.message);
    } catch {
      setStatus("error");
      setMessage("That didn't go through. Try again in a moment.");
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--garden-ink)" }}>
      {/* Not open yet: a waitlist, not a page to be found by. */}
      <meta name="robots" content="noindex" />
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        {landing.locationLabel && (
          <p style={{ color: "var(--garden-dim)", fontSize: 14, margin: 0 }}>
            {landing.locationLabel}
          </p>
        )}
        <h1
          style={{
            color: "var(--garden-paper)",
            fontFamily: "var(--garden-font-display)",
            fontSize: 36,
            lineHeight: 1.15,
            margin: "8px 0 0",
          }}
        >
          {landing.name}
        </h1>
        {landing.tagline && (
          <p style={{ color: "var(--garden-body)", fontSize: 18, margin: "14px 0 0" }}>
            {stripInlineMarks(landing.tagline)}
          </p>
        )}
        <RichContent blocks={descriptionBlocks(landing.description)} style={{ marginTop: 14 }} />

        <section
          className="rounded-xl"
          style={{
            marginTop: 36,
            padding: 20,
            backgroundColor: "var(--garden-ink-raised)",
            border: "1px solid var(--garden-hairline-raised)",
          }}
        >
          {status === "done" ? (
            <p style={{ color: "var(--garden-paper)", fontSize: 16, margin: 0 }}>{message}</p>
          ) : (
            <form onSubmit={submit}>
              <label
                htmlFor="waitlist-email"
                style={{ color: "var(--garden-paper)", fontSize: 16, fontWeight: 600 }}
              >
                Join the waitlist
              </label>
              <p style={{ color: "var(--garden-dim)", fontSize: 14, margin: "4px 0 14px" }}>
                We'll email you when {landing.name} opens.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="waitlist-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 rounded-lg px-3 py-2.5 outline-none"
                  style={{
                    backgroundColor: "var(--garden-ink)",
                    border: "1px solid var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                    fontSize: 15,
                  }}
                />
                <button
                  type="submit"
                  disabled={status === "saving"}
                  className="rounded-lg px-4 py-2.5 disabled:opacity-60"
                  style={{
                    backgroundColor: "var(--garden-citron)",
                    color: "#141414",
                    fontSize: 13.5,
                    fontWeight: 700,
                  }}
                >
                  {status === "saving" ? "Adding…" : "Join the waitlist"}
                </button>
              </div>
              {status === "error" && (
                <p role="alert" style={{ color: "var(--garden-paper)", fontSize: 14, margin: "10px 0 0" }}>
                  {message}
                </p>
              )}
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
